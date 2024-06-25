""" Operator handler for crawl CronJobs """

from uuid import UUID
from typing import Optional
import yaml

from btrixcloud.utils import to_k8s_date, dt_now
from .models import MCDecoratorSyncData, CJS
from .baseoperator import BaseOperator


# pylint: disable=too-many-locals
# ============================================================================
class CronJobOperator(BaseOperator):
    """CronJob Operator"""

    def init_routes(self, app):
        """init routes for crawl CronJob decorator"""

        @app.post("/op/cronjob/sync")
        async def mc_sync_cronjob_crawls(data: MCDecoratorSyncData):
            return await self.sync_cronjob_crawl(data)

    def get_finished_response(
        self, metadata: dict[str, str], set_status=True, finished: Optional[str] = None
    ):
        """get final response to indicate cronjob created job is finished"""

        if not finished:
            finished = to_k8s_date(dt_now())

        status = None
        # set status on decorated job to indicate that its finished
        if set_status:
            status = {
                "succeeded": 1,
                "startTime": metadata.get("creationTimestamp"),
                "completionTime": finished,
            }

        return {
            "attachments": [],
            # set on job to match default behavior when job finishes
            "annotations": {"finished": finished},
            "status": status,
        }

    async def sync_cronjob_crawl(self, data: MCDecoratorSyncData):
        """create crawljobs from a job object spawned by cronjob"""

        metadata = data.object["metadata"]
        labels = metadata.get("labels", {})
        cid = labels.get("btrix.crawlconfig")
        # oid = labels.get("btrix.oid")
        # userid = labels.get("btrix.user")

        name = metadata.get("name")
        crawl_id = name

        actual_state, finished = await self.crawl_ops.get_crawl_state(
            crawl_id, is_qa=False
        )
        if finished:
            finished_str = to_k8s_date(finished)
            set_status = False
            # mark job as completed
            if not data.object["status"].get("succeeded"):
                print("Cron Job Complete!", finished)
                set_status = True

            return self.get_finished_response(metadata, set_status, finished_str)

        # oid = configmap.get("ORG_ID")
        # userid = configmap.get("USER_ID")

        crawljobs = data.attachments[CJS]

        warc_prefix = None

        if not actual_state and not crawljobs:
            # cronjob doesn't exist yet
            crawlconfig = await self.crawl_config_ops.get_crawl_config(UUID(cid))
            if not crawlconfig:
                print(
                    f"error: no crawlconfig {cid}. skipping scheduled job. old cronjob left over?"
                )
                return self.get_finished_response(metadata)

            # get org
            oid = crawlconfig.oid
            org = await self.org_ops.get_org_by_id(oid)

            # db create
            userid = crawlconfig.lastModifiedBy
            user = await self.user_ops.get_by_id(userid)
            if not user:
                print(f"error: missing user for id {userid}")
                return self.get_finished_response(metadata)

            warc_prefix = self.crawl_config_ops.get_warc_prefix(org, crawlconfig)

            if org.readOnly:
                print(
                    f"org {org.id} set to read-only. skipping scheduled crawl for workflow {cid}"
                )
                return self.get_finished_response(metadata)

            await self.crawl_config_ops.add_new_crawl(
                crawl_id,
                crawlconfig,
                user,
                manual=False,
            )
            print("Scheduled Crawl Created: " + crawl_id)

            profile_filename = await self.crawl_config_ops.get_profile_filename(
                crawlconfig, org
            )

            crawl_id, crawljob = self.k8s.new_crawl_job_yaml(
                cid,
                userid=userid,
                oid=oid,
                storage=org.storage,
                crawler_channel=crawlconfig.crawlerChannel or "default",
                scale=crawlconfig.scale,
                crawl_timeout=crawlconfig.crawlTimeout,
                max_crawl_size=crawlconfig.maxCrawlSize,
                manual=False,
                crawl_id=crawl_id,
                warc_prefix=warc_prefix,
                storage_filename=self.crawl_config_ops.default_filename_template,
                profile_filename=profile_filename or "",
            )

            attachments = list(yaml.safe_load_all(crawljob))

            if crawl_id in crawljobs:
                attachments[0]["status"] = crawljobs[CJS][crawl_id]["status"]

        else:
            pprint(crawljobs)
            attachments = crawljobs

        return {
            "attachments": attachments,
        }
