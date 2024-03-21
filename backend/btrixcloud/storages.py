"""
Storage API
"""

from typing import (
    Optional,
    Iterator,
    Iterable,
    List,
    Dict,
    AsyncIterator,
    TYPE_CHECKING,
    Any,
)
from urllib.parse import urlsplit
from contextlib import asynccontextmanager
from itertools import chain

import asyncio
import heapq
import zlib
import json
import os

from datetime import datetime
from zipfile import ZipInfo

from fastapi import Depends, HTTPException
from stream_zip import stream_zip, NO_COMPRESSION_64
from remotezip import RemoteZip

import aiobotocore.session
import boto3

from mypy_boto3_s3.client import S3Client
from mypy_boto3_s3.type_defs import CompletedPartTypeDef
from types_aiobotocore_s3 import S3Client as AIOS3Client

from .models import (
    CrawlFile,
    CrawlFileOut,
    Organization,
    StorageRef,
    S3Storage,
    S3StorageIn,
    OrgStorageRefs,
)

from .utils import is_bool, slug_from_name


if TYPE_CHECKING:
    from .orgs import OrgOps
    from .crawlmanager import CrawlManager
else:
    OrgOps = CrawlManager = object

CHUNK_SIZE = 1024 * 256


# ============================================================================
# pylint: disable=broad-except,raise-missing-from
class StorageOps:
    """All storage handling, download/upload operations"""

    default_storages: Dict[str, S3Storage] = {}

    default_primary: Optional[StorageRef] = None

    default_replicas: List[StorageRef] = []

    org_ops: OrgOps
    crawl_manager: CrawlManager

    is_local_minio: bool
    frontend_origin: str

    def __init__(self, org_ops, crawl_manager) -> None:
        self.org_ops = org_ops
        self.crawl_manager = crawl_manager

        self.is_local_minio = is_bool(os.environ.get("IS_LOCAL_MINIO"))

        frontend_origin = os.environ.get(
            "FRONTEND_ORIGIN", "http://browsertrix-cloud-frontend"
        )
        default_namespace = os.environ.get("DEFAULT_NAMESPACE", "default")
        self.frontend_origin = f"{frontend_origin}.{default_namespace}"

        with open(os.environ["STORAGES_JSON"], encoding="utf-8") as fh:
            storage_list = json.loads(fh.read())

        for storage in storage_list:
            name = storage.get("name")
            name = slug_from_name(name)
            type_ = storage.get("type", "s3")
            if type_ == "s3":
                self.default_storages[name] = self._create_s3_storage(storage)
            else:
                # expand when additional storage options are supported
                raise TypeError("Only s3 storage supported for now")

            if storage.get("is_default_primary"):
                if self.default_primary:
                    raise TypeError("Only one default primary storage can be specified")

                self.default_primary = StorageRef(name=name)

            if storage.get("is_default_replica"):
                self.default_replicas.append(StorageRef(name=name))

        if not self.default_primary:
            num_storages = len(self.default_storages)
            if num_storages == 1:
                self.default_primary = StorageRef(
                    name=list(self.default_storages.keys())[0]
                )
            elif num_storages == 0:
                raise TypeError("No storages specified in 'storages' key")
            else:
                raise TypeError(
                    "Multiple storages found -- set 'is_default_primary: True'"
                    "to indicate which storage should be considered default primary"
                )

        self.org_ops.set_default_primary_storage(self.default_primary)

    def _create_s3_storage(self, storage: dict[str, str]) -> S3Storage:
        """create S3Storage object"""
        endpoint_url = storage["endpoint_url"]
        bucket_name = storage.get("bucket_name")
        endpoint_no_bucket_url = endpoint_url
        if bucket_name:
            endpoint_url += bucket_name + "/"

        if self.is_local_minio:
            access_endpoint_url = "/data/"
            use_access_for_presign = False
        else:
            access_endpoint_url = storage.get("access_endpoint_url") or endpoint_url
            use_access_for_presign = True

        return S3Storage(
            access_key=storage["access_key"],
            secret_key=storage["secret_key"],
            region=storage.get("region", ""),
            endpoint_url=endpoint_url,
            endpoint_no_bucket_url=endpoint_no_bucket_url,
            access_endpoint_url=access_endpoint_url,
            use_access_for_presign=use_access_for_presign,
        )

    async def add_custom_storage(
        self, storagein: S3StorageIn, org: Organization
    ) -> dict:
        """Add new custom storage"""
        name = "!" + slug_from_name(storagein.name)

        if name in org.customStorages:
            raise HTTPException(status_code=400, detail="storage_already_exists")

        bucket_name = storagein.bucket
        endpoint_url = storagein.endpoint_url
        endpoint_no_bucket_url = endpoint_url
        if bucket_name:
            endpoint_url += bucket_name + "/"

        storage = S3Storage(
            access_key=storagein.access_key,
            secret_key=storagein.secret_key,
            region=storagein.region,
            endpoint_url=endpoint_url,
            endpoint_no_bucket_url=endpoint_no_bucket_url,
            access_endpoint_url=storagein.access_endpoint_url or storagein.endpoint_url,
            use_access_for_presign=True,
        )

        try:
            await self.verify_storage_upload(storage, ".btrix-upload-verify")
        except:
            raise HTTPException(
                status_code=400,
                detail="Could not verify custom storage. Check credentials are valid?",
            )

        org.customStorages[name] = storage

        string_data = {
            "TYPE": "s3",
            "STORE_ENDPOINT_URL": storage.endpoint_url,
            "STORE_ENDPOINT_NO_BUCKET_URL": storage.endpoint_no_bucket_url,
            "STORE_ACCESS_KEY": storage.access_key,
            "STORE_SECRET_KEY": storage.secret_key,
        }

        await self.crawl_manager.add_org_storage(
            StorageRef(name=name, custom=True), string_data, str(org.id)
        )

        await self.org_ops.update_custom_storages(org)

        return {"added": True, "name": name}

    async def remove_custom_storage(
        self, name: str, org: Organization
    ) -> dict[str, bool]:
        """remove custom storage"""
        if org.storage.custom and org.storage.name == name:
            raise HTTPException(status_code=400, detail="storage_in_use")

        for replica in org.storageReplicas:
            if replica.custom and replica.name == name:
                raise HTTPException(status_code=400, detail="storage_in_use")

        await self.crawl_manager.remove_org_storage(
            StorageRef(name=name, custom=True), str(org.id)
        )

        try:
            del org.customStorages[name]
        except:
            raise HTTPException(status_code=400, detail="no_such_storage")

        await self.org_ops.update_custom_storages(org)

        return {"deleted": True}

    async def update_storage_refs(
        self,
        storage_refs: OrgStorageRefs,
        org: Organization,
    ) -> dict[str, bool]:
        """update storage for org"""

        try:
            self.get_org_storage_by_ref(org, storage_refs.storage)

            for replica in storage_refs.storageReplicas:
                self.get_org_storage_by_ref(org, replica)

        except:
            raise HTTPException(status_code=400, detail="invalid_storage_ref")

        org.storage = storage_refs.storage
        org.storageReplicas = storage_refs.storageReplicas

        await self.org_ops.update_storage_refs(org)

        return {"updated": True}

    def get_available_storages(self, org: Organization) -> List[StorageRef]:
        """return a list of available default + custom storages"""
        refs: List[StorageRef] = []
        for name in self.default_storages:
            refs.append(StorageRef(name=name, custom=False))
        for name in org.customStorages:
            refs.append(StorageRef(name=name, custom=True))
        return refs

    @asynccontextmanager
    async def get_s3_client(
        self, storage: S3Storage, use_access=False
    ) -> AsyncIterator[tuple[AIOS3Client, str, str]]:
        """context manager for s3 client"""
        endpoint_url = (
            storage.endpoint_url if not use_access else storage.access_endpoint_url
        )
        if not endpoint_url.endswith("/"):
            endpoint_url += "/"

        parts = urlsplit(endpoint_url)
        bucket, key = parts.path[1:].split("/", 1)

        endpoint_url = parts.scheme + "://" + parts.netloc

        session = aiobotocore.session.get_session()

        async with session.create_client(
            "s3",
            region_name=storage.region,
            endpoint_url=endpoint_url,
            aws_access_key_id=storage.access_key,
            aws_secret_access_key=storage.secret_key,
        ) as client:
            yield client, bucket, key

    @asynccontextmanager
    async def get_sync_client(
        self, org: Organization
    ) -> AsyncIterator[tuple[S3Client, str, str]]:
        """context manager for s3 client"""
        storage = self.get_org_primary_storage(org)

        endpoint_url = storage.endpoint_url

        if not endpoint_url.endswith("/"):
            endpoint_url += "/"

        parts = urlsplit(endpoint_url)
        bucket, key = parts.path[1:].split("/", 1)

        endpoint_url = parts.scheme + "://" + parts.netloc

        try:
            client = boto3.client(
                "s3",
                region_name=storage.region,
                endpoint_url=endpoint_url,
                aws_access_key_id=storage.access_key,
                aws_secret_access_key=storage.secret_key,
            )
            yield client, bucket, key
        finally:
            client.close()

    async def verify_storage_upload(self, storage: S3Storage, filename: str) -> None:
        """Test credentials and storage endpoint by uploading an empty test file"""

        async with self.get_s3_client(storage) as (client, bucket, key):
            key += filename
            data = b""

            resp = await client.put_object(Bucket=bucket, Key=key, Body=data)
            assert resp["ResponseMetadata"]["HTTPStatusCode"] == 200

    def resolve_internal_access_path(self, path):
        """Resolve relative path for internal access to minio bucket"""
        if path.startswith("/"):
            return self.frontend_origin + path
        return path

    def get_org_relative_path(
        self, org: Organization, ref: StorageRef, file_path: str
    ) -> str:
        """get relative path for file"""
        storage = self.get_org_storage_by_ref(org, ref)
        if file_path.startswith(storage.endpoint_url):
            return file_path[len(storage.endpoint_url) :]

        return file_path

    def get_org_primary_storage(self, org: Organization) -> S3Storage:
        """get org primary storage, from either defaults or org custom storage"""

        return self.get_org_storage_by_ref(org, org.storage)

    def get_org_replicas_storage_refs(self, org: Organization) -> List[StorageRef]:
        """get org replicas storages, defaulting to default replicas if none found"""

        if org.storageReplicas:
            return org.storageReplicas
        return self.default_replicas

    def get_org_storage_by_ref(self, org: Organization, ref: StorageRef) -> S3Storage:
        """Get a storage object from StorageRef"""
        if not ref.custom:
            s3storage = self.default_storages.get(ref.name)
        elif not org.storage:
            raise KeyError(
                f"Referencing custom org storage: {ref.name}, but no custom storage found!"
            )
        else:
            s3storage = org.customStorages.get(ref.name)

        if not s3storage:
            raise KeyError(
                f"No {'custom' if ref.custom else 'default'} storage with name: {ref.name}"
            )

        return s3storage

    async def do_upload_single(
        self,
        org: Organization,
        filename: str,
        data,
    ) -> None:
        """do upload to specified key"""
        s3storage = self.get_org_primary_storage(org)

        async with self.get_s3_client(s3storage) as (client, bucket, key):
            key += filename

            await client.put_object(Bucket=bucket, Key=key, Body=data)

    # pylint: disable=too-many-arguments,too-many-locals
    async def do_upload_multipart(
        self,
        org: Organization,
        filename: str,
        file_: AsyncIterator,
        min_size: int,
    ) -> bool:
        """do upload to specified key using multipart chunking"""
        s3storage = self.get_org_primary_storage(org)

        async def get_next_chunk(file_, min_size) -> bytes:
            total = 0
            bufs = []

            async for chunk in file_:
                bufs.append(chunk)
                total += len(chunk)

                if total >= min_size:
                    break

            if len(bufs) == 1:
                return bufs[0]
            return b"".join(bufs)

        async with self.get_s3_client(s3storage) as (client, bucket, key):
            key += filename

            mup_resp = await client.create_multipart_upload(
                ACL="bucket-owner-full-control", Bucket=bucket, Key=key
            )

            upload_id = mup_resp["UploadId"]

            parts = []
            part_number = 1

            try:
                while True:
                    chunk = await get_next_chunk(file_, min_size)

                    resp = await client.upload_part(
                        Bucket=bucket,
                        Body=chunk,
                        UploadId=upload_id,
                        PartNumber=part_number,
                        Key=key,
                    )

                    print(
                        f"part added: {part_number} {len(chunk)} {upload_id}",
                        flush=True,
                    )

                    part: CompletedPartTypeDef = {
                        "PartNumber": part_number,
                        "ETag": resp["ETag"],
                    }

                    parts.append(part)

                    part_number += 1

                    if len(chunk) < min_size:
                        break

                await client.complete_multipart_upload(
                    Bucket=bucket,
                    Key=key,
                    UploadId=upload_id,
                    MultipartUpload={"Parts": parts},
                )

                print(f"Multipart upload succeeded: {upload_id}")

                return True
            # pylint: disable=broad-exception-caught
            except Exception as exc:
                await client.abort_multipart_upload(
                    Bucket=bucket, Key=key, UploadId=upload_id
                )

                print(exc)
                print(f"Multipart upload failed: {upload_id}")

                return False

    async def get_presigned_url(
        self, org: Organization, crawlfile: CrawlFile, duration=3600
    ) -> str:
        """generate pre-signed url for crawl file"""

        s3storage = self.get_org_storage_by_ref(org, crawlfile.storage)

        async with self.get_s3_client(s3storage, s3storage.use_access_for_presign) as (
            client,
            bucket,
            key,
        ):
            key += crawlfile.filename

            presigned_url = await client.generate_presigned_url(
                "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=duration
            )

            if (
                not s3storage.use_access_for_presign
                and s3storage.access_endpoint_url
                and s3storage.access_endpoint_url != s3storage.endpoint_url
            ):
                presigned_url = presigned_url.replace(
                    s3storage.endpoint_url, s3storage.access_endpoint_url
                )

        return presigned_url

    async def delete_crawl_file_object(
        self, org: Organization, crawlfile: CrawlFile
    ) -> bool:
        """delete crawl file from storage."""
        return await self._delete_file(org, crawlfile.filename, crawlfile.storage)

    async def _delete_file(
        self, org: Organization, filename: str, storage: StorageRef
    ) -> bool:
        """delete specified file from storage"""
        status_code = None

        s3storage = self.get_org_storage_by_ref(org, storage)

        async with self.get_s3_client(s3storage) as (
            client,
            bucket,
            key,
        ):
            key += filename
            response = await client.delete_object(Bucket=bucket, Key=key)
            status_code = response["ResponseMetadata"]["HTTPStatusCode"]

        return status_code == 204

    async def sync_stream_wacz_pages(
        self, wacz_files: List[CrawlFileOut]
    ) -> Iterator[Dict[Any, Any]]:
        """Return stream of pages specified WACZ"""
        loop = asyncio.get_event_loop()

        resp = await loop.run_in_executor(None, self._sync_get_pages, wacz_files)

        return resp

    async def sync_stream_wacz_logs(
        self,
        wacz_files: List[CrawlFileOut],
        log_levels: List[str],
        contexts: List[str],
    ) -> Iterator[bytes]:
        """Return filtered stream of logs from specified WACZs sorted by timestamp"""
        loop = asyncio.get_event_loop()

        resp = await loop.run_in_executor(
            None,
            self._sync_get_logs,
            wacz_files,
            log_levels,
            contexts,
        )

        return resp

    def _sync_get_logs(
        self,
        wacz_files: List[CrawlFileOut],
        log_levels: List[str],
        contexts: List[str],
    ) -> Iterator[bytes]:
        """Generate filtered stream of logs from specified WACZs sorted by timestamp"""

        # pylint: disable=too-many-function-args
        def stream_log_lines(
            log_zipinfo: ZipInfo, wacz_url: str, wacz_filename: str
        ) -> Iterator[dict]:
            """Pass lines as json objects"""
            filename = log_zipinfo.filename

            print(f"Fetching log {filename} from {wacz_filename}", flush=True)

            line_iter: Iterator[bytes] = self._sync_get_filestream(wacz_url, filename)
            for line in line_iter:
                yield _parse_json(line.decode("utf-8", errors="ignore"))

        def stream_json_lines(
            iterator: Iterable[dict], log_levels: List[str], contexts: List[str]
        ) -> Iterator[bytes]:
            """Yield parsed JSON dicts as JSON-lines bytes after filtering as necessary"""
            for line_dict in iterator:
                if log_levels and line_dict["logLevel"] not in log_levels:
                    continue
                if contexts and line_dict["context"] not in contexts:
                    continue
                json_str = json.dumps(line_dict, ensure_ascii=False) + "\n"
                yield json_str.encode("utf-8")

        def organize_based_on_instance_number(
            wacz_files: List[CrawlFileOut],
        ) -> List[List[CrawlFileOut]]:
            """Place wacz_files into their own list based on instance number"""
            wacz_files.sort(key=lambda file: file.name)
            waczs_groups: Dict[str, List[CrawlFileOut]] = {}
            for file in wacz_files:
                instance_number = file.name[
                    file.name.rfind("-") + 1 : file.name.rfind(".")
                ]
                if instance_number in waczs_groups:
                    waczs_groups[instance_number].append(file)
                else:
                    waczs_groups[instance_number] = [file]
            return list(waczs_groups.values())

        log_generators: List[Iterator[dict]] = []

        waczs_groups = organize_based_on_instance_number(wacz_files)
        for instance_list in waczs_groups:
            wacz_log_streams: List[Iterator[dict]] = []

            for wacz_file in instance_list:
                wacz_url = self.resolve_internal_access_path(wacz_file.path)
                with RemoteZip(wacz_url) as remote_zip:
                    log_files: List[ZipInfo] = [
                        f
                        for f in remote_zip.infolist()
                        if f.filename.startswith("logs/") and not f.is_dir()
                    ]
                    log_files.sort(key=lambda log_zipinfo: log_zipinfo.filename)

                    for log_zipinfo in log_files:
                        wacz_log_streams.append(
                            stream_log_lines(log_zipinfo, wacz_url, wacz_file.name)
                        )

            log_generators.append(chain(*wacz_log_streams))

        heap_iter = heapq.merge(*log_generators, key=lambda entry: entry["timestamp"])

        return stream_json_lines(heap_iter, log_levels, contexts)

    def _sync_get_pages(
        self,
        wacz_files: List[CrawlFileOut],
    ) -> Iterator[Dict[Any, Any]]:
        """Generate stream of page dicts from specified WACZs"""

        # pylint: disable=too-many-function-args
        def stream_page_lines(
            pagefile_zipinfo: ZipInfo, wacz_url: str, wacz_filename: str
        ) -> Iterator[Dict[Any, Any]]:
            """Pass lines as json objects"""
            filename = pagefile_zipinfo.filename

            print(
                f"Fetching JSON lines from {filename} in {wacz_filename}",
                flush=True,
            )

            line_iter: Iterator[bytes] = self._sync_get_filestream(wacz_url, filename)
            for line in line_iter:
                yield _parse_json(line.decode("utf-8", errors="ignore"))

        page_generators: List[Iterator[Dict[Any, Any]]] = []

        for wacz_file in wacz_files:
            wacz_url = self.resolve_internal_access_path(wacz_file.path)
            with RemoteZip(wacz_url) as remote_zip:
                page_files: List[ZipInfo] = [
                    f
                    for f in remote_zip.infolist()
                    if f.filename.startswith("pages/")
                    and f.filename.endswith(".jsonl")
                    and not f.is_dir()
                ]
                for pagefile_zipinfo in page_files:
                    page_generators.append(
                        stream_page_lines(pagefile_zipinfo, wacz_url, wacz_file.name)
                    )

        return chain.from_iterable(page_generators)

    def _sync_get_filestream(self, wacz_url: str, filename: str) -> Iterator[bytes]:
        """Return iterator of lines in remote file as bytes"""
        with RemoteZip(wacz_url) as remote_zip:
            with remote_zip.open(filename) as file_stream:
                yield from file_stream

    def _sync_dl(
        self, all_files: List[CrawlFileOut], client: S3Client, bucket: str, key: str
    ) -> Iterator[bytes]:
        """generate streaming zip as sync"""
        for file_ in all_files:
            file_.path = file_.name

        datapackage = {
            "profile": "multi-wacz-package",
            "resources": [file_.dict() for file_ in all_files],
        }
        datapackage_bytes = json.dumps(datapackage).encode("utf-8")

        def get_file(name) -> Iterator[bytes]:
            response = client.get_object(Bucket=bucket, Key=key + name)
            return response["Body"].iter_chunks(chunk_size=CHUNK_SIZE)

        def member_files():
            modified_at = datetime(year=1980, month=1, day=1)
            perms = 0o664
            for file_ in all_files:
                yield (
                    file_.name,
                    modified_at,
                    perms,
                    NO_COMPRESSION_64(file_.size, file_.crc32),
                    get_file(file_.name),
                )

            yield (
                "datapackage.json",
                modified_at,
                perms,
                NO_COMPRESSION_64(
                    len(datapackage_bytes), zlib.crc32(datapackage_bytes)
                ),
                (datapackage_bytes,),
            )

        return stream_zip(member_files(), chunk_size=CHUNK_SIZE)

    async def download_streaming_wacz(
        self, org: Organization, files: List[CrawlFileOut]
    ) -> Iterator[bytes]:
        """return an iter for downloading a stream nested wacz file
        from list of files"""
        async with self.get_sync_client(org) as (client, bucket, key):
            loop = asyncio.get_event_loop()

            resp = await loop.run_in_executor(
                None, self._sync_dl, files, client, bucket, key
            )

            return resp


