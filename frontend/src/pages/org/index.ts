import { state, property, customElement } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import { ifDefined } from "lit/directives/if-defined.js";

import type { ViewState } from "@/utils/APIRouter";
import type { AuthState } from "@/utils/AuthService";
import type { CurrentUser } from "@/types/user";
import type { Crawl, JobType } from "@/types/crawler";
import type { OrgData } from "@/utils/orgs";
import { isAdmin, isCrawler } from "@/utils/orgs";
import LiteElement, { html } from "@/utils/LiteElement";
import { needLogin } from "@/utils/auth";
import "./workflow-detail";
import "./workflows-list";
import "./workflows-new";
import "./crawl-detail";
import "./crawls-list";
import "./collections-list";
import "./collections-new";
import "./collection-edit";
import "./collection-detail";
import "./browser-profiles-detail";
import "./browser-profiles-list";
import "./browser-profiles-new";
import "./settings";
import "./dashboard";
import type {
  Member,
  OrgInfoChangeEvent,
  UserRoleChangeEvent,
  OrgRemoveMemberEvent,
} from "./settings";
import type { Tab as CollectionTab } from "./collection-detail";
import type { SelectJobTypeEvent } from "@/features/crawl-workflows/new-workflow-dialog";
import type { QuotaUpdateDetail } from "@/controllers/api";
import { type TemplateResult } from "lit";
import { APIError } from "@/utils/api";

const RESOURCE_NAMES = ["workflow", "collection", "browser-profile", "upload"];
type ResourceName = (typeof RESOURCE_NAMES)[number];
export type SelectNewDialogEvent = CustomEvent<ResourceName>;
export type OrgTab =
  | "home"
  | "crawls"
  | "workflows"
  | "items"
  | "browser-profiles"
  | "collections"
  | "settings";

type Params = {
  workflowId?: string;
  browserProfileId?: string;
  browserId?: string;
  itemId?: string;
  collectionId?: string;
  collectionTab?: string;
  itemType?: Crawl["type"];
  jobType?: JobType;
  settingsTab?: "information" | "members";
  new?: ResourceName;
};

const defaultTab = "home";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * @fires update-user-info
 */
