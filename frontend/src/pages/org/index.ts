import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { ViewState } from "../../utils/APIRouter";
import type { AuthState } from "../../utils/AuthService";
import type { CurrentUser } from "../../types/user";
import type { OrgData } from "../../utils/orgs";
import LiteElement, { html } from "../../utils/LiteElement";
import { needLogin } from "../../utils/auth";
import "./crawl-configs-detail";
import "./crawl-configs-list";
import "./crawl-configs-new";
import "./crawl-detail";
import "./crawls-list";
import "./browser-profiles-detail";
import "./browser-profiles-list";
import "./browser-profiles-new";
import "./org-settings";

export type OrgTab =
  | "crawls"
  | "crawl-configs"
  | "browser-profiles"
  | "settings";

type Params = {
  crawlId?: string;
  crawlConfigId?: string;
  browserProfileId?: string;
  browserId?: string;
};

const defaultTab = "crawls";

@needLogin
@localized()
export class Org extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @property({ type: Object })
  viewStateData?: ViewState["data"];

  @property({ type: Object })
  params!: Params;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  orgTab: OrgTab = defaultTab;

  @state()
  private org?: OrgData | null;

  async willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("orgId") && this.orgId) {
      try {
        const org = await this.getOrg(this.orgId);

        if (!org) {
          this.navTo("/orgs");
        } else {
          this.org = org;
        }
      } catch {
        this.org = null;

        this.notify({
          message: msg("Sorry, couldn't retrieve organization at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  render() {
    if (this.org === null) {
      // TODO handle 404 and 500s
      return "";
    }

    if (!this.org) {
      return html`
        <div
          class="absolute top-1/2 left-1/2 -mt-4 -ml-4"
          style="font-size: 2rem"
        >
          <sl-spinner></sl-spinner>
        </div>
      `;
    }

    let tabPanelContent = "" as any;

    switch (this.orgTab) {
      case "crawls":
        tabPanelContent = this.renderCrawls();
        break;
      case "crawl-configs":
        tabPanelContent = this.renderCrawlTemplates();
        break;
      case "browser-profiles":
        tabPanelContent = this.renderBrowserProfiles();
        break;
      case "settings":
        tabPanelContent = this.renderOrgSettings();
        break;
      default:
        tabPanelContent = html`<btrix-not-found
          class="flex items-center justify-center"
        ></btrix-not-found>`;
        break;
    }

    return html`
      <main>
        <div
          class="w-full max-w-screen-lg mx-auto px-3 box-border py-5"
          aria-labelledby="${this.orgTab}-tab"
        >
          ${tabPanelContent}
        </div>
      </main>
    `;
  }

  private renderCrawls() {
    const crawlsBaseUrl = `/orgs/${this.orgId}/crawls`;

    if (this.params.crawlId) {
      return html` <btrix-crawl-detail
        .authState=${this.authState!}
        crawlId=${this.params.crawlId}
        crawlsBaseUrl=${crawlsBaseUrl}
      ></btrix-crawl-detail>`;
    }

    return html`<btrix-crawls-list
      .authState=${this.authState!}
      userId=${this.userInfo!.id}
      crawlsBaseUrl=${crawlsBaseUrl}
      ?shouldFetch=${this.orgTab === "crawls"}
    ></btrix-crawls-list>`;
  }

  private renderCrawlTemplates() {
    const isEditing = this.params.hasOwnProperty("edit");
    const isNewResourceTab = this.params.hasOwnProperty("new");

    if (this.params.crawlConfigId) {
      return html`
        <btrix-crawl-configs-detail
          class="col-span-5 mt-6"
          .authState=${this.authState!}
          .orgId=${this.orgId!}
          .crawlConfigId=${this.params.crawlConfigId}
          .isEditing=${isEditing}
        ></btrix-crawl-configs-detail>
      `;
    }

    if (isNewResourceTab) {
      const crawlTemplate = this.viewStateData?.crawlTemplate;

      return html` <btrix-crawl-configs-new
        class="col-span-5 mt-6"
        .authState=${this.authState!}
        .orgId=${this.orgId!}
        .initialCrawlTemplate=${crawlTemplate}
      ></btrix-crawl-configs-new>`;
    }

    return html`<btrix-crawl-configs-list
      .authState=${this.authState!}
      .orgId=${this.orgId!}
      userId=${this.userInfo!.id}
    ></btrix-crawl-configs-list>`;
  }

  private renderBrowserProfiles() {
    const isNewResourceTab = this.params.hasOwnProperty("new");

    if (this.params.browserProfileId) {
      return html`<btrix-browser-profiles-detail
        .authState=${this.authState!}
        .orgId=${this.orgId!}
        profileId=${this.params.browserProfileId}
      ></btrix-browser-profiles-detail>`;
    }

    if (this.params.browserId) {
      return html`<btrix-browser-profiles-new
        .authState=${this.authState!}
        .orgId=${this.orgId!}
        .browserId=${this.params.browserId}
      ></btrix-browser-profiles-new>`;
    }

    return html`<btrix-browser-profiles-list
      .authState=${this.authState!}
      .orgId=${this.orgId!}
      ?showCreateDialog=${isNewResourceTab}
    ></btrix-browser-profiles-list>`;
  }

  private renderOrgSettings() {
    const isAddingMember = this.params.hasOwnProperty("invite");

    return html`<btrix-org-settings
      .authState=${this.authState}
      .userInfo=${this.userInfo}
      .org=${this.org || null}
      .orgId=${this.orgId!}
      ?isAddingMember=${isAddingMember}
    ></btrix-org-settings>`;
  }

  async getOrg(orgId: string): Promise<OrgData> {
    const data = await this.apiFetch(`/orgs/${orgId}`, this.authState!);

    return data;
  }

  updateUrl(event: CustomEvent<{ name: OrgTab }>) {
    this.navTo(`/orgs/${this.orgId}/${event.detail.name}`);
  }
}