# ============================================================================
def _parse_json(line) -> dict:
    """Parse JSON str into dict."""
    parsed_json: Optional[dict] = None
    try:
        parsed_json = json.loads(line)
    except json.JSONDecodeError as err:
        print(f"Error decoding json-l line: {line}. Error: {err}", flush=True)
    return parsed_json or {}


# ============================================================================
def init_storages_api(org_ops, crawl_manager):
    """API for updating storage for an org"""

    storage_ops = StorageOps(org_ops, crawl_manager)

    if not org_ops.router:
        return storage_ops

    router = org_ops.router
    org_owner_dep = org_ops.org_owner_dep

    @router.get("/storage", tags=["organizations"], response_model=OrgStorageRefs)
    def get_storage_refs(
        org: Organization = Depends(org_owner_dep),
    ):
        """get storage refs for an org"""
        return OrgStorageRefs(storage=org.storage, storageReplicas=org.storageReplicas)

    @router.get("/allStorages", tags=["organizations"])
    def get_available_storages(org: Organization = Depends(org_owner_dep)):
        return storage_ops.get_available_storages(org)

    # pylint: disable=unreachable, fixme
    # todo: enable when ready to support custom storage
    return storage_ops

    @router.post("/customStorage", tags=["organizations"])
    async def add_custom_storage(
        storage: S3StorageIn, org: Organization = Depends(org_owner_dep)
    ):
        return await storage_ops.add_custom_storage(storage, org)

    @router.delete("/customStorage/{name}", tags=["organizations"])
    async def remove_custom_storage(
        name: str, org: Organization = Depends(org_owner_dep)
    ):
        return await storage_ops.remove_custom_storage(name, org)

    @router.post("/storage", tags=["organizations"])
    async def update_storage_refs(
        storage: OrgStorageRefs,
        org: Organization = Depends(org_owner_dep),
    ):
        return await storage_ops.update_storage_refs(storage, org)

    return storage_ops