@needLogin
@localized()
@customElement("btrix-org")
export class Org extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @property({ type: Object })
  viewStateData?: ViewState["data"];

  @property({ type: String })
  slug!: string;

  // Path after `/orgs/:orgId/`
  @property({ type: String })
  orgPath!: string;

  @property({ type: Object })
  params!: Params;

  @property({ type: String })
  orgTab: OrgTab = defaultTab;

  @state()
  private orgStorageQuotaReached = false;

  @state()
  private showStorageQuotaAlert = false;

  @state()
  private orgExecutionMinutesQuotaReached = false;

  @state()
  private showExecutionMinutesQuotaAlert = false;

  @state()
  private openDialogName?: ResourceName;

  @state()
  private isCreateDialogVisible = false;

  @state()
  private org?: OrgData | null;

  @state()
  private isSavingOrgInfo = false;

  get userOrg() {
    if (!this.userInfo) return null;
    return this.userInfo.orgs.find(({ slug }) => slug === this.slug)!;
  }

  get orgId() {
    return this.userOrg?.id || "";
  }

  get isAdmin() {
    const userOrg = this.userOrg;
    if (userOrg) return isAdmin(userOrg.role);
    return false;
  }

  get isCrawler() {
    const userOrg = this.userOrg;
    if (userOrg) return isCrawler(userOrg.role);
    return false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener(
      "btrix-execution-minutes-quota-update",
      this.onExecutionMinutesQuotaUpdate
    );
    this.addEventListener(
      "btrix-storage-quota-update",
      this.onStorageQuotaUpdate
    );
    this.addEventListener("", () => {});
  }

  disconnectedCallback() {
    this.removeEventListener(
      "btrix-execution-minutes-quota-update",
      this.onExecutionMinutesQuotaUpdate
    );
    this.removeEventListener(
      "btrix-storage-quota-update",
      this.onStorageQuotaUpdate
    );
    super.disconnectedCallback();
  }

  async willUpdate(changedProperties: Map<string, any>) {
    if (
      (changedProperties.has("userInfo") && this.userInfo) ||
      (changedProperties.has("slug") && this.slug)
    ) {
      this.updateOrg();
    }
    if (changedProperties.has("openDialogName")) {
      // Sync URL to create dialog
      const url = new URL(window.location.href);
      if (this.openDialogName) {
        if (url.searchParams.get("new") !== this.openDialogName) {
          url.searchParams.set("new", this.openDialogName);
          this.navTo(`${url.pathname}${url.search}`);
        }
      } else {
        const prevOpenDialogName = changedProperties.get("openDialogName");
        if (
          prevOpenDialogName &&
          prevOpenDialogName === url.searchParams.get("new")
        ) {
          url.searchParams.delete("new");
          this.navTo(`${url.pathname}${url.search}`);
        }
      }
    }
  }

  private async updateOrg() {
    if (!this.userInfo || !this.orgId) return;
    try {
      this.org = await this.getOrg(this.orgId);
      this.checkStorageQuota();
      this.checkExecutionMinutesQuota();
    } catch {
      // TODO handle 404
      this.org = null;

      this.notify({
        message: msg("Sorry, couldn't retrieve organization at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  async firstUpdated() {
    // if slug is actually an orgId (UUID), attempt to lookup the slug
    // and redirect to the slug url
    if (UUID_REGEX.test(this.slug)) {
      const org = await this.getOrg(this.slug);
      const actualSlug = org && org.slug;
      if (actualSlug) {
        this.navTo(
          window.location.href
            .slice(window.location.origin.length)
            .replace(this.slug, actualSlug)
        );
        return;
      }
    }
    // Sync URL to create dialog
    const url = new URL(window.location.href);
    const dialogName = url.searchParams.get("new");
    if (dialogName && RESOURCE_NAMES.includes(dialogName)) {
      this.openDialogName = dialogName;
      this.isCreateDialogVisible = true;
    }
  }

  render() {
    if (this.org === null) {
      // TODO handle 404 and 500s
      return "";
    }

    if (!this.org || !this.userInfo) {
      // TODO combine loading state with tab panel content
      return "";
    }

    let tabPanelContent = "" as any;

    switch (this.orgTab) {
      case "home":
        tabPanelContent = this.renderDashboard();
        break;
      case "items":
        tabPanelContent = this.renderArchive();
        break;
      case "workflows":
        tabPanelContent = this.renderWorkflows();
        break;
      case "browser-profiles":
        tabPanelContent = this.renderBrowserProfiles();
        break;
      case "collections":
        tabPanelContent = this.renderCollections();
        break;
      case "settings": {
        if (this.isAdmin) {
          tabPanelContent = this.renderOrgSettings();
          break;
        }
      }
      default:
        tabPanelContent = html`<btrix-not-found
          class="flex items-center justify-center"
        ></btrix-not-found>`;
        break;
    }

    return html`
      ${this.renderStorageAlert()} ${this.renderExecutionMinutesAlert()}
      ${this.renderOrgNavBar()}
      <main>
        <div
          class="w-full max-w-screen-lg mx-auto px-3 box-border py-7"
          aria-labelledby="${this.orgTab}-tab"
        >
          ${tabPanelContent}
        </div>
      </main>
      ${this.renderNewResourceDialogs()}
    `;
  }

  private renderStorageAlert() {
    return html`
      <div
        class="transition-all ${this.showStorageQuotaAlert
          ? "bg-slate-100 border-b py-5"
          : ""}"
      >
        <div class="w-full max-w-screen-lg mx-auto px-3 box-border">
          <sl-alert
            variant="warning"
            closable
            ?open=${this.showStorageQuotaAlert}
            @sl-after-hide=${() => (this.showStorageQuotaAlert = false)}
          >
            <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
            <strong>${msg("Your org has reached its storage limit")}</strong
            ><br />
            ${msg(
              "To add archived items again, delete unneeded items and unused browser profiles to free up space, or contact us to upgrade your storage plan."
            )}
          </sl-alert>
        </div>
      </div>
    `;
  }

  private renderExecutionMinutesAlert() {
    return html`
      <div
        class="transition-all ${this.showExecutionMinutesQuotaAlert
          ? "bg-slate-100 border-b py-5"
          : ""}"
      >
        <div class="w-full max-w-screen-lg mx-auto px-3 box-border">
          <sl-alert
            variant="warning"
            closable
            ?open=${this.showExecutionMinutesQuotaAlert}
            @sl-after-hide=${() =>
              (this.showExecutionMinutesQuotaAlert = false)}
          >
            <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
            <strong
              >${msg(
                "Your org has reached its monthly execution minutes limit"
              )}</strong
            ><br />
            ${msg(
              "To purchase additional monthly execution minutes, contact us to upgrade your plan."
            )}
          </sl-alert>
        </div>
      </div>
    `;
  }

  private renderOrgNavBar() {
    return html`
      <div class="w-full max-w-screen-lg mx-auto px-3 box-border">
        <nav class="-ml-3 flex items-end overflow-x-auto">
          ${this.renderNavTab({
            tabName: "home",
            label: msg("Overview"),
            path: "",
          })}
          ${this.renderNavTab({
            tabName: "workflows",
            label: msg("Crawling"),
            path: "workflows/crawls",
          })}
          ${this.renderNavTab({
            tabName: "items",
            label: msg("Archived Items"),
            path: "items",
          })}
          ${this.renderNavTab({
            tabName: "collections",
            label: msg("Collections"),
            path: "collections",
          })}
          ${when(this.isCrawler, () =>
            this.renderNavTab({
              tabName: "browser-profiles",
              label: msg("Browser Profiles"),
              path: "browser-profiles",
            })
          )}
          ${when(this.isAdmin || this.userInfo?.isAdmin, () =>
            this.renderNavTab({
              tabName: "settings",
              label: msg("Org Settings"),
              path: "settings",
            })
          )}
        </nav>
      </div>

      <hr />
    `;
  }

  private renderNavTab({
    tabName,
    label,
    path,
  }: {
    tabName: OrgTab;
    label: string;
    path: string;
  }) {
    const isActive = this.orgTab === tabName;

    return html`
      <a
        id="${tabName}-tab"
        class="block flex-shrink-0 px-3 hover:bg-neutral-50 rounded-t transition-colors"
        href=${`${this.orgBasePath}${path ? `/${path}` : ""}`}
        aria-selected=${isActive}
        @click=${this.navLink}
      >
        <div
          class="text-sm font-medium py-3 border-b-2 transition-colors ${isActive
            ? "border-primary text-primary"
            : "border-transparent text-neutral-500 hover:border-neutral-100 hover:text-neutral-900"}"
        >
          ${label}
        </div>
      </a>
    `;
  }

  private renderNewResourceDialogs() {
    if (!this.authState || !this.orgId || !this.isCrawler) {
      return;
    }
    if (!this.isCreateDialogVisible) {
      return;
    }
    return html`
      <div
        @sl-hide=${(e: CustomEvent) => {
          e.stopPropagation();
          this.openDialogName = undefined;
        }}
        @sl-after-hide=${(e: CustomEvent) => {
          e.stopPropagation();
          this.isCreateDialogVisible = false;
        }}
      >
        <btrix-file-uploader
          orgId=${this.orgId}
          .authState=${this.authState}
          ?open=${this.openDialogName === "upload"}
          @request-close=${() => (this.openDialogName = undefined)}
          @uploaded=${() => {
            if (this.orgTab === "home") {
              this.navTo(`${this.orgBasePath}/items/upload`);
            }
          }}
        ></btrix-file-uploader>
        <btrix-new-browser-profile-dialog
          .authState=${this.authState}
          orgId=${this.orgId}
          ?open=${this.openDialogName === "browser-profile"}
        >
        </btrix-new-browser-profile-dialog>
        <btrix-new-workflow-dialog
          orgId=${this.orgId}
          ?open=${this.openDialogName === "workflow"}
          @select-job-type=${(e: SelectJobTypeEvent) => {
            this.openDialogName = undefined;
            this.navTo(`${this.orgBasePath}/workflows?new&jobType=${e.detail}`);
          }}
        >
        </btrix-new-workflow-dialog>
        <btrix-new-collection-dialog
          .authState=${this.authState}
          orgId=${this.orgId}
          ?open=${this.openDialogName === "collection"}
        >
        </btrix-new-collection-dialog>
      </div>
    `;
  }

  private renderDashboard() {
    return html`
      <btrix-dashboard
        .authState=${this.authState!}
        orgId=${this.orgId}
        .org=${this.org || null}
        ?isCrawler=${this.isCrawler}
        ?isAdmin=${this.isAdmin}
        @select-new-dialog=${this.onSelectNewDialog}
      ></btrix-dashboard>
    `;
  }

  private renderArchive() {
    if (this.params.itemId) {
      return html` <btrix-crawl-detail
        .authState=${this.authState!}
        orgId=${this.orgId}
        crawlId=${this.params.itemId}
        collectionId=${this.params.collectionId || ""}
        workflowId=${this.params.workflowId || ""}
        itemType=${this.params.itemType || "crawl"}
        ?isCrawler=${this.isCrawler}
      ></btrix-crawl-detail>`;
    }

    return html`<btrix-crawls-list
      .authState=${this.authState!}
      userId=${this.userInfo!.id}
      orgId=${this.orgId}
      ?orgStorageQuotaReached=${this.orgStorageQuotaReached}
      ?isCrawler=${this.isCrawler}
      itemType=${ifDefined(this.params.itemType || undefined)}
      @select-new-dialog=${this.onSelectNewDialog}
    ></btrix-crawls-list>`;
  }

  private renderWorkflows() {
    const isEditing = this.params.hasOwnProperty("edit");
    const isNewResourceTab =
      this.params.hasOwnProperty("new") && this.params.jobType;
    const workflowId = this.params.workflowId;

    if (workflowId) {
      return html`
        <btrix-workflow-detail
          class="col-span-5 mt-6"
          .authState=${this.authState!}
          orgId=${this.orgId}
          ?orgStorageQuotaReached=${this.orgStorageQuotaReached}
          ?orgExecutionMinutesQuotaReached=${this
            .orgExecutionMinutesQuotaReached}
          workflowId=${workflowId}
          openDialogName=${this.viewStateData?.dialog}
          ?isEditing=${isEditing}
          ?isCrawler=${this.isCrawler}
        ></btrix-workflow-detail>
      `;
    }

    if (isNewResourceTab) {
      const { workflow, seeds } = this.viewStateData || {};

      return html` <btrix-workflows-new
        class="col-span-5 mt-6"
        .authState=${this.authState!}
        orgId=${this.orgId}
        ?isCrawler=${this.isCrawler}
        .initialWorkflow=${workflow}
        .initialSeeds=${seeds}
        jobType=${ifDefined(this.params.jobType)}
        ?orgStorageQuotaReached=${this.orgStorageQuotaReached}
        ?orgExecutionMinutesQuotaReached=${this.orgExecutionMinutesQuotaReached}
        @select-new-dialog=${this.onSelectNewDialog}
      ></btrix-workflows-new>`;
    }

    return html`<btrix-workflows-list
      .authState=${this.authState!}
      orgId=${this.orgId}
      ?orgStorageQuotaReached=${this.orgStorageQuotaReached}
      ?orgExecutionMinutesQuotaReached=${this.orgExecutionMinutesQuotaReached}
      userId=${this.userInfo!.id}
      ?isCrawler=${this.isCrawler}
      @select-new-dialog=${this.onSelectNewDialog}
    ></btrix-workflows-list>`;
  }

  private renderBrowserProfiles() {
    if (this.params.browserProfileId) {
      return html`<btrix-browser-profiles-detail
        .authState=${this.authState!}
        .orgId=${this.orgId}
        profileId=${this.params.browserProfileId}
      ></btrix-browser-profiles-detail>`;
    }

    if (this.params.browserId) {
      return html`<btrix-browser-profiles-new
        .authState=${this.authState!}
        .orgId=${this.orgId}
        .browserId=${this.params.browserId}
      ></btrix-browser-profiles-new>`;
    }

    return html`<btrix-browser-profiles-list
      .authState=${this.authState!}
      .orgId=${this.orgId}
      @select-new-dialog=${this.onSelectNewDialog}
    ></btrix-browser-profiles-list>`;
  }

  private renderCollections() {
    if (this.params.collectionId) {
      if (this.orgPath.includes(`/edit/${this.params.collectionId}`)) {
        return html`<btrix-collection-edit
          .authState=${this.authState!}
          orgId=${this.orgId}
          collectionId=${this.params.collectionId}
          ?isCrawler=${this.isCrawler}
        ></btrix-collection-edit>`;
      }

      return html`<btrix-collection-detail
        .authState=${this.authState!}
        orgId=${this.orgId}
        collectionId=${this.params.collectionId}
        collectionTab=${(this.params.collectionTab as CollectionTab) ||
        "replay"}
        ?isCrawler=${this.isCrawler}
      ></btrix-collection-detail>`;
    }

    return html`<btrix-collections-list
      .authState=${this.authState!}
      orgId=${this.orgId}
      ?isCrawler=${this.isCrawler}
      @select-new-dialog=${this.onSelectNewDialog}
    ></btrix-collections-list>`;
  }

  private renderOrgSettings() {
    if (!this.userInfo || !this.org) return;
    const activePanel = this.params.settingsTab || "information";
    const isAddingMember = this.params.hasOwnProperty("invite");

    return html`<btrix-org-settings
      .authState=${this.authState}
      .userInfo=${this.userInfo}
      .org=${this.org}
      .orgId=${this.orgId}
      activePanel=${activePanel}
      ?isAddingMember=${isAddingMember}
      ?isSavingOrgName=${this.isSavingOrgInfo}
      @org-info-change=${this.onOrgInfoChange}
      @org-user-role-change=${this.onUserRoleChange}
      @org-remove-member=${this.onOrgRemoveMember}
    ></btrix-org-settings>`;
  }

  private async onSelectNewDialog(e: SelectNewDialogEvent) {
    e.stopPropagation();
    this.isCreateDialogVisible = true;
    await this.updateComplete;
    this.openDialogName = e.detail;
  }

  private async getOrg(orgId: string): Promise<OrgData> {
    const data = await this.apiFetch<OrgData>(
      `/orgs/${orgId}`,
      this.authState!
    );

    return data;
  }
  private async onOrgInfoChange(e: OrgInfoChangeEvent) {
    this.isSavingOrgInfo = true;

    try {
      await this.apiFetch(`/orgs/${this.org!.id}/rename`, this.authState!, {
        method: "POST",
        body: JSON.stringify(e.detail),
      });

      this.notify({
        message: msg("Updated organization."),
        variant: "success",
        icon: "check2-circle",
      });

      await this.dispatchEvent(
        new CustomEvent("update-user-info", { bubbles: true })
      );
      const newSlug = e.detail.slug;
      if (newSlug) {
        this.navTo(`/orgs/${newSlug}${this.orgPath}`);
      }
    } catch (e: any) {
      this.notify({
        message: e.isApiError
          ? e.message
          : msg("Sorry, couldn't update organization at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSavingOrgInfo = false;
  }

  private async onOrgRemoveMember(e: OrgRemoveMemberEvent) {
    this.removeMember(e.detail.member);
  }

  private async onStorageQuotaUpdate(e: CustomEvent<QuotaUpdateDetail>) {
    e.stopPropagation();
    const { reached } = e.detail;
    this.orgStorageQuotaReached = reached;
    if (reached) {
      this.showStorageQuotaAlert = true;
    }
  }

  private async onExecutionMinutesQuotaUpdate(
    e: CustomEvent<QuotaUpdateDetail>
  ) {
    e.stopPropagation();
    const { reached } = e.detail;
    this.orgExecutionMinutesQuotaReached = reached;
    if (reached) {
      this.showExecutionMinutesQuotaAlert = true;
    }
  }

  private async onUserRoleChange(e: UserRoleChangeEvent) {
    const { user, newRole } = e.detail;

    try {
      await this.apiFetch(`/orgs/${this.orgId}/user-role`, this.authState!, {
        method: "PATCH",
        body: JSON.stringify({
          email: user.email,
          role: newRole,
        }),
      });

      this.notify({
        message: msg(
          str`Successfully updated role for ${user.name || user.email}.`
        ),
        variant: "success",
        icon: "check2-circle",
      });
      this.org = await this.getOrg(this.orgId);
    } catch (e: any) {
      console.debug(e);

      this.notify({
        message: e.isApiError
          ? e.message
          : msg(
              str`Sorry, couldn't update role for ${
                user.name || user.email
              } at this time.`
            ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async removeMember(member: Member) {
    if (!this.org) return;
    const isSelf = member.email === this.userInfo!.email;
    if (
      isSelf &&
      !window.confirm(
        msg(
          str`Are you sure you want to remove yourself from ${this.org.name}?`
        )
      )
    ) {
      return;
    }

    try {
      await this.apiFetch(`/orgs/${this.orgId}/remove`, this.authState!, {
        method: "POST",
        body: JSON.stringify({
          email: member.email,
        }),
      });

      this.notify({
        message: msg(
          str`Successfully removed ${member.name || member.email} from ${
            this.org.name
          }.`
        ),
        variant: "success",
        icon: "check2-circle",
      });
      if (isSelf) {
        // FIXME better UX, this is the only page currently that doesn't require org...
        this.navTo("/account/settings");
      } else {
        this.org = await this.getOrg(this.orgId);
      }
    } catch (e: any) {
      console.debug(e);

      this.notify({
        message: e.isApiError
          ? e.message
          : msg(
              str`Sorry, couldn't remove ${
                member.name || member.email
              } at this time.`
            ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  checkStorageQuota() {
    this.orgStorageQuotaReached = !!this.org?.storageQuotaReached;
    this.showStorageQuotaAlert = this.orgStorageQuotaReached;
  }

  checkExecutionMinutesQuota() {
    this.orgExecutionMinutesQuotaReached = !!this.org?.execMinutesQuotaReached;
    this.showExecutionMinutesQuotaAlert = this.orgExecutionMinutesQuotaReached;
  }
}
