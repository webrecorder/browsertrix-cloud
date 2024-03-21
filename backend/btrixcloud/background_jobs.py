"""k8s background jobs"""

import asyncio
from datetime import datetime
from typing import Optional, Tuple, Union, List, Dict, TYPE_CHECKING, cast
from uuid import UUID

from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException

from .storages import StorageOps
from .crawlmanager import CrawlManager

from .models import (
    BaseFile,
    Organization,
    BackgroundJob,
    BgJobType,
    CreateReplicaJob,
    DeleteReplicaJob,
    PaginatedResponse,
    AnyJob,
    StorageRef,
    User,
)
from .pagination import DEFAULT_PAGE_SIZE, paginated_format

if TYPE_CHECKING:
    from .orgs import OrgOps
    from .basecrawls import BaseCrawlOps
    from .profiles import ProfileOps
else:
    OrgOps = CrawlManager = BaseCrawlOps = ProfileOps = object


# ============================================================================
# pylint: disable=too-many-instance-attributes
class BackgroundJobOps:
    """k8s background job management"""

    org_ops: OrgOps
    crawl_manager: CrawlManager
    storage_ops: StorageOps

    base_crawl_ops: BaseCrawlOps
    profile_ops: ProfileOps

    # pylint: disable=too-many-locals, too-many-arguments, invalid-name

    def __init__(self, mdb, email, user_manager, org_ops, crawl_manager, storage_ops):
        self.jobs = mdb["jobs"]

        self.email = email
        self.user_manager = user_manager

        self.org_ops = org_ops
        self.crawl_manager = crawl_manager
        self.storage_ops = storage_ops

        self.base_crawl_ops = cast(BaseCrawlOps, None)
        self.profile_ops = cast(ProfileOps, None)

        self.router = APIRouter(
            prefix="/jobs",
            tags=["jobs"],
            responses={404: {"description": "Not found"}},
        )

    def set_ops(self, base_crawl_ops: BaseCrawlOps, profile_ops: ProfileOps) -> None:
        """basecrawlops and profileops for updating files"""
        self.base_crawl_ops = base_crawl_ops
        self.profile_ops = profile_ops

    def strip_bucket(self, endpoint_url: str) -> tuple[str, str]:
        """split the endpoint_url into the origin and return rest of endpoint as bucket path"""
        parts = urlsplit(endpoint_url)
        return parts.scheme + "://" + parts.netloc + "/", parts.path[1:]

    async def handle_replica_job_finished(self, job: CreateReplicaJob) -> None:
        """Update replicas in corresponding file objects, based on type"""
        res = None
        if job.object_type in ("crawl", "upload"):
            res = await self.base_crawl_ops.add_crawl_file_replica(
                job.object_id, job.file_path, job.replica_storage
            )
        elif job.object_type == "profile":
            res = await self.profile_ops.add_profile_file_replica(
                UUID(job.object_id), job.file_path, job.replica_storage
            )
        if not res:
            print("File deleted before replication job started, ignoring", flush=True)

    async def create_replica_jobs(
        self, oid: UUID, file: BaseFile, object_id: str, object_type: str
    ) -> Dict[str, Union[bool, List[str]]]:
        """Create k8s background job to replicate a file to all replica storage locations."""
        org = await self.org_ops.get_org_by_id(oid)

        primary_storage = self.storage_ops.get_org_storage_by_ref(org, file.storage)
        primary_endpoint, bucket_suffix = self.strip_bucket(
            primary_storage.endpoint_url
        )

        primary_file_path = bucket_suffix + file.filename

        ids = []

        for replica_ref in self.storage_ops.get_org_replicas_storage_refs(org):
            job_id = await self.create_replica_job(
                org,
                file,
                object_id,
                object_type,
                replica_ref,
                primary_file_path,
                primary_endpoint,
            )
            ids.append(job_id)

        return {"added": True, "ids": ids}

    async def create_replica_job(
        self,
        org: Organization,
        file: BaseFile,
        object_id: str,
        object_type: str,
        replica_ref: StorageRef,
        primary_file_path: str,
        primary_endpoint: str,
        existing_job_id: Optional[str] = None,
    ) -> str:
        """Create k8s background job to replicate a file to a specific replica storage location."""
        replica_storage = self.storage_ops.get_org_storage_by_ref(org, replica_ref)
        replica_endpoint, bucket_suffix = self.strip_bucket(
            replica_storage.endpoint_url
        )
        replica_file_path = bucket_suffix + file.filename

        job_type = BgJobType.CREATE_REPLICA.value

        try:
            job_id = await self.crawl_manager.run_replica_job(
                oid=str(org.id),
                job_type=job_type,
                primary_storage=file.storage,
                primary_file_path=primary_file_path,
                primary_endpoint=primary_endpoint,
                replica_storage=replica_ref,
                replica_file_path=replica_file_path,
                replica_endpoint=replica_endpoint,
                job_id_prefix=f"{job_type}-{object_id}",
                existing_job_id=existing_job_id,
            )
            if existing_job_id:
                replication_job = await self.get_background_job(existing_job_id, org.id)
                previous_attempt = {
                    "started": replication_job.started,
                    "finished": replication_job.finished,
                }
                if replication_job.previousAttempts:
                    replication_job.previousAttempts.append(previous_attempt)
                else:
                    replication_job.previousAttempts = [previous_attempt]
                replication_job.started = datetime.now()
                replication_job.finished = None
                replication_job.success = None
            else:
                replication_job = CreateReplicaJob(
                    id=job_id,
                    oid=org.id,
                    started=datetime.now(),
                    file_path=file.filename,
                    object_type=object_type,
                    object_id=object_id,
                    primary=file.storage,
                    replica_storage=replica_ref,
                )

            await self.jobs.find_one_and_update(
                {"_id": job_id}, {"$set": replication_job.to_dict()}, upsert=True
            )

            return job_id
        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=500, detail=f"Error starting crawl: {exc}")

    async def create_delete_replica_jobs(
        self, org: Organization, file: BaseFile, object_id: str, object_type: str
    ) -> Dict[str, Union[bool, List[str]]]:
        """Create a job to delete each replica for the given file"""
        ids = []

        for replica_ref in file.replicas or []:
            job_id = await self.create_delete_replica_job(
                org, file, object_id, object_type, replica_ref
            )
            ids.append(job_id)

        return {"added": True, "ids": ids}

    async def create_delete_replica_job(
        self,
        org: Organization,
        file: BaseFile,
        object_id: str,
        object_type: str,
        replica_ref: StorageRef,
        existing_job_id: Optional[str] = None,
    ) -> str:
        """Create a job to delete one replica of a given file"""
        replica_storage = self.storage_ops.get_org_storage_by_ref(org, replica_ref)
        replica_endpoint, bucket_suffix = self.strip_bucket(
            replica_storage.endpoint_url
        )
        replica_file_path = bucket_suffix + file.filename

        job_type = BgJobType.DELETE_REPLICA.value

        try:
            job_id = await self.crawl_manager.run_replica_job(
                oid=str(org.id),
                job_type=job_type,
                replica_storage=replica_ref,
                replica_file_path=replica_file_path,
                replica_endpoint=replica_endpoint,
                job_id_prefix=f"{job_type}-{object_id}",
                existing_job_id=existing_job_id,
            )

            if existing_job_id:
                delete_replica_job = await self.get_background_job(
                    existing_job_id, org.id
                )
                previous_attempt = {
                    "started": delete_replica_job.started,
                    "finished": delete_replica_job.finished,
                }
                if delete_replica_job.previousAttempts:
                    delete_replica_job.previousAttempts.append(previous_attempt)
                else:
                    delete_replica_job.previousAttempts = [previous_attempt]
                delete_replica_job.started = datetime.now()
                delete_replica_job.finished = None
                delete_replica_job.success = None
            else:
                delete_replica_job = DeleteReplicaJob(
                    id=job_id,
                    oid=org.id,
                    started=datetime.now(),
                    file_path=file.filename,
                    object_id=object_id,
                    object_type=object_type,
                    replica_storage=replica_ref,
                )

            await self.jobs.find_one_and_update(
                {"_id": job_id}, {"$set": delete_replica_job.to_dict()}, upsert=True
            )

            return job_id

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(
                status_code=400, detail=f"Error starting background job: {exc}"
            )

    async def job_finished(
        self,
        job_id: str,
        job_type: str,
        oid: UUID,
        success: bool,
        finished: datetime,
    ) -> None:
        """Update job as finished, including
        job-specific task handling"""

        job = await self.get_background_job(job_id, oid)
        if job.finished:
            return

        if job.type != job_type:
            raise HTTPException(status_code=400, detail="invalid_job_type")

        if success:
            if job_type == BgJobType.CREATE_REPLICA:
                await self.handle_replica_job_finished(cast(CreateReplicaJob, job))
        else:
            print(
                f"Background job {job.id} failed, sending email to superuser",
                flush=True,
            )
            superuser = await self.user_manager.get_superuser()
            org = await self.org_ops.get_org_by_id(job.oid)
            await asyncio.get_event_loop().run_in_executor(
                None,
                self.email.send_background_job_failed,
                job,
                org,
                finished,
                superuser.email,
            )

        await self.jobs.find_one_and_update(
            {"_id": job_id, "oid": oid},
            {"$set": {"success": success, "finished": finished}},
        )

    async def get_background_job(
        self, job_id: str, oid: UUID
    ) -> Union[CreateReplicaJob, DeleteReplicaJob]:
        """Get background job"""
        query: dict[str, object] = {"_id": job_id, "oid": oid}
        res = await self.jobs.find_one(query)
        if not res:
            raise HTTPException(status_code=404, detail="job_not_found")

        return self._get_job_by_type_from_data(res)

    def _get_job_by_type_from_data(self, data: dict[str, object]):
        """convert dict to propert background job type"""
        if data["type"] == BgJobType.CREATE_REPLICA:
            return CreateReplicaJob.from_dict(data)

        return DeleteReplicaJob.from_dict(data)

        # return BackgroundJob.from_dict(data)

    async def list_background_jobs(
        self,
        org: Organization,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        success: Optional[bool] = None,
        job_type: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_direction: Optional[int] = -1,
    ) -> Tuple[List[BackgroundJob], int]:
        """List all background jobs"""
        # pylint: disable=duplicate-code
        # Zero-index page for query
        page = page - 1
        skip = page_size * page

        query: dict[str, object] = {"oid": org.id}

        if success in (True, False):
            query["success"] = success

        if job_type:
            query["type"] = job_type

        aggregate = [{"$match": query}]

        if sort_by:
            SORT_FIELDS = ("success", "type", "started", "finished")
            if sort_by not in SORT_FIELDS:
                raise HTTPException(status_code=400, detail="invalid_sort_by")
            if sort_direction not in (1, -1):
                raise HTTPException(status_code=400, detail="invalid_sort_direction")

            aggregate.extend([{"$sort": {sort_by: sort_direction}}])

        aggregate.extend(
            [
                {
                    "$facet": {
                        "items": [
                            {"$skip": skip},
                            {"$limit": page_size},
                        ],
                        "total": [{"$count": "count"}],
                    }
                },
            ]
        )

        # Get total
        cursor = self.jobs.aggregate(aggregate)
        results = await cursor.to_list(length=1)
        result = results[0]
        items = result["items"]

        try:
            total = int(result["total"][0]["count"])
        except (IndexError, ValueError):
            total = 0

        jobs = [self._get_job_by_type_from_data(data) for data in items]

        return jobs, total

    async def get_replica_job_file(
        self, job: Union[CreateReplicaJob, DeleteReplicaJob], org: Organization
    ) -> BaseFile:
        """Return file from replica job"""
        try:
            if job.object_type == "profile":
                profile = await self.profile_ops.get_profile(UUID(job.object_id), org)
                return BaseFile(**profile.resource.dict())

            item_res = await self.base_crawl_ops.get_base_crawl(job.object_id, org)
            matching_file = [f for f in item_res.files if f.filename == job.file_path][
                0
            ]
            return matching_file
        # pylint: disable=broad-exception-caught, raise-missing-from
        except Exception:
            raise HTTPException(status_code=404, detail="file_not_found")

    async def retry_background_job(
        self, job_id: str, org: Organization
    ) -> Dict[str, Union[bool, Optional[str]]]:
        """Retry background job"""
        job = await self.get_background_job(job_id, org.id)
        if not job:
            raise HTTPException(status_code=404, detail="job_not_found")

        if not job.finished:
            raise HTTPException(status_code=400, detail="job_not_finished")

        if job.success:
            raise HTTPException(status_code=400, detail="job_already_succeeded")

        file = await self.get_replica_job_file(job, org)

        if job.type == BgJobType.CREATE_REPLICA:
            primary_storage = self.storage_ops.get_org_storage_by_ref(org, file.storage)
            primary_endpoint, bucket_suffix = self.strip_bucket(
                primary_storage.endpoint_url
            )
            primary_file_path = bucket_suffix + file.filename
            await self.create_replica_job(
                org,
                file,
                job.object_id,
                job.object_type,
                job.replica_storage,
                primary_file_path,
                primary_endpoint,
                existing_job_id=job_id,
            )

        if job.type == BgJobType.DELETE_REPLICA:
            await self.create_delete_replica_job(
                org,
                file,
                job.object_id,
                job.object_type,
                job.replica_storage,
                existing_job_id=job_id,
            )

        return {"success": True}

    async def retry_failed_background_jobs(
        self, org: Organization
    ) -> Dict[str, Union[bool, Optional[str]]]:
        """Retry all failed background jobs in an org

        Keep track of tasks in set to prevent them from being garbage collected
        See: https://stackoverflow.com/a/74059981
        """
        bg_tasks = set()
        async for job in self.jobs.find({"oid": org.id, "success": False}):
            task = asyncio.create_task(self.retry_background_job(job["_id"], org))
            bg_tasks.add(task)
            task.add_done_callback(bg_tasks.discard)
        return {"success": True}

    async def retry_all_failed_background_jobs(
        self,
    ) -> Dict[str, Union[bool, Optional[str]]]:
        """Retry all failed background jobs from all orgs

        Keep track of tasks in set to prevent them from being garbage collected
        See: https://stackoverflow.com/a/74059981
        """
        bg_tasks = set()
        async for job in self.jobs.find({"success": False}):
            org = await self.org_ops.get_org_by_id(job["oid"])
            task = asyncio.create_task(self.retry_background_job(job["_id"], org))
            bg_tasks.add(task)
            task.add_done_callback(bg_tasks.discard)
        return {"success": True}


