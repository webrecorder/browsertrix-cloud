import { localized, msg, str } from "@lit/localize";
import { type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import type { QATab } from "./archived-item-qa/types";
import type { Tab as CollectionTab } from "./collection-detail";
import type {
  Member,
  OrgRemoveMemberEvent,
  UserRoleChangeEvent,
} from "./settings/settings";

import type { QuotaUpdateDetail } from "@/controllers/api";
import type { CollectionSavedEvent } from "@/features/collections/collection-metadata-dialog";
import type { SelectJobTypeEvent } from "@/features/crawl-workflows/new-workflow-dialog";
import type { Crawl, JobType } from "@/types/crawler";
import type { CurrentUser, UserOrg } from "@/types/user";
import { isApiError } from "@/utils/api";
import type { ViewState } from "@/utils/APIRouter";
import { needLogin } from "@/utils/auth";
import type { AuthState } from "@/utils/AuthService";
import { DEFAULT_MAX_SCALE } from "@/utils/crawler";
import LiteElement, { html } from "@/utils/LiteElement";
import { isAdmin, isCrawler, type OrgData } from "@/utils/orgs";

import "./workflow-detail";
import "./workflows-list";
import "./workflows-new";
import "./archived-item-detail";
import "./archived-items";
import "./archived-item-qa/archived-item-qa";
import "./collections-list";
import "./collection-detail";
import "./browser-profiles-detail";
import "./browser-profiles-list";
import "./browser-profiles-new";
import "./settings/settings";
import "./dashboard";

const RESOURCE_NAMES = ["workflow", "collection", "browser-profile", "upload"];
type ResourceName = (typeof RESOURCE_NAMES)[number];
export type SelectNewDialogEvent = CustomEvent<ResourceName>;
export type OrgParams = {
  home: Record<string, never>;
  workflows: {
    workflowId?: string;
    jobType?: JobType;
    new?: ResourceName;
  };
  items: {
    itemType?: Crawl["type"];
    itemId?: string;
    itemPageId?: string;
    qaTab?: QATab;
    qaRunId?: string;
    workflowId?: string;
    collectionId?: string;
  };
  "browser-profiles": {
    browserProfileId?: string;
    browserId?: string;
    new?: ResourceName;
    name?: string;
    url?: string;
    description?: string;
    crawlerChannel?: string;
    profileId?: string;
    navigateUrl?: string;
  };
  collections: {
    collectionId?: string;
    collectionTab?: string;
  };
  settings: {
    settingsTab?: "information" | "members";
  };
};
export type OrgTab = keyof OrgParams;

const defaultTab = "home";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

@localized()
@customElement("btrix-org")
@needLogin
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
  params: OrgParams[OrgTab] = {};

  @property({ type: String })
  orgTab: OrgTab = defaultTab;

  @property({ type: Number })
  maxScale: number = DEFAULT_MAX_SCALE;

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
      this.onExecutionMinutesQuotaUpdate,
    );
    this.addEventListener(
      "btrix-storage-quota-update",
      this.onStorageQuotaUpdate,
    );
    this.addEventListener("", () => {});
  }

  disconnectedCallback() {
    this.removeEventListener(
      "btrix-execution-minutes-quota-update",
      this.onExecutionMinutesQuotaUpdate,
    );
    this.removeEventListener(
      "btrix-storage-quota-update",
      this.onStorageQuotaUpdate,
    );
    super.disconnectedCallback();
  }

  async willUpdate(changedProperties: Map<string, unknown>) {
    if (
      (changedProperties.has("userInfo") || changedProperties.has("slug")) &&
      this.userInfo &&
      this.slug
    ) {
      if (this.userOrg) {
        void this.updateOrg();
      } else {
        // Couldn't find org with slug, redirect to first org
        const org = this.userInfo.orgs[0] as UserOrg | undefined;
        if (org) {
          this.navTo(`/orgs/${org.slug}`);
        } else {
          // Handle edge case where user does not belong
          // to any orgs but is attempting to log in
          // TODO check if hosted instance and show support email if so
          this.notify({
            message: msg(
              "You must belong to at least one org in order to log in. Please contact your Browsertrix admin to resolve the issue.",
            ),
            variant: "danger",
            icon: "exclamation-octagon",
          });
        }

        return;
      }
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
      const actualSlug = org?.slug;
      if (actualSlug) {
        this.navTo(
          window.location.href
            .slice(window.location.origin.length)
            .replace(this.slug, actualSlug),
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
      return html`<btrix-not-found></btrix-not-found>`;
    }

    if (!this.org || !this.userInfo) {
      // TODO combine loading state with tab panel content
      return "";
    }

    let tabPanelContent: TemplateResult<1> | string | undefined = "";

    switch (this.orgTab) {
      case "home":
        tabPanelContent = this.renderDashboard();
        break;
      case "items":
        tabPanelContent = this.renderArchivedItem();
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
        // falls through
      }
      default:
        tabPanelContent = html`<btrix-not-found
          class="flex items-center justify-center"
        ></btrix-not-found>`;
        break;
    }

    const noMaxWidth =
      this.orgTab === "items" && (this.params as OrgParams["items"]).qaTab;

    return html`
      <div class="flex min-h-full flex-col">
        ${this.renderStorageAlert()} ${this.renderExecutionMinutesAlert()}
        ${this.renderOrgNavBar()}
        <main
          class="${noMaxWidth
            ? "w-full"
            : "w-full max-w-screen-desktop pt-7"} mx-auto box-border flex flex-1 flex-col p-3"
          aria-labelledby="${this.orgTab}-tab"
        >
          ${tabPanelContent}
        </main>
        ${this.renderNewResourceDialogs()}
      </div>
    `;
  }

  private renderStorageAlert() {
    return html`
      <div
        class="${this.showStorageQuotaAlert
          ? "bg-slate-100 border-b py-5"
          : ""} transition-all"
      >
        <div class="mx-auto box-border w-full max-w-screen-desktop px-3">
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
              "To add archived items again, delete unneeded items and unused browser profiles to free up space, or contact us to upgrade your storage plan.",
            )}
          </sl-alert>
        </div>
      </div>
    `;
  }

  private renderExecutionMinutesAlert() {
    return html`
      <div
        class="${this.showExecutionMinutesQuotaAlert
          ? "bg-slate-100 border-b py-5"
          : ""} transition-all"
      >
        <div class="mx-auto box-border w-full max-w-screen-desktop px-3">
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
                "Your org has reached its monthly execution minutes limit",
              )}</strong
            ><br />
            ${msg(
              "To purchase additional monthly execution minutes, contact us to upgrade your plan.",
            )}
          </sl-alert>
        </div>
      </div>
    `;
  }

  private renderOrgNavBar() {
    return html`
      <div
        class="mx-auto box-border w-full overflow-x-hidden overscroll-contain"
      >
        <nav class="-mx-3 flex items-end overflow-x-auto px-3 xl:px-6">
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
            }),
          )}
          ${when(this.isAdmin || this.userInfo?.isAdmin, () =>
            this.renderNavTab({
              tabName: "settings",
              label: msg("Org Settings"),
              path: "settings",
            }),
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
        class="block flex-shrink-0 rounded-t px-3 transition-colors hover:bg-neutral-50"
        href=${`${this.orgBasePath}${path ? `/${path}` : ""}`}
        aria-selected=${isActive}
        @click=${this.navLink}
      >
        <div
          class="${isActive
            ? "border-primary text-primary"
            : "border-transparent text-neutral-500 hover:border-neutral-100 hover:text-neutral-900"} border-b-2 py-3 text-sm font-medium transition-colors"
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
          @sl-hide=${() => (this.openDialogName = undefined)}
        >
        </btrix-new-browser-profile-dialog>
        <btrix-new-workflow-dialog
          orgId=${this.orgId}
          ?open=${this.openDialogName === "workflow"}
          @sl-hide=${() => (this.openDialogName = undefined)}
          @select-job-type=${(e: SelectJobTypeEvent) => {
            this.openDialogName = undefined;
            this.navTo(`${this.orgBasePath}/workflows?new&jobType=${e.detail}`);
          }}
        >
        </btrix-new-workflow-dialog>
        <btrix-collection-metadata-dialog
          orgId=${this.orgId}
          .authState=${this.authState}
          ?open=${this.openDialogName === "collection"}
          @sl-hide=${() => (this.openDialogName = undefined)}
          @btrix-collection-saved=${(e: CollectionSavedEvent) => {
            this.navTo(
              `${this.orgBasePath}/collections/view/${e.detail.id}/items`,
            );
          }}
        >
        </btrix-collection-metadata-dialog>
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

  private renderArchivedItem() {
    const params = this.params as OrgParams["items"];

    if (params.itemId) {
      if (params.qaTab) {
        if (!this.isCrawler) {
          return html`<btrix-not-found
            class="flex items-center justify-center"
          ></btrix-not-found>`;
        }

        return html`<btrix-archived-item-qa
          class="flex-1"
          .authState=${this.authState!}
          orgId=${this.orgId}
          itemId=${params.itemId}
          itemPageId=${ifDefined(params.itemPageId)}
          qaRunId=${ifDefined(params.qaRunId)}
          tab=${params.qaTab}
        ></btrix-archived-item-qa>`;
      }

      return html` <btrix-archived-item-detail
        .authState=${this.authState!}
        orgId=${this.orgId}
        crawlId=${params.itemId}
        collectionId=${params.collectionId || ""}
        workflowId=${params.workflowId || ""}
        itemType=${params.itemType || "crawl"}
        ?isCrawler=${this.isCrawler}
      ></btrix-archived-item-detail>`;
    }

    return html`<btrix-archived-items
      .authState=${this.authState!}
      userId=${this.userInfo!.id}
      orgId=${this.orgId}
      ?orgStorageQuotaReached=${this.orgStorageQuotaReached}
      ?isCrawler=${this.isCrawler}
      itemType=${ifDefined(params.itemType || undefined)}
      @select-new-dialog=${this.onSelectNewDialog}
    ></btrix-archived-items>`;
  }

  private renderWorkflows() {
    const params = this.params as OrgParams["workflows"];
    const isEditing = Object.prototype.hasOwnProperty.call(params, "edit");
    const isNewResourceTab =
      Object.prototype.hasOwnProperty.call(params, "new") && params.jobType;
    const workflowId = params.workflowId;

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
          .maxScale=${this.maxScale}
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
        jobType=${ifDefined(params.jobType)}
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
    const params = this.params as OrgParams["browser-profiles"];

    if (params.browserProfileId) {
      return html`<btrix-browser-profiles-detail
        .authState=${this.authState!}
        .orgId=${this.orgId}
        profileId=${params.browserProfileId}
        ?isCrawler=${this.isCrawler}
      ></btrix-browser-profiles-detail>`;
    }

    if (params.browserId) {
      return html`<btrix-browser-profiles-new
        .authState=${this.authState!}
        .orgId=${this.orgId}
        .browserId=${params.browserId}
        .browserParams=${{
          name: params.name || "",
          url: params.url || "",
          description: params.description,
          crawlerChannel: params.crawlerChannel,
          profileId: params.profileId,
          navigateUrl: params.navigateUrl,
        }}
      ></btrix-browser-profiles-new>`;
    }

    return html`<btrix-browser-profiles-list
      .authState=${this.authState!}
      .orgId=${this.orgId}
      ?isCrawler=${this.isCrawler}
      @select-new-dialog=${this.onSelectNewDialog}
    ></btrix-browser-profiles-list>`;
  }

  private renderCollections() {
    const params = this.params as OrgParams["collections"];

    if (params.collectionId) {
      return html`<btrix-collection-detail
        .authState=${this.authState!}
        orgId=${this.orgId}
        userId=${this.userInfo!.id}
        collectionId=${params.collectionId}
        collectionTab=${(params.collectionTab as CollectionTab | undefined) ||
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
    const params = this.params as OrgParams["settings"];
    const activePanel = params.settingsTab || "information";
    const isAddingMember = Object.prototype.hasOwnProperty.call(
      this.params,
      "invite",
    );

    return html`<btrix-org-settings
      .authState=${this.authState}
      .userInfo=${this.userInfo}
      .org=${this.org}
      .orgId=${this.orgId}
      activePanel=${activePanel}
      ?isAddingMember=${isAddingMember}
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

  private async getOrg(orgId: string): Promise<OrgData | undefined> {
    const data = await this.apiFetch<OrgData>(
      `/orgs/${orgId}`,
      this.authState!,
    );

    return data;
  }

  private async onOrgRemoveMember(e: OrgRemoveMemberEvent) {
    void this.removeMember(e.detail.member);
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
    e: CustomEvent<QuotaUpdateDetail>,
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
          str`Successfully updated role for ${user.name || user.email}.`,
        ),
        variant: "success",
        icon: "check2-circle",
      });
      this.org = await this.getOrg(this.orgId);
    } catch (e) {
      console.debug(e);

      this.notify({
        message: isApiError(e)
          ? e.message
          : msg(
              str`Sorry, couldn't update role for ${
                user.name || user.email
              } at this time.`,
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
          str`Are you sure you want to remove yourself from ${this.org.name}?`,
        ),
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
          }.`,
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
    } catch (e) {
      console.debug(e);

      this.notify({
        message: isApiError(e)
          ? e.message
          : msg(
              str`Sorry, couldn't remove ${
                member.name || member.email
              } at this time.`,
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
