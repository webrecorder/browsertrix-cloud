import type { UserOrg } from "@/types/user";

const ORG_STORAGE_KEY_PREFIX = "btrix.org";

/**
 * Cache and retrieve org info
 */
export default class OrgService {
  static setOrgs(orgs: UserOrg[]) {
    window.sessionStorage.setItem(
      `${ORG_STORAGE_KEY_PREFIX}.orgs`,
      JSON.stringify(orgs),
    );
  }

  static getOrgBySlug(slug: string): UserOrg | null {
    const value = window.sessionStorage.get(
      `${ORG_STORAGE_KEY_PREFIX}.orgs`,
    ) as string | undefined;
    if (!value) {
      console.debug("No orgs cached");
      return null;
    }
    const orgs = JSON.parse(value) as UserOrg[];
    return orgs.find((org: UserOrg) => org.slug === slug) ?? null;
  }
}
