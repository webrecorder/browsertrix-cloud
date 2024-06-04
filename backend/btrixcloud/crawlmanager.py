""" shared crawl manager implementation """

import os
import asyncio
import secrets
import json

from typing import Optional, Dict, TYPE_CHECKING
from datetime import timedelta

from kubernetes_asyncio.client import V1ConfigMap
from fastapi import HTTPException

from .k8sapi import K8sAPI
from .utils import dt_now, to_k8s_date

from .models import StorageRef, CrawlConfig, UpdateCrawlConfig, BgJobType

if TYPE_CHECKING:
    from .crawlconfigs import CrawlConfigOps
else:
    CrawlConfigOps = object

# ============================================================================
class CrawlManager(K8sAPI):
    """abstract crawl manager"""
    crawlconfig: CrawlConfigOps

    def __init__(self):
        super().__init__()

        self.loop = asyncio.get_running_loop()
        self.crawlconfig = None

    def set_crawlconfig(self, crawlconfig):
        """set crawlconfig ops"""
        self.crawlconfig = crawlconfig

    # pylint: disable=too-many-arguments
    async def run_profile_browser(
        self,
        userid: str,
        oid: str,
        url: str,
        storage: StorageRef,
        crawler_image: str,
        baseprofile: str = "",
        profile_filename: str = "",
    ) -> str:
        """run browser for profile creation"""

        storage_secret = storage.get_storage_secret_name(oid)

        await self.has_storage_secret(storage_secret)

        browserid = f"prf-{secrets.token_hex(5)}"

        params = {
            "id": browserid,
            "userid": str(userid),
            "oid": str(oid),
            "storage_name": str(storage),
            "base_profile": baseprofile or "",
            "profile_filename": profile_filename or "",
            "idle_timeout": os.environ.get("IDLE_TIMEOUT", "60"),
            "url": url,
            "vnc_password": secrets.token_hex(16),
            "expire_time": to_k8s_date(dt_now() + timedelta(seconds=30)),
            "crawler_image": crawler_image,
        }

        data = self.templates.env.get_template("profile_job.yaml").render(params)

        await self.create_from_yaml(data)

        return browserid

    async def run_replica_job(
        self,
        oid: str,
        job_type: str,
        replica_storage: StorageRef,
        replica_file_path: str,
        replica_endpoint: str,
        primary_storage: Optional[StorageRef] = None,
        primary_file_path: Optional[str] = None,
        primary_endpoint: Optional[str] = None,
        job_id_prefix: Optional[str] = None,
        existing_job_id: Optional[str] = None,
    ):
        """run job to replicate file from primary storage to replica storage"""

        if existing_job_id:
            job_id = existing_job_id
        else:
            if not job_id_prefix:
                job_id_prefix = job_type

            # ensure name is <=63 characters
            job_id = f"{job_id_prefix[:52]}-{secrets.token_hex(5)}"

        params = {
            "id": job_id,
            "oid": oid,
            "job_type": job_type,
            "replica_secret_name": replica_storage.get_storage_secret_name(oid),
            "replica_file_path": replica_file_path,
            "replica_endpoint": replica_endpoint,
            "primary_secret_name": (
                primary_storage.get_storage_secret_name(oid)
                if primary_storage
                else None
            ),
            "primary_file_path": primary_file_path if primary_file_path else None,
            "primary_endpoint": primary_endpoint if primary_endpoint else None,
            "BgJobType": BgJobType,
        }

        data = self.templates.env.get_template("replica_job.yaml").render(params)

        await self.create_from_yaml(data)

        return job_id

    async def add_crawl_config(
        self,
        crawlconfig: CrawlConfig,
        storage: StorageRef,
        run_now: bool,
        out_filename: str,
        profile_filename: str,
        warc_prefix: str,
    ) -> Optional[str]:
        """add new crawl, store crawl config in configmap"""

        # Create Config Map
        await self._create_config_map(
            crawlconfig,
            USER_ID=str(crawlconfig.modifiedBy),
            ORG_ID=str(crawlconfig.oid),
            STORE_FILENAME=out_filename,
            PROFILE_FILENAME=profile_filename,
            INITIAL_SCALE=str(crawlconfig.scale),
            CRAWL_TIMEOUT=str(crawlconfig.crawlTimeout or 0),
            MAX_CRAWL_SIZE=str(crawlconfig.maxCrawlSize or 0),
            CRAWLER_CHANNEL=crawlconfig.crawlerChannel,
        )

        crawl_id = None

        if run_now:
            crawl_id = await self.create_crawl_job(
                crawlconfig,
                storage,
                str(crawlconfig.modifiedBy),
                warc_prefix,
            )

        await self._update_scheduled_job(crawlconfig)

        return crawl_id

    async def create_crawl_job(
        self,
        crawlconfig: CrawlConfig,
        storage: StorageRef,
        userid: str,
        warc_prefix: str,
    ) -> str:
        """create new crawl job from config"""
        cid = str(crawlconfig.id)

        storage_secret = storage.get_storage_secret_name(str(crawlconfig.oid))

        await self.has_storage_secret(storage_secret)

        crawler_socks_proxy_server=self.crawlconfig.get_crawler_socks_proxy_server(crawlconfig.crawlerSocksProxyServer)
        if crawlconfig.crawlerSocksProxyServer is not None and len(crawlconfig.crawlerSocksProxyServer) > 0:
            assert crawler_socks_proxy_server is not None

        return await self.new_crawl_job(
            cid,
            userid,
            crawlconfig.oid,
            storage,
            crawlconfig.crawlerChannel,
            crawlconfig.scale,
            crawlconfig.crawlTimeout,
            crawlconfig.maxCrawlSize,
            manual=True,
            warc_prefix=warc_prefix,
            crawler_socks_proxy_server=crawler_socks_proxy_server,
        )

    async def create_qa_crawl_job(
        self,
        crawlconfig: CrawlConfig,
        storage: StorageRef,
        userid: str,
        qa_source: str,
    ) -> str:
        """create new QA Run crawl job with qa source crawl id"""
        cid = str(crawlconfig.id)

        storage_secret = storage.get_storage_secret_name(str(crawlconfig.oid))

        await self.has_storage_secret(storage_secret)

        ts_now = dt_now().strftime("%Y%m%d%H%M%S")
        crawl_id = f"qa-{ts_now}-{cid[:12]}"

        return await self.new_crawl_job(
            cid,
            userid,
            crawlconfig.oid,
            storage,
            crawlconfig.crawlerChannel,
            1,
            0,
            0,
            warc_prefix="qa",
            crawl_id=crawl_id,
            qa_source=qa_source,
        )

    async def update_crawl_config(
        self, crawlconfig: CrawlConfig, update: UpdateCrawlConfig, profile_filename=None
    ) -> bool:
        """Update the schedule or scale for existing crawl config"""

        has_sched_update = update.schedule is not None
        has_scale_update = update.scale is not None
        has_timeout_update = update.crawlTimeout is not None
        has_max_crawl_size_update = update.maxCrawlSize is not None
        has_config_update = update.config is not None
        has_crawlerid_update = update.crawlerChannel is not None

        if has_sched_update:
            # crawlconfig here has already been updated
            await self._update_scheduled_job(crawlconfig)

        # pylint: disable=too-many-boolean-expressions
        if (
            has_scale_update
            or has_config_update
            or has_timeout_update
            or profile_filename is not None
            or has_max_crawl_size_update
            or has_crawlerid_update
        ):
            await self._update_config_map(
                crawlconfig,
                update,
                profile_filename,
                has_config_update,
            )

        return True

    async def remove_org_storage(self, storage: StorageRef, oid: str) -> bool:
        """Delete custom org storage secret"""
        storage_secret = storage.get_storage_secret_name(oid)
        storage_label = f"btrix.storage={storage_secret}"

        if await self.has_custom_jobs_with_label("crawljobs", storage_label):
            raise HTTPException(status_code=400, detail="storage_in_use")

        if await self.has_custom_jobs_with_label("profilejobs", storage_label):
            raise HTTPException(status_code=400, detail="storage_in_use")

        try:
            await self.core_api.delete_namespaced_secret(
                storage_secret,
                namespace=self.namespace,
            )
            return True
        # pylint: disable=bare-except
        except:
            return False

    async def add_org_storage(
        self, storage: StorageRef, string_data: Dict[str, str], oid: str
    ) -> None:
        """Add custom org storage secret"""
        labels = {"btrix.org": oid}

        storage_secret = storage.get_storage_secret_name(oid)

        crawl_secret = self.client.V1Secret(
            metadata={
                "name": storage_secret,
                "namespace": self.namespace,
                "labels": labels,
            },
            string_data=string_data,
        )

        try:
            await self.core_api.create_namespaced_secret(
                namespace=self.namespace, body=crawl_secret
            )

        # pylint: disable=bare-except
        except:
            await self.core_api.patch_namespaced_secret(
                name=storage_secret, namespace=self.namespace, body=crawl_secret
            )

    async def get_profile_browser_metadata(self, browserid: str) -> dict[str, str]:
        """get browser profile labels"""
        try:
            browser = await self.get_profile_browser(browserid)

        # pylint: disable=bare-except
        except:
            return {}

        return browser["metadata"]["labels"]

    async def get_configmap(self, cid: str) -> V1ConfigMap:
        """get configmap by id"""
        return await self.core_api.read_namespaced_config_map(
            name=f"crawl-config-{cid}", namespace=self.namespace
        )

    async def ping_profile_browser(self, browserid: str) -> None:
        """return ping profile browser"""
        expire_at = dt_now() + timedelta(seconds=30)
        await self._patch_job(
            browserid, {"expireTime": to_k8s_date(expire_at)}, "profilejobs"
        )

    async def rollover_restart_crawl(self, crawl_id: str) -> dict:
        """Rolling restart of crawl by updating restartTime field"""
        update = to_k8s_date(dt_now())
        return await self._patch_job(crawl_id, {"restartTime": update})

    async def scale_crawl(self, crawl_id: str, scale: int = 1) -> dict:
        """Set the crawl scale (job parallelism) on the specified job"""
        return await self._patch_job(crawl_id, {"scale": scale})

    async def shutdown_crawl(self, crawl_id: str, graceful=True) -> dict:
        """Request a crawl cancelation or stop by calling an API
        on the job pod/container, returning the result"""
        if graceful:
            patch = {"stopping": True}
            return await self._patch_job(crawl_id, patch)

        return await self.delete_crawl_job(crawl_id)

    async def delete_crawl_configs_for_org(self, org: str) -> None:
        """Delete all crawl configs for given org"""
        await self._delete_crawl_configs(f"btrix.org={org}")

    async def delete_crawl_config_by_id(self, cid: str) -> None:
        """Delete all crawl configs by id"""
        await self._delete_crawl_configs(f"btrix.crawlconfig={cid}")

    # ========================================================================
    # Internal Methods
    async def _create_config_map(self, crawlconfig: CrawlConfig, **data) -> None:
        """Create Config Map based on CrawlConfig"""
        data["crawl-config.json"] = json.dumps(crawlconfig.get_raw_config())

        labels = {
            "btrix.crawlconfig": str(crawlconfig.id),
            "btrix.org": str(crawlconfig.oid),
        }

        config_map = self.client.V1ConfigMap(
            metadata={
                "name": f"crawl-config-{crawlconfig.id}",
                "namespace": self.namespace,
                "labels": labels,
            },
            data=data,
        )

        await self.core_api.create_namespaced_config_map(
            namespace=self.namespace, body=config_map
        )

    async def _delete_crawl_configs(self, label) -> None:
        """Delete Crawl Cron Job and all dependent resources, including configmap and secrets"""

        await self.batch_api.delete_collection_namespaced_cron_job(
            namespace=self.namespace,
            label_selector=label,
        )

        await self.core_api.delete_collection_namespaced_config_map(
            namespace=self.namespace,
            label_selector=label,
        )

    async def _update_scheduled_job(self, crawlconfig: CrawlConfig) -> Optional[str]:
        """create or remove cron job based on crawlconfig schedule"""
        cid = str(crawlconfig.id)

        cron_job_id = f"sched-{cid[:12]}"
        cron_job = None
        try:
            cron_job = await self.batch_api.read_namespaced_cron_job(
                name=cron_job_id,
                namespace=self.namespace,
            )
        # pylint: disable=bare-except
        except:
            pass

        # if no schedule, delete cron_job if exists and we're done
        if not crawlconfig.schedule:
            if cron_job:
                await self.batch_api.delete_namespaced_cron_job(
                    name=cron_job.metadata.name, namespace=self.namespace
                )
            return None

        # if cron job exists, just patch schedule
        if cron_job:
            if crawlconfig.schedule != cron_job.spec.schedule:
                cron_job.spec.schedule = crawlconfig.schedule

                await self.batch_api.patch_namespaced_cron_job(
                    name=cron_job.metadata.name,
                    namespace=self.namespace,
                    body=cron_job,
                )
            return None

        params = {
            "id": cron_job_id,
            "cid": str(crawlconfig.id),
            "schedule": crawlconfig.schedule,
        }

        data = self.templates.env.get_template("crawl_cron_job.yaml").render(params)

        await self.create_from_yaml(data, self.namespace)

        return cron_job_id

    async def _update_config_map(
        self,
        crawlconfig: CrawlConfig,
        update: UpdateCrawlConfig,
        profile_filename: Optional[str] = None,
        update_config: bool = False,
    ) -> None:
        try:
            config_map = await self.get_configmap(str(crawlconfig.id))
        # pylint: disable=raise-missing-from
        except:
            raise FileNotFoundError(str(crawlconfig.id))

        if update.scale is not None:
            config_map.data["INITIAL_SCALE"] = str(update.scale)

        if update.crawlTimeout is not None:
            config_map.data["CRAWL_TIMEOUT"] = str(update.crawlTimeout)

        if update.maxCrawlSize is not None:
            config_map.data["MAX_CRAWL_SIZE"] = str(update.maxCrawlSize)

        if update.crawlFilenameTemplate is not None:
            config_map.data["STORE_FILENAME"] = update.crawlFilenameTemplate

        if update.crawlerChannel is not None:
            config_map.data["CRAWLER_CHANNEL"] = update.crawlerChannel

        if profile_filename is not None:
            config_map.data["PROFILE_FILENAME"] = profile_filename

        if update_config:
            config_map.data["crawl-config.json"] = json.dumps(
                crawlconfig.get_raw_config()
            )

        await self.core_api.patch_namespaced_config_map(
            name=config_map.metadata.name, namespace=self.namespace, body=config_map
        )
