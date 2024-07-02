"""
Crawl-related models and types
"""

from datetime import datetime
from enum import Enum, IntEnum
from uuid import UUID
import os

from typing import Optional, List, Dict, Union, Literal, Any, get_args
from pydantic import (
    BaseModel,
    conint,
    Field,
    HttpUrl,
    AnyHttpUrl,
    EmailStr,
    ConstrainedStr,
)

# from fastapi_users import models as fastapi_users_models

from .db import BaseMongoModel

# crawl scale for constraint
MAX_CRAWL_SCALE = int(os.environ.get("MAX_CRAWL_SCALE", 3))


# pylint: disable=invalid-name, too-many-lines
# ============================================================================
class UserRole(IntEnum):
    """User role"""

    VIEWER = 10
    CRAWLER = 20
    OWNER = 40
    SUPERADMIN = 100


# ============================================================================

### INVITES ###


# ============================================================================
class InvitePending(BaseMongoModel):
    """An invite for a new user, with an email and invite token as id"""

    id: UUID
    created: datetime
    tokenHash: str
    inviterEmail: str
    fromSuperuser: Optional[bool]
    oid: Optional[UUID]
    role: UserRole = UserRole.VIEWER
    email: Optional[str]
    # set if existing user
    userid: Optional[UUID]


# ============================================================================
class InviteOut(BaseModel):
    """Single invite output model"""

    created: datetime
    inviterEmail: str
    inviterName: str
    oid: Optional[UUID]
    orgName: Optional[str]
    orgSlug: Optional[str]
    role: UserRole = UserRole.VIEWER
    email: Optional[str]
    firstOrgOwner: Optional[bool] = None


# ============================================================================
class InviteRequest(BaseModel):
    """Request to invite another user"""

    email: str


# ============================================================================
class InviteToOrgRequest(InviteRequest):
    """Request to invite another user to an organization"""

    role: UserRole


# ============================================================================
class AddToOrgRequest(InviteRequest):
    """Request to add a new user to an organization directly"""

    role: UserRole
    password: str
    name: str


# ============================================================================

### MAIN USER MODEL ###


# ============================================================================
class User(BaseModel):
    """
    User Model
    """

    id: UUID

    name: str = ""
    email: EmailStr
    is_superuser: bool = False
    is_verified: bool = False

    hashed_password: str

    def dict(self, *a, **kw):
        """ensure invites / hashed_password never serialize, just in case"""
        exclude = kw.get("exclude") or set()
        exclude.add("invites")
        exclude.add("hashed_password")
        return super().dict(*a, **kw)


# ============================================================================
class FailedLogin(BaseMongoModel):
    """
    Failed login model
    """

    attempted: datetime = datetime.now()
    email: str

    # Consecutive failed logins, reset to 0 on successful login or after
    # password is reset. On failed_logins >= 5 within the hour before this
    # object is deleted, the user is unable to log in until they reset their
    # password.
    count: int = 1


# ============================================================================
class UserOrgInfoOut(BaseModel):
    """org per user"""

    id: UUID

    name: str
    slug: str
    default: bool
    role: UserRole


# ============================================================================
class UserOut(BaseModel):
    """Output User model"""

    id: UUID

    name: str = ""
    email: EmailStr
    is_superuser: bool = False
    is_verified: bool = False

    orgs: List[UserOrgInfoOut]


# ============================================================================

### CRAWL STATES

# ============================================================================
TYPE_RUNNING_STATES = Literal[
    "running", "pending-wait", "generate-wacz", "uploading-wacz"
]
RUNNING_STATES = get_args(TYPE_RUNNING_STATES)

TYPE_STARTING_STATES = Literal["starting", "waiting_capacity", "waiting_org_limit"]
STARTING_STATES = get_args(TYPE_STARTING_STATES)

TYPE_FAILED_STATES = Literal["canceled", "failed", "skipped_quota_reached"]
FAILED_STATES = get_args(TYPE_FAILED_STATES)

TYPE_SUCCESSFUL_STATES = Literal["complete", "stopped_by_user", "stopped_quota_reached"]
SUCCESSFUL_STATES = get_args(TYPE_SUCCESSFUL_STATES)

TYPE_RUNNING_AND_STARTING_STATES = Literal[TYPE_STARTING_STATES, TYPE_RUNNING_STATES]
RUNNING_AND_STARTING_STATES = [*STARTING_STATES, *RUNNING_STATES]

RUNNING_AND_STARTING_ONLY = ["starting", *RUNNING_STATES]

TYPE_NON_RUNNING_STATES = Literal[TYPE_FAILED_STATES, TYPE_SUCCESSFUL_STATES]
NON_RUNNING_STATES = [*FAILED_STATES, *SUCCESSFUL_STATES]

TYPE_ALL_CRAWL_STATES = Literal[
    TYPE_RUNNING_AND_STARTING_STATES, TYPE_NON_RUNNING_STATES
]
ALL_CRAWL_STATES = [*RUNNING_AND_STARTING_STATES, *NON_RUNNING_STATES]