# ============================================================================
# pylint: disable=too-many-arguments, too-many-locals, invalid-name, fixme
def init_background_jobs_api(
    app, mdb, email, user_manager, org_ops, crawl_manager, storage_ops, user_dep
):
    """init background jobs system"""
    # pylint: disable=invalid-name

    ops = BackgroundJobOps(
        mdb, email, user_manager, org_ops, crawl_manager, storage_ops
    )

    router = ops.router

    # org_owner_dep = org_ops.org_owner_dep
    org_crawl_dep = org_ops.org_crawl_dep

    @router.get(
        "/{job_id}",
        response_model=AnyJob,
    )
    async def get_background_job(
        job_id: str,
        org: Organization = Depends(org_crawl_dep),
    ):
        """Retrieve information for background job"""
        return await ops.get_background_job(job_id, org.id)

    @router.post(
        "/{job_id}/retry",
    )
    async def retry_background_job(
        job_id: str,
        org: Organization = Depends(org_crawl_dep),
    ):
        """Retry background job"""
        return await ops.retry_background_job(job_id, org)

    @app.post(
        "/orgs/all/jobs/retryFailed",
    )
    async def retry_all_failed_background_jobs(user: User = Depends(user_dep)):
        """Retry failed background jobs from all orgs"""
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        return await ops.retry_all_failed_background_jobs()

    @router.post(
        "/retryFailed",
    )
    async def retry_failed_background_jobs(
        org: Organization = Depends(org_crawl_dep),
    ):
        """Retry failed background jobs"""
        return await ops.retry_failed_background_jobs(org)

    @router.get("", response_model=PaginatedResponse)
    async def list_background_jobs(
        org: Organization = Depends(org_crawl_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        success: Optional[bool] = None,
        jobType: Optional[str] = None,
        sortBy: Optional[str] = None,
        sortDirection: Optional[int] = -1,
    ):
        """Retrieve paginated list of background jobs"""
        jobs, total = await ops.list_background_jobs(
            org,
            page_size=pageSize,
            page=page,
            success=success,
            job_type=jobType,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        return paginated_format(jobs, total, page, pageSize)

    org_ops.router.include_router(router)

    return ops
