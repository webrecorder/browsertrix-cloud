""" Operator Models """

from collections import defaultdict
from uuid import UUID
from typing import Optional, DefaultDict, Literal
from pydantic import BaseModel, Field
from kubernetes.utils import parse_quantity
from btrixcloud.models import StorageRef, TYPE_ALL_CRAWL_STATES


BTRIX_API = "btrix.cloud/v1"

CMAP = "ConfigMap.v1"
PVC = "PersistentVolumeClaim.v1"
POD = "Pod.v1"
CJS = f"CrawlJob.{BTRIX_API}"

StopReason = Literal[
    "stopped_by_user", "time-limit", "size-limit", "stopped_quota_reached"
]


# ============================================================================
class MCBaseRequest(BaseModel):
    """base metacontroller model, used for customize hook"""

    parent: dict
    controller: dict


# ============================================================================
class MCSyncData(MCBaseRequest):
    """sync / finalize metacontroller model"""

    children: dict
    related: dict
    finalizing: bool = False


# ============================================================================
class MCDecoratorSyncData(BaseModel):
    """sync for decoratorcontroller model"""

    object: dict
    controller: dict

    attachments: dict
    related: dict
    finalizing: bool = False


# ============================================================================
class CrawlSpec(BaseModel):
    """spec from k8s CrawlJob object"""

    id: str
    cid: UUID
    oid: UUID
    scale: int = 1
    storage: StorageRef
    started: str
    crawler_channel: str
    stopping: bool = False
    scheduled: bool = False
    timeout: int = 0
    max_crawl_size: int = 0
    qa_source_crawl_id: Optional[str] = ""
    crawler_socks_proxy_server: Optional[str] = None

    @property
    def db_crawl_id(self) -> str:
        """return actual crawl_id for db, if qa run"""
        return self.qa_source_crawl_id or self.id

    @property
    def is_qa(self) -> bool:
        """return true if qa run"""
        return bool(self.qa_source_crawl_id)


# ============================================================================
class PodResourcePercentage(BaseModel):
    """Resource usage percentage ratios"""

    memory: float = 0
    cpu: float = 0
    storage: float = 0


# ============================================================================
class PodResources(BaseModel):
    """Pod Resources"""

    memory: int = 0
    cpu: float = 0
    storage: int = 0

    def __init__(self, *a, **kw):
        if "memory" in kw:
            kw["memory"] = int(parse_quantity(kw["memory"]))
        if "cpu" in kw:
            kw["cpu"] = float(parse_quantity(kw["cpu"]))
        if "storage" in kw:
            kw["storage"] = int(parse_quantity(kw["storage"]))
        super().__init__(*a, **kw)


# ============================================================================
class PodInfo(BaseModel):
    """Aggregate pod status info held in CrawlJob"""

    exitTime: Optional[str] = None
    exitCode: Optional[int] = None
    isNewExit: Optional[bool] = Field(default=None, exclude=True)
    reason: Optional[str] = None

    allocated: PodResources = PodResources()
    used: PodResources = PodResources()

    newCpu: Optional[int] = None
    newMemory: Optional[int] = None
    signalAtMem: Optional[int] = None

    def dict(self, *a, **kw):
        res = super().dict(*a, **kw)
        percent = {
            "memory": self.get_percent_memory(),
            "cpu": self.get_percent_cpu(),
            "storage": self.get_percent_storage(),
        }
        res["percent"] = percent
        return res

    def get_percent_memory(self) -> float:
        """compute percent memory used"""
        return (
            float(self.used.memory) / float(self.allocated.memory)
            if self.allocated.memory
            else 0
        )

    def get_percent_cpu(self) -> float:
        """compute percent cpu used"""
        return (
            float(self.used.cpu) / float(self.allocated.cpu)
            if self.allocated.cpu
            else 0
        )

    def get_percent_storage(self) -> float:
        """compute percent storage used"""
        return (
            float(self.used.storage) / float(self.allocated.storage)
            if self.allocated.storage
            else 0
        )

    def should_restart_pod(self):
        """return true if pod should be restarted"""
        if self.newMemory and self.newMemory != self.allocated.memory:
            return True

        if self.newCpu and self.newCpu != self.allocated.cpu:
            return True

        return False


# ============================================================================
# pylint: disable=invalid-name
class CrawlStatus(BaseModel):
    """status from k8s CrawlJob object"""

    state: TYPE_ALL_CRAWL_STATES = "starting"
    pagesFound: int = 0
    pagesDone: int = 0
    size: int = 0
    # human readable size string
    sizeHuman: str = ""
    scale: int = 1
    filesAdded: int = 0
    filesAddedSize: int = 0
    finished: Optional[str] = None
    stopping: bool = False
    stopReason: Optional[StopReason] = None
    initRedis: bool = False
    crawlerImage: Optional[str] = None
    crawlerSocksProxyServer: Optional[str] = None

    lastActiveTime: str = ""
    podStatus: DefaultDict[str, PodInfo] = defaultdict(
        lambda: PodInfo()  # pylint: disable=unnecessary-lambda
    )
    # placeholder for pydantic 2.0 -- will require this version
    # podStatus: Optional[
    #    DefaultDict[str, Annotated[PodInfo, Field(default_factory=PodInfo)]]
    # ]
    restartTime: Optional[str]
    canceled: bool = False

    # updated on pod exits and at regular interval
    # Crawl Execution Time -- time all crawler pods have been running
    # used to track resource usage and enforce execution minutes limit
    crawlExecTime: int = 0

    # Elapsed Exec Time -- time crawl has been running in at least one pod
    # used for crawl timeouts
    elapsedCrawlTime: int = 0

    # last exec time update
    lastUpdatedTime: str = ""

    # any pods exited
    anyCrawlPodNewExit: Optional[bool] = Field(default=False, exclude=True)

    # don't include in status, use by metacontroller
    resync_after: Optional[int] = Field(default=None, exclude=True)