# ============================================================================

### CRAWL CONFIGS ###


# ============================================================================
class JobType(str, Enum):
    """Job Types"""

    URL_LIST = "url-list"
    SEED_CRAWL = "seed-crawl"
    CUSTOM = "custom"


# ============================================================================
class ScopeType(str, Enum):
    """Crawl scope type"""

    PAGE = "page"
    PAGE_SPA = "page-spa"
    PREFIX = "prefix"
    HOST = "host"
    DOMAIN = "domain"
    ANY = "any"
    CUSTOM = "custom"


# ============================================================================
class EmptyStr(ConstrainedStr):
    """empty string only"""

    min_length = 0
    max_length = 0


# ============================================================================
class Seed(BaseModel):
    """Crawl seed"""

    url: HttpUrl
    scopeType: Optional[ScopeType] = None

    include: Union[str, List[str], None] = None
    exclude: Union[str, List[str], None] = None
    sitemap: Union[bool, HttpUrl, None] = None
    allowHash: Optional[bool] = None
    depth: Optional[int] = None
    extraHops: Optional[int] = None


# ============================================================================
class RawCrawlConfig(BaseModel):
    """Base Crawl Config"""

    seeds: Optional[List[Seed]]

    scopeType: Optional[ScopeType] = ScopeType.PREFIX

    include: Union[str, List[str], None] = None
    exclude: Union[str, List[str], None] = None

    depth: Optional[int] = -1
    limit: Optional[int] = 0
    extraHops: Optional[int] = 0

    lang: Optional[str]
    blockAds: Optional[bool] = False

    behaviorTimeout: Optional[int]
    pageLoadTimeout: Optional[int]
    pageExtraDelay: Optional[int] = 0
    postLoadDelay: Optional[int] = 0

    workers: Optional[int] = None

    headless: Optional[bool] = None

    generateWACZ: Optional[bool] = None
    combineWARC: Optional[bool] = None

    useSitemap: Optional[bool] = False
    failOnFailedSeed: Optional[bool] = False

    logging: Optional[str] = None
    behaviors: Optional[str] = "autoscroll,autoplay,autofetch,siteSpecific"

    userAgent: Optional[str] = None


# ============================================================================
class CrawlConfigIn(BaseModel):
    """CrawlConfig input model, submitted via API"""

    schedule: Optional[str] = ""
    runNow: bool = False

    config: RawCrawlConfig

    name: str

    description: Optional[str]

    jobType: Optional[JobType] = JobType.CUSTOM

    profileid: Union[UUID, EmptyStr, None]
    crawlerChannel: str = "default"

    autoAddCollections: Optional[List[UUID]] = []
    tags: Optional[List[str]] = []

    crawlTimeout: int = 0
    maxCrawlSize: int = 0
    scale: Optional[conint(ge=1, le=MAX_CRAWL_SCALE)] = 1  # type: ignore

    crawlFilenameTemplate: Optional[str] = None


# ============================================================================
class ConfigRevision(BaseMongoModel):
    """Crawl Config Revision"""

    cid: UUID

    schedule: Optional[str] = ""

    config: RawCrawlConfig

    profileid: Optional[UUID]
    crawlerChannel: Optional[str]

    crawlTimeout: Optional[int] = 0
    maxCrawlSize: Optional[int] = 0
    scale: Optional[conint(ge=1, le=MAX_CRAWL_SCALE)] = 1  # type: ignore

    modified: datetime
    modifiedBy: Optional[UUID]

    rev: int = 0


# ============================================================================
class CrawlConfigCore(BaseMongoModel):
    """Core data shared between crawls and crawlconfigs"""

    schedule: Optional[str] = ""

    jobType: Optional[JobType] = JobType.CUSTOM
    config: Optional[RawCrawlConfig]

    tags: Optional[List[str]] = []

    crawlTimeout: Optional[int] = 0
    maxCrawlSize: Optional[int] = 0
    scale: Optional[conint(ge=1, le=MAX_CRAWL_SCALE)] = 1  # type: ignore

    oid: UUID

    profileid: Optional[UUID]
    crawlerChannel: Optional[str] = None


# ============================================================================
class CrawlConfigAdditional(BaseModel):
    """Additional fields shared by CrawlConfig and CrawlConfigOut."""

    name: Optional[str]
    description: Optional[str]

    created: datetime
    createdBy: Optional[UUID]

    modified: Optional[datetime]
    modifiedBy: Optional[UUID]

    autoAddCollections: Optional[List[UUID]] = []

    inactive: Optional[bool] = False

    rev: int = 0

    crawlAttemptCount: Optional[int] = 0
    crawlCount: Optional[int] = 0
    crawlSuccessfulCount: Optional[int] = 0

    totalSize: Optional[int] = 0

    lastCrawlId: Optional[str]
    lastCrawlStartTime: Optional[datetime]
    lastStartedBy: Optional[UUID]
    lastCrawlTime: Optional[datetime]
    lastCrawlState: Optional[str]
    lastCrawlSize: Optional[int]

    lastRun: Optional[datetime]

    isCrawlRunning: Optional[bool] = False


