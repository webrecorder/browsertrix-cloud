import type { AccessCode, OrgData, UserRole } from "./org";

export type UserOrg = OrgData & {
  default?: boolean;
  role: (typeof AccessCode)[UserRole];
};

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  isVerified: boolean;
  isAdmin: boolean;
  orgs: UserOrg[];
};
