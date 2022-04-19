import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { ifDefined } from "lit/directives/if-defined.js";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";

/**
 * Usage:
 * ```ts
 * <btrix-browser-profiles-new
 *  authState=${authState}
 *  archiveId=${archiveId}
 *  browserId=${browserId}
 * ></btrix-browser-profiles-new>
 * ```
 */
@localized()
export class BrowserProfilesNew extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @property({ type: String })
  browserId!: string;

  @state()
  private isSubmitting = false;

  @state()
  private isDialogVisible = false;

  // URL params can be used to pass name and description
  // base ID determines whether this is an edit/extension
  @state()
  private params: Partial<{
    name: string;
    description: string;
    navigateUrl: string;
    profileId: string | null;
  }> = {};

  firstUpdated() {
    const params = new URLSearchParams(window.location.search);
    this.params = {
      name: params.get("name") || msg("My Profile"),
      description: params.get("description") || "",
      navigateUrl: params.get("navigateUrl") || "",
      profileId: params.get("profileId") || null,
    };
  }

  render() {
    return html`
      <div class="mb-7">
        <a
          class="text-neutral-500 hover:text-neutral-600 text-sm font-medium"
          href=${this.params.profileId
            ? `/archives/${this.archiveId}/browser-profiles/profile/${this.params.profileId}`
            : `/archives/${this.archiveId}/browser-profiles`}
          @click=${this.navLink}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle"
            >${this.params.profileId
              ? msg("Back to Profile")
              : msg("Back to Browser Profiles")}</span
          >
        </a>
      </div>

      <div
        class="flex items-center justify-between mb-3 p-2 border bg-slate-50"
      >
        <p class="text-sm text-slate-600 mr-3 p-2">
          ${msg(
            "Interact with the browser to record your browser profile. You will complete and save your profile in the next step."
          )}
        </p>

        <sl-button type="primary" @click=${() => (this.isDialogVisible = true)}>
          ${msg("Next")}
        </sl-button>
      </div>

      <btrix-profile-browser
        .authState=${this.authState}
        archiveId=${this.archiveId}
        browserId=${this.browserId}
        initialNavigateUrl=${ifDefined(this.params.navigateUrl)}
      ></btrix-profile-browser>

      <sl-dialog
        label=${msg(str`Save Browser Profile`)}
        ?open=${this.isDialogVisible}
        @sl-request-close=${() => (this.isDialogVisible = false)}
      >
        ${this.params.profileId
          ? html`
              <div class="mb-2">
                <btrix-alert class="text-sm" type="info"
                  >${msg(
                    html`Extending <strong>${this.params.name}</strong>`
                  )}</btrix-alert
                >
              </div>
            `
          : ""}
        ${this.renderForm()}
      </sl-dialog>
    `;
  }

  private renderForm() {
    return html`<sl-form @sl-submit=${this.onSubmit}>
      <div class="grid gap-5">
        <sl-input
          name="name"
          label=${msg("Name")}
          placeholder=${msg("Example (example.com)", {
            desc: "Example browser profile name",
          })}
          autocomplete="off"
          value=${this.params.name || ""}
          required
        ></sl-input>

        <sl-textarea
          name="description"
          label=${msg("Description")}
          help-text=${msg("Optional profile description")}
          placeholder=${msg("Example (example.com) login profile", {
            desc: "Example browser profile name",
          })}
          rows="2"
          autocomplete="off"
          value=${this.params.description || ""}
        ></sl-textarea>

        <div class="text-right">
          <sl-button type="text" @click=${() => (this.isDialogVisible = false)}>
            ${msg("Back")}
          </sl-button>

          <sl-button
            type="primary"
            submit
            ?disabled=${this.isSubmitting}
            ?loading=${this.isSubmitting}
          >
            ${msg("Create Profile")}
          </sl-button>
        </div>
      </div>
    </sl-form>`;
  }

  private async onSubmit(event: { detail: { formData: FormData } }) {
    this.isSubmitting = true;

    const { formData } = event.detail;
    const params = {
      browserid: this.browserId,
      name: formData.get("name"),
      description: formData.get("description"),
    };

    try {
      let data: {
        id: string;
      };

      if (this.params.profileId) {
        data = await this.apiFetch(
          `/archives/${this.archiveId}/profiles/${this.params.profileId}`,
          this.authState!,
          {
            method: "PATCH",
            body: JSON.stringify(params),
          }
        );
      } else {
        data = await this.apiFetch(
          `/archives/${this.archiveId}/profiles`,
          this.authState!,
          {
            method: "POST",
            body: JSON.stringify(params),
          }
        );
      }

      this.notify({
        message: msg("Successfully created browser profile."),
        type: "success",
        icon: "check2-circle",
      });

      this.navTo(
        `/archives/${this.archiveId}/browser-profiles/profile/${data.id}`
      );
    } catch (e) {
      this.isSubmitting = false;

      this.notify({
        message: msg("Sorry, couldn't create browser profile at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }
}

customElements.define("btrix-browser-profiles-new", BrowserProfilesNew);