# ============================================================================
class CrawlConfig(CrawlConfigCore, CrawlConfigAdditional):
    """Schedulable config"""

    id: UUID

    config: RawCrawlConfig
    createdByName: Optional[str]
    modifiedByName: Optional[str]
    lastStartedByName: Optional[str]

    def get_raw_config(self):
        """serialize config for browsertrix-crawler"""
        return self.config.dict(exclude_unset=True, exclude_none=True)


# ============================================================================
class CrawlConfigOut(CrawlConfigCore, CrawlConfigAdditional):
    """Crawl Config Output"""

    id: UUID

    lastCrawlStopping: Optional[bool] = False
    profileName: Optional[str]
    firstSeed: Optional[str]
    seedCount: int = 0

    createdByName: Optional[str]
    modifiedByName: Optional[str]
    lastStartedByName: Optional[str]


# ============================================================================
class CrawlConfigProfileOut(BaseMongoModel):
    """Crawl Config basic info for profiles"""

    name: str
    firstSeed: str
    seedCount: int


# ============================================================================
class UpdateCrawlConfig(BaseModel):
    """Update crawl config name, crawl schedule, or tags"""

    # metadata: not revision tracked
    name: Optional[str] = None
    tags: Optional[List[str]] = None
    description: Optional[str] = None
    autoAddCollections: Optional[List[UUID]] = None
    runNow: bool = False

    # crawl data: revision tracked
    schedule: Optional[str] = None
    profileid: Union[UUID, EmptyStr, None] = None
    crawlerChannel: Optional[str] = None
    crawlTimeout: Optional[int] = None
    maxCrawlSize: Optional[int] = None
    scale: Optional[conint(ge=1, le=MAX_CRAWL_SCALE)] = None  # type: ignore
    crawlFilenameTemplate: Optional[str] = None
    config: Optional[RawCrawlConfig] = None


# ============================================================================

### CRAWLER VERSIONS ###


# ============================================================================
class CrawlerChannel(BaseModel):
    """Crawler version available to use in workflows"""

    id: str
    image: str


# ============================================================================
class CrawlerChannels(BaseModel):
    """List of CrawlerChannel instances for API"""

    channels: List[CrawlerChannel] = []


# ============================================================================

### BASE CRAWLS ###


# ============================================================================
class StorageRef(BaseModel):
    """Reference to actual storage"""

    name: str
    custom: Optional[bool]

    def __init__(self, *args, **kwargs):
        if args:
            if args[0].startswith("cs-"):
                super().__init__(name=args[0][2:], custom=True)
            else:
                super().__init__(name=args[0], custom=False)
        else:
            super().__init__(**kwargs)

    def __str__(self):
        if not self.custom:
            return self.name
        return "cs-" + self.name

    def get_storage_secret_name(self, oid: str) -> str:
        """get k8s secret name for this storage and oid"""
        if not self.custom:
            return "storage-" + self.name
        return f"storage-cs-{self.name}-{oid[:12]}"

    def get_storage_extra_path(self, oid: str) -> str:
        """return extra path added to the endpoint
        using oid for default storages, no extra path for custom"""
        if not self.custom:
            return oid + "/"
        return ""


# ============================================================================
class BaseFile(BaseModel):
    """Base model for crawl and profile files"""

    filename: str
    hash: str
    size: int
    storage: StorageRef

    replicas: Optional[List[StorageRef]] = []


# ============================================================================
class CrawlFile(BaseFile):
    """file from a crawl"""

    presignedUrl: Optional[str]
    expireAt: Optional[datetime]
    crc32: int = 0


# ============================================================================
class CrawlFileOut(BaseModel):
    """output for file from a crawl (conformance to Data Resource Spec)"""

    name: str
    path: str
    hash: str
    crc32: int = 0
    size: int

    crawlId: Optional[str]
    numReplicas: int = 0
    expireAt: Optional[str]


# ============================================================================
class CrawlStats(BaseModel):
    """Crawl Stats for pages and size"""

    found: int = 0
    done: int = 0
    size: int = 0


# ============================================================================
class CoreCrawlable(BaseModel):
    # pylint: disable=too-few-public-methods
    """Core properties for crawlable run (crawl or qa run)"""

    id: str

    userid: UUID
    userName: Optional[str]

    started: datetime
    finished: Optional[datetime] = None

    state: str

    crawlExecSeconds: int = 0

    image: Optional[str]

    stats: Optional[CrawlStats] = CrawlStats()

    files: List[CrawlFile] = []

    fileSize: int = 0
    fileCount: int = 0

    errors: Optional[List[str]] = []


