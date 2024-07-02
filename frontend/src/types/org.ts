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

export type OrgData = {
  id: string;
  name: string;
  slug: string;
  default: boolean;
  quotas?: Record<string, number>;
  bytesStored: number;
  bytesStoredCrawls: number;
  bytesStoredUploads: number;
  bytesStoredProfiles: number;
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
  readOnly: boolean | null;
  readOnlyReason: string | null;
};

export type OrgConfig = unknown;
