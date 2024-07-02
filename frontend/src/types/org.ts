import type { Range } from "./utils";

// From UserRole in backend
export type UserRole = "viewer" | "crawler" | "owner" | "superadmin";

export const AccessCode: Record<UserRole, number> = {
  superadmin: 100,
  viewer: 10,
  crawler: 20,
  owner: 40,
} as const;

/** `${4-digit year}-${2-digit month}` */
export type YearMonth = `${number}-${Range<0, 2>}${Range<0, 10>}`;

export type OrgQuotas = {
  extraExecMinutes: number;
  giftedExecMinutes: number;
  maxConcurrentCrawls: number;
  maxExecMinutesPerMonth: number;
  maxPagesPerCrawl: number;
  storageQuota: number;
};

export type OrgData = {
  id: string;
  name: string;
  slug: string;
  quotas: OrgQuotas;
  bytesStored: number;
  usage: { [key: YearMonth]: number } | null;
  crawlExecSeconds?: { [key: YearMonth]: number };
  monthlyExecSeconds?: { [key: YearMonth]: number };
  extraExecSeconds?: { [key: YearMonth]: number };
  giftedExecSeconds?: { [key: YearMonth]: number };
  extraExecSecondsAvailable: number;
  giftedExecSecondsAvailable: number;
  storageQuotaReached?: boolean;
  execMinutesQuotaReached?: boolean;
  users?: {
    [id: string]: {
      role: (typeof AccessCode)[UserRole];
      name: string;
      email: string;
    };
  };
};

export type OrgConfig = unknown;