# ============================================================================
class BaseCrawl(CoreCrawlable, BaseMongoModel):
    """Base Crawl object (representing crawls, uploads and manual sessions)"""

    type: str

    oid: UUID
    cid: Optional[UUID] = None

    name: Optional[str] = ""

    description: Optional[str] = ""

    tags: Optional[List[str]] = []

    collectionIds: Optional[List[UUID]] = []

    reviewStatus: Optional[conint(ge=1, le=5)] = None  # type: ignore


# ============================================================================
class CollIdName(BaseModel):
    """Collection id and name object"""

    id: UUID
    name: str


# ============================================================================
class CrawlOut(BaseMongoModel):
    """Crawl output model, shared across all crawl types"""

    # pylint: disable=duplicate-code

    type: Optional[str]

    id: str

    userid: UUID
    userName: Optional[str]
    oid: UUID

    profileid: Optional[UUID]

    name: Optional[str]
    description: Optional[str]

    started: datetime
    finished: Optional[datetime]

    state: str

    stats: Optional[CrawlStats]

    fileSize: int = 0
    fileCount: int = 0

    tags: Optional[List[str]] = []

    errors: Optional[List[str]] = []

    collectionIds: Optional[List[UUID]] = []

    crawlExecSeconds: int = 0
    qaCrawlExecSeconds: int = 0

    # automated crawl fields
    config: Optional[RawCrawlConfig]
    cid: Optional[UUID]
    firstSeed: Optional[str]
    seedCount: Optional[int]
    profileName: Optional[str]
    stopping: Optional[bool]
    manual: Optional[bool]
    cid_rev: Optional[int]
    scale: Optional[conint(ge=1, le=MAX_CRAWL_SCALE)]  # type: ignore

    storageQuotaReached: Optional[bool]
    execMinutesQuotaReached: Optional[bool]

    crawlerChannel: str = "default"
    image: Optional[str]

    reviewStatus: Optional[conint(ge=1, le=5)] = None  # type: ignore

    qaRunCount: int = 0
    activeQAStats: Optional[CrawlStats]
    lastQAState: Optional[str]
    lastQAStarted: Optional[datetime]

    filePageCount: Optional[int] = 0
    errorPageCount: Optional[int] = 0


# ============================================================================
class CrawlOutWithResources(CrawlOut):
    """Crawl output model including resources"""

    resources: Optional[List[CrawlFileOut]] = []
    collections: Optional[List[CollIdName]] = []


# ============================================================================
class UpdateCrawl(BaseModel):
    """Update crawl"""

    name: Optional[str]
    description: Optional[str]
    tags: Optional[List[str]]
    collectionIds: Optional[List[UUID]]
    reviewStatus: Optional[conint(ge=1, le=5)]  # type: ignore


# ============================================================================
class DeleteCrawlList(BaseModel):
    """delete crawl list POST body"""

    crawl_ids: List[str]


# ============================================================================
class DeleteQARunList(BaseModel):
    """delete qa run list POST body"""

    qa_run_ids: List[str]


# ============================================================================

### AUTOMATED CRAWLS ###


# ============================================================================
class CrawlScale(BaseModel):
    """scale the crawl to N parallel containers"""

    scale: conint(ge=1, le=MAX_CRAWL_SCALE) = 1  # type: ignore


# ============================================================================
class QARun(CoreCrawlable, BaseModel):
    """Subdocument to track QA runs for given crawl"""


# ============================================================================
class QARunWithResources(QARun):
    """QA crawl output model including resources"""

    resources: Optional[List[CrawlFileOut]] = []


# ============================================================================
class QARunOut(BaseModel):
    """QA Run Output"""

    id: str

    userName: Optional[str]

    started: datetime
    finished: Optional[datetime] = None

    state: str

    crawlExecSeconds: int = 0

    stats: CrawlStats = CrawlStats()


# ============================================================================
class QARunBucketStats(BaseModel):
    """Model for per-bucket aggregate stats results"""

    lowerBoundary: str
    count: int


# ============================================================================
class QARunAggregateStatsOut(BaseModel):
    """QA Run aggregate stats out"""

    screenshotMatch: List[QARunBucketStats]
    textMatch: List[QARunBucketStats]


# ============================================================================
class Crawl(BaseCrawl, CrawlConfigCore):
    """Store State of a Crawl (Finished or Running)"""

    type: Literal["crawl"] = "crawl"

    cid: UUID

    config: RawCrawlConfig

    cid_rev: int = 0

    # schedule: Optional[str]
    manual: Optional[bool]

    stopping: Optional[bool] = False

    qaCrawlExecSeconds: int = 0

    qa: Optional[QARun] = None
    qaFinished: Optional[Dict[str, QARun]] = {}

    filePageCount: Optional[int] = 0
    errorPageCount: Optional[int] = 0


# ============================================================================
class CrawlCompleteIn(BaseModel):
    """Completed Crawl Webhook POST message"""

    id: str

    user: str

    filename: str
    size: int
    hash: str
    crc32: int = 0

    completed: Optional[bool] = True


