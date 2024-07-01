import { localized, msg, str } from "@lit/localize";
import type { SlInput } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import slugify from "slugify";

import type { APIUser } from "@/index";
import type { APIPaginatedList } from "@/types/api";
import type { CurrentUser } from "@/types/user";
import { isApiError } from "@/utils/api";
import type { AuthState } from "@/utils/AuthService";
import { maxLengthValidator } from "@/utils/form";
import LiteElement, { html } from "@/utils/LiteElement";
import { AccessCode, isAdmin, isCrawler, type OrgData } from "@/utils/orgs";
import appState, { AppStateService, use } from "@/utils/state";
import { formatAPIUser } from "@/utils/user";

type Tab = "information" | "members" | "billing";
type User = {
  email: string;
  role: number;
};
type Invite = User & {
  created: string;
  inviterEmail: string;
};
export type Member = User & {
  name: string;
};
export type UserRoleChangeEvent = CustomEvent<{
  user: Member;
  newRole: number;
}>;
export type OrgRemoveMemberEvent = CustomEvent<{
  member: Member;
}>;

/**
 * Usage:
 * ```ts
 * <btrix-org-settings
 *  .authState=${authState}
 *  .userInfo=${userInfo}
 *  .org=${org}
 *  .orgId=${orgId}
 *  ?isAddingMember=${isAddingMember}
 * ></btrix-org-settings>
 * ```
 *
 * @fires org-user-role-change
 * @fires org-remove-member
 */
