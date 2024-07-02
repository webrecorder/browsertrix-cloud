import { localized, msg, str } from "@lit/localize";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { sortBy } from "lodash/fp";

import type { InviteSuccessDetail } from "@/features/accounts/invite-form";
import type { APIPaginatedList } from "@/types/api";
import type { CurrentUser } from "@/types/user";
import { isApiError } from "@/utils/api";
import type { AuthState } from "@/utils/AuthService";
import { maxLengthValidator } from "@/utils/form";
import LiteElement, { html } from "@/utils/LiteElement";
import type { OrgData } from "@/utils/orgs";

/**
 * @fires btrix-update-user-info
 */
@localized()
@customElement("btrix-home")
export class Home extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @property({ type: String })
  slug?: string;

  @state()
  private orgList?: OrgData[];

  @state()
  private isAddingOrg = false;

  @state()
  private isAddOrgFormVisible = false;

  @state()
  private isSubmittingNewOrg = false;

  private readonly validateOrgNameMax = maxLengthValidator(50);

  connectedCallback() {
    if (this.authState) {
      super.connectedCallback();
    } else {
      this.navTo("/log-in");
    }
  }

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("slug") && this.slug) {
      this.navTo(`/orgs/${this.slug}`);
    } else if (changedProperties.has("authState") && this.authState) {
      void this.fetchOrgs();
    }
  }

  async updated(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ) {
    const orgListUpdated = changedProperties.has("orgList") && this.orgList;
    const userInfoUpdated = changedProperties.has("userInfo") && this.userInfo;
    if (orgListUpdated || userInfoUpdated) {
      if (this.userInfo?.isAdmin && this.orgList && !this.orgList.length) {
        this.isAddingOrg = true;
      }
    }
  }

  render() {
    if (!this.userInfo || !this.orgList) {
      return html`
        <div class="my-24 flex items-center justify-center text-3xl">
          <sl-spinner></sl-spinner>
        </div>
      `;
    }

    let title: string | undefined;
    let content: TemplateResult<1> | undefined;

    if (this.userInfo.isAdmin) {
      title = msg("Welcome");
      content = this.renderAdminOrgs();
    } else {
      title = msg("Organizations");
      content = this.renderLoggedInNonAdmin();
    }

    return html`
      <div class="bg-white">
        <header
          class="mx-auto box-border w-full max-w-screen-desktop px-3 py-4 md:py-8"
        >
          <h1 class="text-xl font-medium">${title}</h1>
        </header>
        <hr />
      </div>
      <main class="mx-auto box-border w-full max-w-screen-desktop px-3 py-4">
        ${content}
      </main>
    `;
  }

  private renderAdminOrgs() {
    return html`
      <section class="mb-5 rounded-lg border bg-white p-4 md:p-6">
        <form
          @submit=${(e: SubmitEvent) => {
            const formData = new FormData(e.target as HTMLFormElement);
            const id = formData.get("crawlId");
            this.navTo(`/crawls/crawl/${id?.toString()}`);
          }}
        >
          <div class="flex flex-wrap items-center">
            <div
              class="mr-8 w-full grow-0 whitespace-nowrap text-lg font-medium md:w-min"
            >
              ${msg("Go to Crawl")}
            </div>
            <div class="mt-2 grow md:mr-2 md:mt-0">
              <sl-input
                name="crawlId"
                placeholder=${msg("Enter Crawl ID")}
                required
              ></sl-input>
            </div>
            <div class="mt-2 grow-0 text-right md:mt-0">
              <sl-button variant="neutral" type="submit">
                <sl-icon slot="suffix" name="arrow-right"></sl-icon>
                ${msg("Go")}</sl-button
              >
            </div>
          </div>
        </form>
      </section>

      <div class="grid grid-cols-5 gap-8">
        <div class="col-span-5 md:col-span-3">
          <section>
            <header
              class="mb-3 flex items-center justify-between border-b pb-3"
            >
              <h2 class="text-lg font-medium">${msg("All Organizations")}</h2>
              <sl-button
                variant="primary"
                size="small"
                @click=${() => (this.isAddingOrg = true)}
              >
                <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                ${msg("New Organization")}
              </sl-button>
            </header>
            <btrix-orgs-list
              .userInfo=${this.userInfo}
              .orgList=${this.orgList}
              @update-quotas=${this.onUpdateOrgQuotas}
            ></btrix-orgs-list>
          </section>
        </div>
        <div class="col-span-5 md:col-span-2">
          <section class="p-3 md:rounded-lg md:border md:bg-white md:p-8">
            <h2 class="mb-3 text-lg font-medium">
              ${msg("Invite User to Org")}
            </h2>
            ${this.renderInvite()}
          </section>
        </div>
      </div>

      <btrix-dialog
        .label=${msg("New Organization")}
        .open=${this.isAddingOrg}
        @sl-request-close=${(e: CustomEvent) => {
          // Disable closing if there are no orgs
          if (this.orgList?.length) {
            this.isAddingOrg = false;
          } else {
            e.preventDefault();
          }
        }}
        @sl-show=${() => (this.isAddOrgFormVisible = true)}
        @sl-after-hide=${() => (this.isAddOrgFormVisible = false)}
      >
        ${this.isAddOrgFormVisible
          ? html`
              <form
                id="newOrgForm"
                @reset=${() => (this.isAddingOrg = false)}
                @submit=${this.onSubmitNewOrg}
              >
                <div class="mb-5">
                  <sl-input
                    class="with-max-help-text"
                    name="name"
                    label=${msg("Org Name")}
                    placeholder=${msg("My Organization")}
                    autocomplete="off"
                    required
                    help-text=${this.validateOrgNameMax.helpText}
                    @sl-input=${this.validateOrgNameMax.validate}
                  >
                  </sl-input>
                </div>
              </form>
              <div slot="footer" class="flex justify-between">
                ${this.orgList?.length
                  ? html`<sl-button form="newOrgForm" type="reset" size="small">
                      ${msg("Cancel")}
                    </sl-button>`
                  : ""}

                <sl-button
                  form="newOrgForm"
                  variant="primary"
                  type="submit"
                  size="small"
                  ?loading=${this.isSubmittingNewOrg}
                  ?disabled=${this.isSubmittingNewOrg}
                >
                  ${msg("Create Org")}
                </sl-button>
              </div>
            `
          : ""}
      </btrix-dialog>
    `;
  }

  private renderLoggedInNonAdmin() {
    if (this.orgList && !this.orgList.length) {
      return html`<div class="rounded-lg border bg-white p-4 md:p-8">
        <p class="text-center text-neutral-400">
          ${msg("You don't have any organizations.")}
        </p>
      </div>`;
    }

    return html`
      <btrix-orgs-list
        .userInfo=${this.userInfo}
        .orgList=${this.orgList}
        ?skeleton=${!this.orgList}
      ></btrix-orgs-list>
    `;
  }

  private renderInvite() {
    return html`
      <btrix-invite-form
        .authState=${this.authState}
        .orgs=${this.orgList}
        @btrix-invite-success=${(e: CustomEvent<InviteSuccessDetail>) => {
          const org = this.orgList?.find(({ id }) => id === e.detail.orgId);

          this.notify({
            message: html`
              ${msg("Invite sent!")}
              <br />
              <a
                class="underline hover:no-underline"
                href="/orgs/${org?.slug || e.detail.orgId}/settings/members"
                @click=${this.navLink.bind(this)}
              >
                ${msg("View org members")}
              </a>
            `,
            variant: "success",
            icon: "check2-circle",
          });
        }}
      ></btrix-invite-form>
    `;
  }

  private async fetchOrgs() {
    this.orgList = sortBy<OrgData>("name")(await this.getOrgs());
  }

  private async getOrgs() {
    const data = await this.apiFetch<APIPaginatedList<OrgData>>(
      "/orgs",
      this.authState!,
    );

    return data.items;
  }

  private async onSubmitNewOrg(e: SubmitEvent) {
    e.preventDefault();

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;

    const params = serialize(formEl);
    this.isSubmittingNewOrg = true;

    try {
      await this.apiFetch(`/orgs/create`, this.authState!, {
        method: "POST",
        body: JSON.stringify(params),
      });

      // Update user info since orgs are checked against userInfo.orgs
      this.dispatchEvent(new CustomEvent("btrix-update-user-info"));

      await this.updateComplete;
      void this.fetchOrgs();

      this.notify({
        message: msg(str`Created new org named "${params.name}".`),
        variant: "success",
        icon: "check2-circle",
        duration: 8000,
      });
      this.isAddingOrg = false;
    } catch (e) {
      this.notify({
        message: isApiError(e)
          ? e.message
          : msg("Sorry, couldn't create organization at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmittingNewOrg = false;
  }

  async onUpdateOrgQuotas(e: CustomEvent) {
    const org = e.detail as OrgData;

    await this.apiFetch(`/orgs/${org.id}/quotas`, this.authState!, {
      method: "POST",
      body: JSON.stringify(org.quotas),
    });
  }

  async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }
}