# ============================================================================

### UPLOADED CRAWLS ###


# ============================================================================
class UploadedCrawl(BaseCrawl):
    """Store State of a Crawl Upload"""

    type: Literal["upload"] = "upload"


# ============================================================================
class UpdateUpload(UpdateCrawl):
    """Update modal that also includes name"""


# ============================================================================

### COLLECTIONS ###


# ============================================================================
class Collection(BaseMongoModel):
    """Org collection structure"""

    name: str = Field(..., min_length=1)
    oid: UUID
    description: Optional[str]
    modified: Optional[datetime]

    crawlCount: Optional[int] = 0
    pageCount: Optional[int] = 0
    totalSize: Optional[int] = 0

    # Sorted by count, descending
    tags: Optional[List[str]] = []

    isPublic: Optional[bool] = False


# ============================================================================
class CollIn(BaseModel):
    """Collection Passed in By User"""

    name: str = Field(..., min_length=1)
    description: Optional[str]
    crawlIds: Optional[List[str]] = []

    isPublic: Optional[bool] = False


# ============================================================================
class CollOut(Collection):
    """Collection output model with annotations."""

    resources: List[CrawlFileOut] = []


# ============================================================================
class UpdateColl(BaseModel):
    """Update collection"""

    name: Optional[str]
    description: Optional[str]
    isPublic: Optional[bool]


# ============================================================================
class AddRemoveCrawlList(BaseModel):
    """Collections to add or remove from collection"""

    crawlIds: List[str] = []


# ============================================================================

### ORGS ###


# ============================================================================
class UpdateRole(InviteToOrgRequest):
    """Update existing role for user"""


# ============================================================================
class RemoveFromOrg(InviteRequest):
    """Remove this user from org"""


# ============================================================================
class RemovePendingInvite(InviteRequest):
    """Delete pending invite to org by email"""


# ============================================================================
class RenameOrg(BaseModel):
    """Rename an existing org"""

    name: str
    slug: Optional[str] = None


# ============================================================================
class OrgStorageRefs(BaseModel):
    """Input model for setting primary storage + optional replicas"""

    storage: StorageRef

    storageReplicas: List[StorageRef] = []


# ============================================================================
class S3StorageIn(BaseModel):
    """Custom S3 Storage input model"""

    type: Literal["s3"] = "s3"

    name: str

    access_key: str
    secret_key: str
    endpoint_url: str
    bucket: str
    access_endpoint_url: Optional[str]
    region: str = ""


# ============================================================================
class S3Storage(BaseModel):
    """S3 Storage Model"""

    type: Literal["s3"] = "s3"

    endpoint_url: str
    endpoint_no_bucket_url: str
    access_key: str
    secret_key: str
    access_endpoint_url: str
    region: str = ""
    use_access_for_presign: bool = True


# ============================================================================
class OrgQuotas(BaseModel):
    """Organization quotas (settable by superadmin)"""

    maxConcurrentCrawls: Optional[int] = 0
    maxPagesPerCrawl: Optional[int] = 0
    storageQuota: Optional[int] = 0
    maxExecMinutesPerMonth: Optional[int] = 0
    extraExecMinutes: Optional[int] = 0
    giftedExecMinutes: Optional[int] = 0


# ============================================================================
class OrgCreate(BaseModel):
    """Create a new org"""

    name: Optional[str] = None
    slug: Optional[str] = None

    firstAdminInviteEmail: Optional[str] = None
    quotas: Optional[OrgQuotas] = None

    subData: Optional[Dict[str, Any]] = None


# ============================================================================
class OrgQuotaUpdate(BaseModel):
    """Organization quota update (to track changes over time)"""

    modified: datetime
    update: OrgQuotas


# ============================================================================
class OrgReadOnlyUpdate(BaseModel):
    """Organization readonly update"""

    readOnly: bool
    readOnlyReason: Optional[str] = None


# ============================================================================
class OrgWebhookUrls(BaseModel):
    """Organization webhook URLs"""

    crawlStarted: Optional[AnyHttpUrl] = None
    crawlFinished: Optional[AnyHttpUrl] = None
    crawlDeleted: Optional[AnyHttpUrl] = None
    uploadFinished: Optional[AnyHttpUrl] = None
    uploadDeleted: Optional[AnyHttpUrl] = None
    addedToCollection: Optional[AnyHttpUrl] = None
    removedFromCollection: Optional[AnyHttpUrl] = None
    collectionDeleted: Optional[AnyHttpUrl] = None


