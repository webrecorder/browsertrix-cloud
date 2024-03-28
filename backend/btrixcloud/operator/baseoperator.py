""" Base Operator class for all operators """

import asyncio
from typing import TYPE_CHECKING
from kubernetes.utils import parse_quantity

import yaml
from btrixcloud.k8sapi import K8sAPI


if TYPE_CHECKING:
    from btrixcloud.crawlconfigs import CrawlConfigOps
    from btrixcloud.crawls import CrawlOps
    from btrixcloud.orgs import OrgOps
    from btrixcloud.colls import CollectionOps
    from btrixcloud.storages import StorageOps
    from btrixcloud.webhooks import EventWebhookOps
    from btrixcloud.users import UserManager
    from btrixcloud.background_jobs import BackgroundJobOps
    from btrixcloud.pages import PageOps
    from redis.asyncio.client import Redis
else:
    CrawlConfigOps = CrawlOps = OrgOps = CollectionOps = Redis = object
    StorageOps = EventWebhookOps = UserManager = BackgroundJobOps = PageOps = object


# ============================================================================
class K8sOpAPI(K8sAPI):
    """Additional k8s api for operators"""

    def __init__(self):
        super().__init__()
        self.config_file = "/config/config.yaml"
        with open(self.config_file, encoding="utf-8") as fh_config:
            self.shared_params = yaml.safe_load(fh_config)

        self.has_pod_metrics = False
        self.compute_crawler_resources()
        self.compute_profile_resources()

    def compute_crawler_resources(self):
        """compute memory / cpu resources for crawlers"""
        p = self.shared_params
        num = max(int(p["crawler_browser_instances"]) - 1, 0)
        crawler_cpu: float = 0
        crawler_memory: int = 0
        print("crawler resources")
        if not p.get("crawler_cpu"):
            base = parse_quantity(p["crawler_cpu_base"])
            extra = parse_quantity(p["crawler_extra_cpu_per_browser"])

            # cpu is a floating value of cpu cores
            crawler_cpu = float(base + num * extra)

            print(f"cpu = {base} + {num} * {extra} = {crawler_cpu}")
        else:
            crawler_cpu = float(parse_quantity(p["crawler_cpu"]))
            print(f"cpu = {crawler_cpu}")

        if not p.get("crawler_memory"):
            base = parse_quantity(p["crawler_memory_base"])
            extra = parse_quantity(p["crawler_extra_memory_per_browser"])

            # memory is always an int
            crawler_memory = int(base + num * extra)

            print(f"memory = {base} + {num} * {extra} = {crawler_memory}")
        else:
            crawler_memory = int(parse_quantity(p["crawler_memory"]))
            print(f"memory = {crawler_memory}")

        p["crawler_cpu"] = crawler_cpu
        p["crawler_memory"] = crawler_memory

    def compute_profile_resources(self):
        """compute memory /cpu resources for a single profile browser"""
        p = self.shared_params
        # if no profile specific options provided, default to crawler base for one browser
        profile_cpu = parse_quantity(
            p.get("profile_browser_cpu") or p["crawler_cpu_base"]
        )
        profile_memory = parse_quantity(
            p.get("profile_browser_memory") or p["crawler_memory_base"]
        )
        p["profile_cpu"] = profile_cpu
        p["profile_memory"] = profile_memory

        print("profile browser resources")
        print(f"cpu = {profile_cpu}")
        print(f"memory = {profile_memory}")

    async def async_init(self):
        """perform any async init here"""
        self.has_pod_metrics = await self.is_pod_metrics_available()
        print("Pod Metrics Available:", self.has_pod_metrics)


# pylint: disable=too-many-instance-attributes, too-many-arguments
# ============================================================================
class BaseOperator:
    """BaseOperator"""

    k8s: K8sOpAPI
    crawl_config_ops: CrawlConfigOps
    crawl_ops: CrawlOps
    orgs_ops: OrgOps
    coll_ops: CollectionOps
    storage_ops: StorageOps
    event_webhook_ops: EventWebhookOps
    background_job_ops: BackgroundJobOps
    user_ops: UserManager
    page_ops: PageOps

    def __init__(
        self,
        k8s,
        crawl_config_ops,
        crawl_ops,
        org_ops,
        coll_ops,
        storage_ops,
        event_webhook_ops,
        background_job_ops,
        page_ops,
    ):
        self.k8s = k8s
        self.crawl_config_ops = crawl_config_ops
        self.crawl_ops = crawl_ops
        self.org_ops = org_ops
        self.coll_ops = coll_ops
        self.storage_ops = storage_ops
        self.background_job_ops = background_job_ops
        self.event_webhook_ops = event_webhook_ops
        self.page_ops = page_ops

        self.user_ops = crawl_config_ops.user_manager

        # to avoid background tasks being garbage collected
        # see: https://stackoverflow.com/a/74059981
        self.bg_tasks = set()

    def init_routes(self, app):
        """init routes for this operator"""

    def run_task(self, func):
        """add bg tasks to set to avoid premature garbage collection"""
        task = asyncio.create_task(func)
        self.bg_tasks.add(task)
        task.add_done_callback(self.bg_tasks.discard)

    def load_from_yaml(self, filename, params):
        """load and parse k8s template from yaml file"""
        return list(
            yaml.safe_load_all(
                self.k8s.templates.env.get_template(filename).render(params)
            )
        )
