// From UserRole in backend
export type UserRole = "viewer" | "crawler" | "owner";

export const AccessCode: Record<UserRole, number> = {
  viewer: 10,
  crawler: 20,
  owner: 40,
} as const;

export type OrgData = {
  id: string;
  name: string;
  users?: {
    [id: string]: {
      role: typeof AccessCode[UserRole];
      name: "string";
    };
  };
};

export type Org = {
  oid: string;
  name?: string;
  id?: string;
  users?: { [id: string]: OrgData };
};

export type OrgConfig = any;