# ============================================================================
class OrgOut(BaseMongoModel):
    """Organization API output model"""

    id: UUID
    name: str
    slug: str
    users: Optional[Dict[str, Any]]

    default: bool = False
    bytesStored: int
    bytesStoredCrawls: int
    bytesStoredUploads: int
    bytesStoredProfiles: int
    origin: Optional[AnyHttpUrl] = None

    storageQuotaReached: Optional[bool]
    execMinutesQuotaReached: Optional[bool]

    # total usage and exec time
    usage: Optional[Dict[str, int]]
    crawlExecSeconds: Dict[str, int] = {}

    # qa only usage + exec time
    qaUsage: Optional[Dict[str, int]] = {}
    qaCrawlExecSeconds: Dict[str, int] = {}

    # exec time limits
    monthlyExecSeconds: Dict[str, int] = {}
    extraExecSeconds: Dict[str, int] = {}
    giftedExecSeconds: Dict[str, int] = {}

    extraExecSecondsAvailable: int = 0
    giftedExecSecondsAvailable: int = 0

    quotas: Optional[OrgQuotas] = OrgQuotas()
    quotaUpdates: Optional[List[OrgQuotaUpdate]] = []

    webhookUrls: Optional[OrgWebhookUrls] = OrgWebhookUrls()

    readOnly: Optional[bool]
    readOnlyReason: Optional[str]


# ============================================================================
class Organization(BaseMongoModel):
    """Organization Base Model"""

    id: UUID
    name: str
    slug: str
    users: Dict[str, UserRole]

    default: bool = False

    storage: StorageRef
    storageReplicas: List[StorageRef] = []
    customStorages: Dict[str, S3Storage] = {}

    bytesStored: int = 0
    bytesStoredCrawls: int = 0
    bytesStoredUploads: int = 0
    bytesStoredProfiles: int = 0

    # total usage + exec time
    usage: Dict[str, int] = {}
    crawlExecSeconds: Dict[str, int] = {}

    # qa only usage + exec time
    qaUsage: Dict[str, int] = {}
    qaCrawlExecSeconds: Dict[str, int] = {}

    # exec time limits
    monthlyExecSeconds: Dict[str, int] = {}
    extraExecSeconds: Dict[str, int] = {}
    giftedExecSeconds: Dict[str, int] = {}

    extraExecSecondsAvailable: int = 0
    giftedExecSecondsAvailable: int = 0

    quotas: Optional[OrgQuotas] = OrgQuotas()
    quotaUpdates: Optional[List[OrgQuotaUpdate]] = []

    webhookUrls: Optional[OrgWebhookUrls] = OrgWebhookUrls()

    origin: Optional[AnyHttpUrl] = None

    readOnly: Optional[bool] = False
    readOnlyReason: Optional[str] = None

    subData: Optional[Dict[str, Any]] = None

    def is_owner(self, user):
        """Check if user is owner"""
        return self._is_auth(user, UserRole.OWNER)

    def is_crawler(self, user):
        """Check if user can crawl (write)"""
        return self._is_auth(user, UserRole.CRAWLER)

    def is_viewer(self, user):
        """Check if user can view (read)"""
        return self._is_auth(user, UserRole.VIEWER)

    def _is_auth(self, user, value):
        """Check if user has at least specified permission level"""
        if user.is_superuser:
            return True

        res = self.users.get(str(user.id))
        if not res:
            return False

        return res >= value

    async def serialize_for_user(self, user: User, user_manager) -> OrgOut:
        """Serialize result based on current user access"""

        exclude = {"storage"}

        if not self.is_owner(user):
            exclude.add("users")

        if not self.is_crawler(user):
            exclude.add("usage")
            exclude.add("crawlExecSeconds")

        result = self.to_dict(
            exclude_unset=True,
            exclude_none=True,
            exclude=exclude,
        )

        if self.is_owner(user):
            result["users"] = {}

            keys = list(self.users.keys())
            user_list = await user_manager.get_user_names_by_ids(keys)

            for org_user in user_list:
                id_ = str(org_user["id"])
                role = self.users.get(id_)
                if not role:
                    continue

                result["users"][id_] = {
                    "role": role,
                    "name": org_user.get("name", ""),
                    "email": org_user.get("email", ""),
                }

        return OrgOut.from_dict(result)


# ============================================================================
class OrgMetrics(BaseModel):
    """Organization API metrics model"""

    storageUsedBytes: int
    storageUsedCrawls: int
    storageUsedUploads: int
    storageUsedProfiles: int
    storageQuotaBytes: int
    archivedItemCount: int
    crawlCount: int
    uploadCount: int
    pageCount: int
    profileCount: int
    workflowsRunningCount: int
    maxConcurrentCrawls: int
    workflowsQueuedCount: int
    collectionsCount: int
    publicCollectionsCount: int


# ============================================================================

### PAGINATION ###


# ============================================================================
class PaginatedResponse(BaseModel):
    """Paginated response model"""

    items: List[Any]
    total: int
    page: int
    pageSize: int


# ============================================================================

### PROFILES ###


# ============================================================================
class ProfileFile(BaseFile):
    """file for storing profile data"""


