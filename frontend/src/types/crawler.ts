type ScopeType =
  | "prefix"
  | "host"
  | "domain"
  | "page"
  | "page-spa"
  | "any"
  | "custom";

export type Seed = {
  url: string;
  scopeType: ScopeType | undefined;
  include?: string[] | null;
  exclude?: string[] | null;
  limit?: number | null;
  extraHops?: number | null;
  depth?: number | null;
};

type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

export type SeedConfig = Expand<
  Pick<Seed, "scopeType" | "include" | "exclude" | "limit" | "extraHops"> & {
    lang?: string | null;
    blockAds?: boolean;
    behaviorTimeout: number | null;
    pageLoadTimeout: number | null;
    pageExtraDelay: number | null;
    postLoadDelay: number | null;
    behaviors?: string | null;
    extraHops?: number | null;
    useSitemap?: boolean;
    failOnFailedSeed?: boolean;
    depth?: number | null;
    userAgent?: string | null;
  }
>;

export type JobType = "url-list" | "seed-crawl" | "custom";

export type WorkflowParams = {
  jobType?: JobType;
  name: string;
  schedule: string;
  scale: number;
  profileid: string | null;
  config: SeedConfig;
  tags: string[];
  crawlTimeout: number | null;
  maxCrawlSize: number | null;
  description: string | null;
  autoAddCollections: string[];
  crawlerChannel: string;
  crawlerSocksProxyServer: string | null;
};

export type CrawlConfig = WorkflowParams & {
  oid: string;
  profileName: string | null;
  image: string | null;
};

export type Workflow = CrawlConfig & {
  id: string;
  createdBy: string; // User ID
  createdByName: string | null; // User full name
  created: string; // Date string
  modifiedBy: string; // User ID
  modifiedByName: string | null; // User full name
  modified: string; // Date string
  crawlCount: number;
  crawlAttemptCount: number;
  crawlSuccessfulCount: number;
  lastCrawlId: string | null; // last finished or current crawl
  lastCrawlStartTime: string | null;
  lastCrawlTime: string | null; // when last crawl finished
  lastCrawlState: CrawlState | null;
  lastCrawlSize: number | null;
  lastStartedByName: string | null;
  lastCrawlStopping: boolean | null;
  lastRun: string;
  totalSize: string | null;
  inactive: boolean;
  firstSeed: string;
  isCrawlRunning: boolean | null;
  autoAddCollections: string[];
  seedCount: number;
};

export type ListWorkflow = Omit<Workflow, "config">;

export type ProfileReplica = {
  name: string;
  custom?: boolean;
};

export type Profile = {
  id: string;
  name: string;
  description: string;
  created: string;
  origins: string[];
  profileId: string;
  baseProfileName: string;
  oid: string;
  crawlconfigs?: { id: string; name: string }[];
  resource?: {
    name: string;
    path: string;
    hash: string;
    size: number;
    replicas: ProfileReplica[] | null;
  };
};

export type CrawlState =
  | "starting"
  | "waiting_capacity"
  | "waiting_org_limit"
  | "running"
  | "generate-wacz"
  | "uploading-wacz"
  | "pending-wait"
  | "stopping"
  | "complete"
  | "failed"
  | "skipped_quota_reached"
  | "canceled"
  | "stopped_by_user"
  | "stopped_quota_reached";

// TODO maybe convert this to an enum?
export enum ReviewStatus {
  Bad = 1,
  Poor = 2,
  Fair = 3,
  Good = 4,
  Excellent = 5,
}

type ArchivedItemBase = {
  id: string;
  userid: string;
  userName: string;
  name: string;
  description: string | null;
  oid: string;
  started: string; // UTC ISO date
  finished?: string; // UTC ISO date
  state: CrawlState;
  fileCount?: number;
  fileSize?: number;
  collectionIds: string[];
  collections: { id: string; name: string }[];
  stats: { done: string; found: string; size: string } | null;
  firstSeed: string | null;
  seedCount: number | null;
  tags: string[];
  crawlExecSeconds: number;
  qaCrawlExecSeconds: number;
  reviewStatus?: ReviewStatus;
  completions?: number;
  stopping: boolean | null;
  qaRunCount: number | null;
  activeQAStats: { done: number; found: number } | null;
  lastQAState: CrawlState | null;
  lastQAStarted: string | null;
};

export type Crawl = ArchivedItemBase &
  CrawlConfig & {
    type: "crawl";
    cid: string;
    schedule: string;
    manual: boolean;
    scale: number;
    resources?: {
      name: string;
      path: string;
      hash: string;
      size: number;
      numReplicas: number;
    }[];
  };

export type Upload = ArchivedItemBase & {
  type: "upload";
  cid: undefined;
  resources: undefined;
  crawlerChannel: "default";
  image: null;
  manual: true;
};

export type CrawlerChannel = {
  id: string;
  image: string;
};

export type CrawlerSocksProxyServer = {
  id: string;
  country_code: string;
  hostname: string;
  port: number;
  username: string;
};

export type ArchivedItem = Crawl | Upload;

export type ArchivedItemPageComment = {
  id: string;
  created: string;
  modified: string;
  userName: string;
  text: string;
};

export type ArchivedItemPage = {
  id: string;
  oid: string;
  crawl_id: string;
  url: string;
  title?: string;
  ts?: string; // Date
  load_state?: number;
  status?: number;
  userid?: string;
  modified?: string;
  approved?: boolean | null;
  notes?: ArchivedItemPageComment[];
};
