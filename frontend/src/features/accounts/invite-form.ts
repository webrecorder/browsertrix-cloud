import { localized, msg } from "@lit/localize";
import { type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import sortBy from "lodash/fp/sortBy";

import type { OrgData } from "@/types/org";
import { isApiError } from "@/utils/api";
import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";

const sortByName = sortBy("name");

/**
 * @event success
 */
@localized()
@customElement("btrix-invite-form")
export class InviteForm extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Array })
  orgs?: OrgData[] = [];

  @property({ type: Object })
  defaultOrg: Partial<OrgData> | null = null;

  @state()
  private isSubmitting = false;

  @state()
  private serverError?: string;

  @state()
  private selectedOrgId?: string;

  willUpdate(changedProperties: PropertyValues<this> & Map<string, unknown>) {
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

    const sortedOrgs = sortByName(this.orgs) as unknown as OrgData[];

    return html`
      <form
        class="max-w-md"
        @submit=${this.onSubmit}
        aria-describedby="formError"
      >
        <div class="mb-5">
          <sl-select
            label=${msg("Organization")}
            value=${ifDefined(
              this.defaultOrg ? this.defaultOrg.id : sortedOrgs[0]?.id,
            )}
            @sl-change=${(e: Event) => {
              this.selectedOrgId = (e.target as HTMLSelectElement).value;
            }}
            ?disabled=${sortedOrgs.length === 1}
            required
          >
            ${sortedOrgs.map(
              (org) => html`
                <sl-option value=${org.id}>${org.name}</sl-option>
              `,
            )}
          </sl-select>
        </div>
        <div class="mb-5">
          <sl-input
            id="inviteEmail"
            name="inviteEmail"
            type="email"
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
    const inviteEmail = formData.get("inviteEmail") as string;

    try {
      const data = await this.apiFetch<{ invited: string }>(
        `/orgs/${this.selectedOrgId}/invite`,
        this.authState,
        {
          method: "POST",
          body: JSON.stringify({
            email: inviteEmail,
            role: 10,
          }),
        },
      );

      this.dispatchEvent(
        new CustomEvent("success", {
          detail: {
            inviteEmail,
            isExistingUser: data.invited === "existing_user",
          },
        }),
      );
    } catch (e) {
      if (isApiError(e)) {
        this.serverError = e.message;
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