# ============================================================================
class Profile(BaseMongoModel):
    """Browser profile"""

    name: str
    description: Optional[str] = ""

    userid: UUID
    oid: UUID

    origins: List[str]
    resource: Optional[ProfileFile]

    created: Optional[datetime]
    createdBy: Optional[UUID] = None
    createdByName: Optional[str] = None
    modified: Optional[datetime] = None
    modifiedBy: Optional[UUID] = None
    modifiedByName: Optional[str] = None

    baseid: Optional[UUID] = None
    crawlerChannel: Optional[str]


# ============================================================================
class ProfileWithCrawlConfigs(Profile):
    """Profile with list of crawlconfigs using this profile"""

    crawlconfigs: List[CrawlConfigProfileOut] = []


# ============================================================================
class UrlIn(BaseModel):
    """Request to set url"""

    url: HttpUrl


# ============================================================================
class ProfileLaunchBrowserIn(UrlIn):
    """Request to launch new browser for creating profile"""

    profileId: Optional[UUID] = None
    crawlerChannel: str = "default"


# ============================================================================
class BrowserId(BaseModel):
    """Profile id on newly created profile"""

    browserid: str


# ============================================================================
class ProfileCreate(BaseModel):
    """Create new profile for browser id"""

    browserid: str
    name: str
    description: Optional[str] = ""
    crawlerChannel: str = "default"


# ============================================================================
class ProfileUpdate(BaseModel):
    """Update existing profile with new browser profile or metadata only"""

    browserid: Optional[str] = ""
    name: str
    description: Optional[str] = ""


# ============================================================================

### USERS ###


# ============================================================================
class UserCreate(BaseModel):
    """
    User Creation Model exposed to API
    """

    email: EmailStr
    password: str

    name: Optional[str] = ""

    inviteToken: Optional[UUID] = None


# ============================================================================
class UserUpdateEmailName(BaseModel):
    """
    Update email and/or name
    """

    email: Optional[EmailStr] = None
    name: Optional[str] = None


# ============================================================================
class UserUpdatePassword(BaseModel):
    """
    Update password, requires current password to reset
    """

    email: EmailStr
    password: str
    newPassword: str


# ============================================================================

### WEBHOOKS ###


# ============================================================================
class WebhookNotificationBody(BaseModel):
    """Base POST body model for webhook notifications"""

    # Store as str, not UUID, to make JSON-serializable
    orgId: str


# ============================================================================
class WebhookEventType(str, Enum):
    """Webhook Event Types"""

    CRAWL_STARTED = "crawlStarted"
    CRAWL_FINISHED = "crawlFinished"
    CRAWL_DELETED = "crawlDeleted"

    UPLOAD_FINISHED = "uploadFinished"
    UPLOAD_DELETED = "uploadDeleted"

    ADDED_TO_COLLECTION = "addedToCollection"
    REMOVED_FROM_COLLECTION = "removedFromCollection"
    COLLECTION_DELETED = "collectionDeleted"


# ============================================================================
class BaseCollectionItemBody(WebhookNotificationBody):
    """Webhook notification base POST body for collection changes"""

    collectionId: str
    itemIds: List[str]
    downloadUrl: str


# ============================================================================
class CollectionItemAddedBody(BaseCollectionItemBody):
    """Webhook notification POST body for collection additions"""

    event: Literal[WebhookEventType.ADDED_TO_COLLECTION] = (
        WebhookEventType.ADDED_TO_COLLECTION
    )


# ============================================================================
class CollectionItemRemovedBody(BaseCollectionItemBody):
    """Webhook notification POST body for collection removals"""

    event: Literal[WebhookEventType.REMOVED_FROM_COLLECTION] = (
        WebhookEventType.REMOVED_FROM_COLLECTION
    )


# ============================================================================
class CollectionDeletedBody(WebhookNotificationBody):
    """Webhook notification base POST body for collection changes"""

    event: Literal[WebhookEventType.COLLECTION_DELETED] = (
        WebhookEventType.COLLECTION_DELETED
    )
    collectionId: str


# ============================================================================
class BaseArchivedItemBody(WebhookNotificationBody):
    """Webhook notification POST body for when archived item is started or finished"""

    itemId: str


# ============================================================================
class BaseArchivedItemFinishedBody(BaseArchivedItemBody):
    """Webhook notification POST body for when archived item is finished"""

    resources: List[CrawlFileOut]
    state: str


# ============================================================================
class CrawlStartedBody(BaseArchivedItemBody):
    """Webhook notification POST body for when crawl starts"""

    scheduled: bool = False
    event: Literal[WebhookEventType.CRAWL_STARTED] = WebhookEventType.CRAWL_STARTED


# ============================================================================
class CrawlFinishedBody(BaseArchivedItemFinishedBody):
    """Webhook notification POST body for when crawl finishes"""

    event: Literal[WebhookEventType.CRAWL_FINISHED] = WebhookEventType.CRAWL_FINISHED


# ============================================================================
class CrawlDeletedBody(BaseArchivedItemBody):
    """Webhook notification POST body for when crawl is deleted"""

    event: Literal[WebhookEventType.CRAWL_DELETED] = WebhookEventType.CRAWL_DELETED