@localized()
@customElement("btrix-org-settings")
export class OrgSettings extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo!: CurrentUser;

  @property({ type: String })
  orgId!: string;

  @property({ type: Object })
  org!: OrgData;

  @property({ type: String })
  activePanel: Tab = "information";

  @property({ type: Boolean })
  isAddingMember = false;

  @use()
  appState = appState;

  @state()
  private isSavingOrgName = false;

  @state()
  private pendingInvites: Invite[] = [];

  @state()
  private isAddMemberFormVisible = false;

  @state()
  private isSubmittingInvite = false;

  @state()
  private slugValue = "";

  private get tabLabels(): Record<Tab, string> {
    return {
      information: msg("General"),
      members: msg("Members"),
      billing: msg("Billing"),
    };
  }

  private readonly validateOrgNameMax = maxLengthValidator(40);

  async willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("isAddingMember") && this.isAddingMember) {
      this.isAddMemberFormVisible = true;
    }
    if (
      changedProperties.has("activePanel") &&
      this.activePanel === "members"
    ) {
      void this.fetchPendingInvites();
    }
  }

  render() {
    return html`<header class="mb-5">
        <h1 class="text-xl font-semibold leading-8">${msg("Org Settings")}</h1>
      </header>

      <btrix-tab-list activePanel=${this.activePanel} hideIndicator>
        <header slot="header" class="flex h-5 items-end justify-between">
          ${when(
            this.activePanel === "members",
            () => html`
              <h3>${msg("Active Members")}</h3>
              <sl-button
                href=${`${this.orgBasePath}/settings/members?invite`}
                variant="primary"
                size="small"
                @click=${this.navLink}
              >
                <sl-icon
                  slot="prefix"
                  name="person-add"
                  aria-hidden="true"
                  library="default"
                ></sl-icon>
                ${msg("Invite New Member")}</sl-button
              >
            `,
            () => html` <h3>${this.tabLabels[this.activePanel]}</h3> `,
          )}
        </header>
        ${this.renderTab("information", "settings")}
        ${this.renderTab("members", "settings/members")}
        ${when(this.appState.settings?.billingEnabled, () =>
          this.renderTab("billing", "settings/billing"),
        )}

        <btrix-tab-panel name="information">
          ${this.renderInformation()}
        </btrix-tab-panel>
        <btrix-tab-panel name="members">
          ${this.renderMembers()}
        </btrix-tab-panel>
        <btrix-tab-panel name="billing">
          ${this.renderBilling()}
        </btrix-tab-panel>
      </btrix-tab-list>`;
  }

  private renderTab(name: Tab, path: string) {
    const isActive = name === this.activePanel;
    return html`
      <btrix-navigation-button
        slot="nav"
        href=${`${this.orgBasePath}/${path}`}
        .active=${isActive}
        @click=${this.navLink}
        aria-selected=${isActive}
      >
        ${this.tabLabels[name]}
      </btrix-navigation-button>
    `;
  }

  private renderInformation() {
    return html`<div class="rounded-lg border">
      <form @submit=${this.onOrgInfoSubmit}>
        <div class="grid grid-cols-5 gap-x-4 p-4 md:gap-y-6">
          ${this.renderMainCol(html`
            <sl-input
              class="with-max-help-text mb-2"
              name="orgName"
              size="small"
              label=${msg("Org Name")}
              placeholder=${msg("My Organization")}
              autocomplete="off"
              value=${this.org.name}
              minlength="2"
              required
              help-text=${this.validateOrgNameMax.helpText}
              @sl-input=${this.validateOrgNameMax.validate}
            ></sl-input>
          `)}
          ${this.renderInfoCol(
            msg(
              "Name of your organization that is visible to all org members.",
            ),
          )}
          ${this.renderMainCol(html`
            <sl-input
              class="mb-2"
              name="orgSlug"
              size="small"
              label=${msg("Custom URL Identifier")}
              placeholder="my-organization"
              autocomplete="off"
              value=${this.org.slug}
              minlength="2"
              maxlength="30"
              required
              help-text=${msg(
                str`Org home page: ${window.location.protocol}//${
                  window.location.hostname
                }/orgs/${
                  this.slugValue ? this.slugify(this.slugValue) : this.org.slug
                }`,
              )}
              @sl-input=${(e: InputEvent) => {
                const input = e.target as SlInput;
                this.slugValue = input.value;
              }}
            ></sl-input>
          `)}
          ${this.renderInfoCol(
            msg(
              "Customize your organization's web address for accessing Browsertrix.",
            ),
          )}
          ${this.renderMainCol(html`
            <btrix-copy-field
              class="mb-2"
              label=${msg("Org ID")}
              value=${this.org.id}
            ></btrix-copy-field>
          `)}
          ${this.renderInfoCol(
            msg("Use this ID to reference this org in the Browsertrix API."),
          )}
        </div>
        <footer class="flex justify-end border-t px-4 py-3">
          <sl-button
            class="inline-control-button"
            type="submit"
            size="small"
            variant="primary"
            ?disabled=${this.isSavingOrgName}
            ?loading=${this.isSavingOrgName}
            >${msg("Save Changes")}</sl-button
          >
        </footer>
      </form>
    </div>`;
  }

  private renderMembers() {
    const columnWidths = ["1fr", "2fr", "auto", "min-content"];
    const rows = Object.entries(this.org.users!).map(([_id, user]) => [
      user.name,
      user.email,
      this.renderUserRoleSelect(user),
      this.renderRemoveMemberButton(user),
    ]);
    return html`
      <section>
        <btrix-data-table
          .columns=${[
            msg("Name"),
            msg("Email"),
            msg("Role"),
            html`<span class="sr-only">${msg("Delete")}</span>`,
          ]}
          .rows=${rows}
          .columnWidths=${columnWidths}
        >
        </btrix-data-table>
      </section>

      ${when(
        this.pendingInvites.length,
        () => html`
          <section class="mt-7">
            <h3 class="mb-2 text-lg font-semibold">
              ${msg("Pending Invites")}
            </h3>

            <btrix-data-table
              .columns=${[
                msg("Email"),
                msg("Role"),
                html`<span class="sr-only">${msg("Remove")}</span>`,
              ]}
              .rows=${this.pendingInvites.map((user) => [
                user.email,
                this.renderUserRole(user),
                this.renderRemoveInviteButton(user),
              ])}
              .columnWidths=${columnWidths}
            >
            </btrix-data-table>
          </section>
        `,
      )}

      <btrix-dialog
        .label=${msg("Invite New Member")}
        .open=${this.isAddingMember}
        @sl-request-close=${this.hideInviteDialog}
        @sl-show=${() => (this.isAddMemberFormVisible = true)}
        @sl-after-hide=${() => (this.isAddMemberFormVisible = false)}
      >
        ${this.isAddMemberFormVisible ? this.renderInviteForm() : ""}
      </btrix-dialog>
    `;
  }

  private renderBilling() {
    return html`
      <div class="rounded-lg border">
        <div class="grid grid-cols-5 gap-x-4 p-4 md:gap-y-6">
          ${this.renderMainCol(html`
            <h4 class="form-label text-xs text-neutral-800">
              ${msg("Current Plan")}
            </h4>
            <btrix-card>
              <div slot="title" class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <sl-icon class="text-success" name="check-circle"></sl-icon>
                  ${msg("Active")}
                </div>
                <a
                  class="transition-color flex items-center gap-2 px-2 py-1 text-sm leading-none text-primary hover:text-primary-500"
                  href="#"
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  ${msg("Manage Plan")}
                  <sl-icon slot="suffix" name="arrow-right"></sl-icon>
                </a>
              </div>
              <ul>
                <li>[quota]</li>
                <li>[quota]</li>
                <li>[quota]</li>
                <li>[quota]</li>
              </ul>
            </btrix-card>
          `)}
          ${this.renderInfoCol(html`
            <p class="mb-3">
              ${msg("Hosted plan status, quotas, and add-ons, if applicable.")}
            </p>
            <p class="leading-normal">
              ${msg(
                "You can view plan details, update payment methods, and update billing information by clicking “Manage Plan”. This will redirect you to our payment processor in a new tab.",
              )}
            </p>
          `)}
        </div>
      </div>
    `;
  }

  private renderMainCol(content: TemplateResult<1>) {
    return html`
      <div class="col-span-5 self-baseline md:col-span-3">${content}</div>
    `;
  }

  private renderInfoCol(content: string | TemplateResult<1>) {
    return html`
      <div class="col-span-5 mb-6 flex gap-2 md:col-span-2 md:mb-0 md:mt-8">
        <div class="text-base">
          <sl-icon name="info-circle"></sl-icon>
        </div>
        <div class="mt-0.5 text-xs text-neutral-500">${content}</div>
      </div>
    `;
  }

  private renderUserRole({ role }: User) {
    if (isAdmin(role)) return msg("Admin");
    if (isCrawler(role)) return msg("Crawler");
    return msg("Viewer");
  }

  private renderUserRoleSelect(user: Member) {
    // Consider superadmins owners
    const userRole =
      user.role === AccessCode.superadmin ? AccessCode.owner : user.role;
    return html`<sl-select
      value=${userRole}
      size="small"
      @sl-change=${this.selectUserRole(user)}
      hoist
    >
      <sl-option value=${AccessCode.owner}>${"Admin"}</sl-option>
      <sl-option value=${AccessCode.crawler}>${"Crawler"}</sl-option>
      <sl-option value=${AccessCode.viewer}>${"Viewer"}</sl-option>
    </sl-select>`;
  }

  private renderRemoveMemberButton(member: Member) {
    let disableButton = false;
    if (member.email === this.userInfo.email) {
      const { [this.userInfo.id]: _currentUser, ...otherUsers } =
        this.org.users!;
      const hasOtherAdmin = Object.values(otherUsers).some(({ role }) =>
        isAdmin(role),
      );
      if (!hasOtherAdmin) {
        // Must be another admin in order to remove self
        disableButton = true;
      }
    }
    return html`<sl-icon-button
      class="text-base hover:text-danger"
      name="trash3"
      label=${msg("Remove org member")}
      ?disabled=${disableButton}
      aria-details=${ifDefined(
        disableButton ? msg("Cannot remove only admin member") : undefined,
      )}
      @click=${() =>
        this.dispatchEvent(
          new CustomEvent("org-remove-member", {
            detail: { member },
          }) as OrgRemoveMemberEvent,
        )}
    ></sl-icon-button>`;
  }

  private renderRemoveInviteButton(invite: Invite) {
    return html`<sl-icon-button
      class="text-base hover:text-danger"
      name="trash3"
      label=${msg("Revoke invite")}
      @click=${() => void this.removeInvite(invite)}
    ></sl-icon-button>`;
  }

  private hideInviteDialog() {
    this.navTo(`${this.orgBasePath}/settings/members`);
  }

  private renderInviteForm() {
    return html`
      <form
        id="orgInviteForm"
        @submit=${this.onOrgInviteSubmit}
        @reset=${this.hideInviteDialog}
      >
        <div class="mb-5">
          <sl-input
            id="inviteEmail"
            name="inviteEmail"
            type="email"
            label=${msg("Email")}
            placeholder=${msg("org-member@email.com", {
              desc: "Placeholder text for email to invite",
            })}
            required
          >
          </sl-input>
        </div>
        <div class="mb-5">
          <sl-radio-group
            name="role"
            label="Permission"
            value=${AccessCode.viewer}
          >
            <sl-radio value=${AccessCode.owner}>
              ${msg("Admin — Can create crawls and manage org members")}
            </sl-radio>
            <sl-radio value=${AccessCode.crawler}>
              ${msg("Crawler — Can create crawls")}
            </sl-radio>
            <sl-radio value=${AccessCode.viewer}>
              ${msg("Viewer — Can view crawls")}
            </sl-radio>
          </sl-radio-group>
        </div>
      </form>
      <div slot="footer" class="flex justify-between">
        <sl-button form="orgInviteForm" type="reset" size="small"
          >${msg("Cancel")}</sl-button
        >
        <sl-button
          form="orgInviteForm"
          variant="primary"
          type="submit"
          size="small"
          ?loading=${this.isSubmittingInvite}
          ?disabled=${this.isSubmittingInvite}
          >${msg("Invite")}</sl-button
        >
      </div>
    `;
  }

  private slugify(value: string) {
    return slugify(value, {
      strict: true,
    });
  }

  private async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }

  private async getPendingInvites() {
    const data = await this.apiFetch<APIPaginatedList<Invite>>(
      `/orgs/${this.org.id}/invites`,
      this.authState!,
    );

    return data.items;
  }

  private async fetchPendingInvites() {
    try {
      this.pendingInvites = await this.getPendingInvites();
    } catch (e) {
      console.debug(e);

      this.notify({
        message: msg("Sorry, couldn't retrieve pending invites at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async onOrgInfoSubmit(e: SubmitEvent) {
    e.preventDefault();

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;

    const { orgName } = serialize(formEl) as { orgName: string };

    const params = {
      name: orgName,
      slug: this.org.slug,
    };

    if (this.slugValue) {
      params.slug = this.slugify(this.slugValue);
    }

    this.isSavingOrgName = true;

    await this.renameOrg(params);

    this.isSavingOrgName = false;
  }

  private readonly selectUserRole = (user: User) => (e: Event) => {
    this.dispatchEvent(
      new CustomEvent("org-user-role-change", {
        detail: {
          user,
          newRole: Number((e.target as HTMLSelectElement).value),
        },
      }) as UserRoleChangeEvent,
    );
  };

  async onOrgInviteSubmit(e: SubmitEvent) {
    e.preventDefault();

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;

    const { inviteEmail, role } = serialize(formEl);

    this.isSubmittingInvite = true;

    try {
      const _data = await this.apiFetch(
        `/orgs/${this.orgId}/invite`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify({
            email: inviteEmail,
            role: Number(role),
          }),
        },
      );

      this.notify({
        message: msg(str`Successfully invited ${inviteEmail}.`),
        variant: "success",
        icon: "check2-circle",
      });

      void this.fetchPendingInvites();
      this.hideInviteDialog();
    } catch (e) {
      this.notify({
        message: isApiError(e)
          ? e.message
          : msg("Sorry, couldn't invite user at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmittingInvite = false;
  }

  private async removeInvite(invite: Invite) {
    try {
      await this.apiFetch(
        `/orgs/${this.orgId}/invites/delete`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify({
            email: invite.email,
          }),
        },
      );

      this.notify({
        message: msg(
          str`Successfully removed ${invite.email} from ${this.org.name}.`,
        ),
        variant: "success",
        icon: "check2-circle",
      });

      this.pendingInvites = this.pendingInvites.filter(
        ({ email }) => email !== invite.email,
      );
    } catch (e) {
      console.debug(e);

      this.notify({
        message: isApiError(e)
          ? e.message
          : msg(str`Sorry, couldn't remove ${invite.email} at this time.`),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async renameOrg({ name, slug }: { name: string; slug: string }) {
    try {
      await this.apiFetch(`/orgs/${this.orgId}/rename`, this.authState!, {
        method: "POST",
        body: JSON.stringify({ name, slug }),
      });

      const user = await this.getCurrentUser();

      AppStateService.updateUserInfo(formatAPIUser(user));
      AppStateService.updateOrgSlug(slug);

      this.navTo(`${this.orgBasePath}/settings`);

      this.notify({
        message: msg("Org successfully updated."),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e) {
      console.debug(e);

      this.notify({
        message:
          isApiError(e) && e.details === "duplicate_org_name"
            ? msg("This org name or URL is already taken, try another one.")
            : msg(
                "Sorry, couldn't rename organization at this time. Try again later from org settings.",
              ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCurrentUser(): Promise<APIUser> {
    return this.apiFetch("/users/me", this.authState!);
  }
}
