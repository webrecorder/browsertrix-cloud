import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";
import sortBy from "lodash/fp/sortBy";

import type { AuthState } from "../utils/AuthService";
import LiteElement, { html } from "../utils/LiteElement";
import { OrgData } from "../types/org";
import { isAdmin, isCrawler, AccessCode } from "../utils/orgs";

const sortByName = sortBy("name");

/**
 * @event success
 */
@localized()
export class Home extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Array })
  orgs: OrgData[] = [];

  @property({ type: Object })
  defaultOrg: OrgData | null = null;

  @state()
  private isSubmitting: boolean = false;

  @state()
  private serverError?: string;

  @state()
  private selectedOrgId?: string;

  willUpdate(changedProperties: Map<string, any>) {
    if (
      changedProperties.has("defaultOrg") &&
      this.defaultOrg &&
      !this.selectedOrgId
    ) {
      this.selectedOrgId = this.defaultOrg.id;
    }
  }

  render() {
    let formError;

    if (this.serverError) {
      formError = html`
        <div class="mb-5">
          <btrix-alert id="formError" variant="danger"
            >${this.serverError}</btrix-alert
          >
        </div>
      `;
    }

    const sortedOrgs = sortByName(this.orgs) as any as OrgData[];
    const defaultUserRole = AccessCode.crawler;

    return html`
      <form
        class="max-w-md"
        @submit=${this.onSubmit}
        aria-describedby="formError"
      >
        <div class="mb-5">
          <sl-select
            label=${msg("Organization")}
            value=${this.defaultOrg ? this.defaultOrg.id : sortedOrgs[0]?.id}
            @sl-change=${(e: Event) => {
              this.selectedOrgId = (e.target as HTMLSelectElement).value;
            }}
            ?disabled=${sortedOrgs.length === 1}
            required
          >
            ${sortedOrgs.map(
              (org) => html`
                <sl-option value=${org.id}>${org.name}</sl-option>
              `
            )}
          </sl-select>
        </div>
        <div class="mb-5">
          <sl-select
            label=${msg("Role")}
            value=${defaultUserRole}
            name="inviteRole"
          >
            <sl-option value=${AccessCode.owner}>${"Admin"}</sl-option>
            <sl-option value=${AccessCode.crawler}>${"Crawler"}</sl-option>
            <sl-option value=${AccessCode.viewer}>${"Viewer"}</sl-option>
          </sl-select>
        </div>

        <div class="mb-5">
          <sl-input
            id="inviteEmail"
            name="inviteEmail"
            type="text"
            label=${msg("Email")}
            placeholder=${msg("person@email.com", {
              desc: "Placeholder text for email to invite",
            })}
            required
          >
          </sl-input>
        </div>

        ${formError}

        <div class="text-right">
          <sl-button
            variant="primary"
            size="small"
            type="submit"
            ?loading=${this.isSubmitting}
            ?disabled=${!this.selectedOrgId || this.isSubmitting}
            >${msg("Invite")}</sl-button
          >
        </div>
      </form>
    `;
  }

  async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!this.authState || !this.selectedOrgId) return;

    const formEl = event.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;

    this.serverError = undefined;
    this.isSubmitting = true;

    const formData = new FormData(event.target as HTMLFormElement);
    const inviteRole = formData.get("inviteRole") as string;
    const inviteEmail = formData.get("inviteEmail") as string;

    try {
      const data = await this.apiFetch(
        `/orgs/${this.selectedOrgId}/invite`,
        this.authState,
        {
          method: "POST",
          body: JSON.stringify({
            email: inviteEmail,
            role: +inviteRole,
          }),
        }
      );

      this.dispatchEvent(
        new CustomEvent("success", {
          detail: {
            inviteEmail,
            isExistingUser: data.invited === "existing_user",
          },
        })
      );
    } catch (e: any) {
      if (e?.isApiError) {
        this.serverError = e?.message;
      } else {
        this.serverError = msg("Something unexpected went wrong");
      }
    }

    this.isSubmitting = false;
  }

  async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }
}