# ============================================================================
class UploadFinishedBody(BaseArchivedItemFinishedBody):
    """Webhook notification POST body for when upload finishes"""

    event: Literal[WebhookEventType.UPLOAD_FINISHED] = WebhookEventType.UPLOAD_FINISHED


# ============================================================================
class UploadDeletedBody(BaseArchivedItemBody):
    """Webhook notification POST body for when upload finishes"""

    event: Literal[WebhookEventType.UPLOAD_DELETED] = WebhookEventType.UPLOAD_DELETED


# ============================================================================
class WebhookNotification(BaseMongoModel):
    """Base POST body model for webhook notifications"""

    event: WebhookEventType
    oid: UUID
    body: Union[
        CrawlStartedBody,
        CrawlFinishedBody,
        CrawlDeletedBody,
        UploadFinishedBody,
        UploadDeletedBody,
        CollectionItemAddedBody,
        CollectionItemRemovedBody,
        CollectionDeletedBody,
    ]
    success: bool = False
    attempts: int = 0
    created: datetime
    lastAttempted: Optional[datetime] = None


# ============================================================================

### BACKGROUND JOBS ###


class BgJobType(str, Enum):
    """Background Job Types"""

    CREATE_REPLICA = "create-replica"
    DELETE_REPLICA = "delete-replica"


# ============================================================================
class BackgroundJob(BaseMongoModel):
    """Model for tracking background jobs"""

    id: str
    type: BgJobType
    oid: UUID
    success: Optional[bool] = None
    started: datetime
    finished: Optional[datetime] = None

    previousAttempts: Optional[List[Dict[str, Optional[datetime]]]] = None


# ============================================================================
class CreateReplicaJob(BackgroundJob):
    """Model for tracking create of replica jobs"""

    type: Literal[BgJobType.CREATE_REPLICA] = BgJobType.CREATE_REPLICA
    file_path: str
    object_type: str
    object_id: str
    replica_storage: StorageRef


# ============================================================================
class DeleteReplicaJob(BackgroundJob):
    """Model for tracking deletion of replica jobs"""

    type: Literal[BgJobType.DELETE_REPLICA] = BgJobType.DELETE_REPLICA
    file_path: str
    object_type: str
    object_id: str
    replica_storage: StorageRef


# ============================================================================
class AnyJob(BaseModel):
    """Union of all job types, for response model"""

    __root__: Union[CreateReplicaJob, DeleteReplicaJob, BackgroundJob]


# ============================================================================

### PAGES ###


# ============================================================================
class PageReviewUpdate(BaseModel):
    """Update model for page manual review/approval"""

    approved: Optional[bool] = None


# ============================================================================
class PageNoteIn(BaseModel):
    """Input model for adding page notes"""

    text: str


# ============================================================================
class PageNoteEdit(BaseModel):
    """Input model for editing page notes"""

    id: UUID
    text: str


# ============================================================================
class PageNoteDelete(BaseModel):
    """Delete model for page notes"""

    delete_list: List[UUID] = []


# ============================================================================
class PageNote(BaseModel):
    """Model for page notes, tracking user and time"""

    id: UUID
    text: str
    created: datetime = datetime.now()
    userid: UUID
    userName: str


# ============================================================================
class PageQACompare(BaseModel):
    """Model for updating pages from QA run"""

    screenshotMatch: Optional[float] = None
    textMatch: Optional[float] = None
    resourceCounts: Optional[Dict[str, int]]


# ============================================================================
class Page(BaseMongoModel):
    """Core page data, no QA"""

    id: UUID

    oid: UUID
    crawl_id: str

    # core page data
    url: AnyHttpUrl
    title: Optional[str] = None
    ts: Optional[datetime] = None
    loadState: Optional[int] = None
    status: Optional[int] = None
    mime: Optional[str] = None

    # manual review
    userid: Optional[UUID] = None
    modified: Optional[datetime] = None
    approved: Optional[bool] = None
    notes: List[PageNote] = []

    isFile: Optional[bool] = False
    isError: Optional[bool] = False

    def compute_page_type(self):
        """sets self.isFile or self.isError flags"""
        self.isFile = False
        self.isError = False
        if self.loadState == 2:
            # pylint: disable=unsupported-membership-test
            if self.mime and "html" not in self.mime:
                self.isFile = True
            elif self.title is None and self.status == 200:
                self.isFile = True

        elif self.loadState == 0:
            self.isError = True


# ============================================================================
class PageWithAllQA(Page):
    """Model for core page data + qa"""

    # automated heuristics, keyed by QA run id
    qa: Optional[Dict[str, PageQACompare]] = {}


# ============================================================================
class PageOut(Page):
    """Model for pages output, no QA"""

    status: Optional[int] = 200


# ============================================================================
class PageOutWithSingleQA(Page):
    """Page out with single QA entry"""

    qa: Optional[PageQACompare] = None
