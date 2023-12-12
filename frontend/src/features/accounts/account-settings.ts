import { LitElement } from "lit";
import { state, queryAsync, property, customElement } from "lit/decorators.js";
import { msg, str, localized } from "@lit/localize";
import debounce from "lodash/fp/debounce";
import { when } from "lit/directives/when.js";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import type { SlInput } from "@shoelace-style/shoelace";
import type { ZxcvbnResult } from "@zxcvbn-ts/core";

import type { CurrentUser } from "@/types/user";
import LiteElement, { html } from "@/utils/LiteElement";
import { needLogin } from "@/utils/auth";
import type { AuthState } from "@/utils/AuthService";
import PasswordService from "@/utils/PasswordService";

const { PASSWORD_MINLENGTH, PASSWORD_MAXLENGTH, PASSWORD_MIN_SCORE } =
  PasswordService;

/**
 * @fires update-user-info
 */
@localized()
@customElement("btrix-request-verify")
export class RequestVerify extends LitElement {
  @property({ type: String })
  email!: string;

  @state()
  private isRequesting: boolean = false;

  @state()
  private requestSuccess: boolean = false;

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("email")) {
      this.isRequesting = false;
      this.requestSuccess = false;
    }
  }

  createRenderRoot() {
    return this;
  }

  render() {
    if (this.requestSuccess) {
      return html`
        <div class="text-sm text-gray-500 inline-flex items-center">
          <sl-icon class="mr-1" name="check-lg"></sl-icon> ${msg("Sent", {
            desc: "Status message after sending verification email",
          })}
        </div>
      `;
    }

    return html`
      <span
        class="text-sm text-primary hover:text-indigo-400"
        role="button"
        ?disabled=${this.isRequesting}
        @click=${this.requestVerification}
      >
        ${this.isRequesting
          ? msg("Sending...")
          : msg("Resend verification email")}
      </span>
    `;
  }

  private async requestVerification() {
    this.isRequesting = true;

    const resp = await fetch("/api/auth/request-verify-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: this.email,
      }),
    });

    switch (resp.status) {
      case 202:
        this.requestSuccess = true;
        break;
      default:
        // TODO generic toast error
        break;
    }

    this.isRequesting = false;
  }
}

@needLogin
@localized()
@customElement("btrix-account-settings")
export class AccountSettings extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @state()
  sectionSubmitting: null | "name" | "email" | "password" = null;

  @state()
  private isChangingPassword = false;

  @state()
  private pwStrengthResults: null | ZxcvbnResult = null;

  @queryAsync('sl-input[name="password"]')
  private passwordInput?: Promise<SlInput | null>;

  async updated(changedProperties: Map<string, any>) {
    if (
      changedProperties.has("isChangingPassword") &&
      this.isChangingPassword
    ) {
      (await this.passwordInput)?.focus();
    }
  }

  protected firstUpdated() {
    PasswordService.setOptions();
  }

  render() {
    if (!this.userInfo) return;
    return html`
      <div class="max-w-screen-sm mx-auto">
        <h1 class="text-xl font-semibold leading-8 mb-7">
          ${msg("Account Settings")}
        </h1>
        <form class="border rounded mb-5" @submit=${this.onSubmitName}>
          <div class="p-4">
            <h2 class="text-lg font-semibold leading-none mb-4">
              ${msg("Display Name")}
            </h2>
            <p class="mb-2">
              ${msg(
                "Enter your full name, or another name to display in the orgs you belong to."
              )}
            </p>
            <sl-input
              name="displayName"
              value=${this.userInfo.name}
              maxlength="40"
              minlength="2"
              required
              aria-label=${msg("Display name")}
            ></sl-input>
          </div>
          <footer class="flex items-center justify-end border-t px-4 py-3">
            <sl-button
              type="submit"
              size="small"
              variant="primary"
              ?loading=${this.sectionSubmitting === "name"}
              >${msg("Save")}</sl-button
            >
          </footer>
        </form>
        <form class="border rounded mb-5" @submit=${this.onSubmitEmail}>
          <div class="p-4">
            <h2 class="text-lg font-semibold leading-none mb-4">
              ${msg("Email")}
            </h2>
            <p class="mb-2">${msg("Update the email you use to log in.")}</p>
            <sl-input
              name="email"
              value=${this.userInfo.email}
              type="email"
              aria-label=${msg("Email")}
            >
              <div slot="suffix">
                <sl-tooltip
                  content=${this.userInfo.isVerified
                    ? msg("Verified")
                    : msg("Needs verification")}
                  hoist
                >
                  ${this.userInfo.isVerified
                    ? html`<sl-icon
                        class="text-success"
                        name="check-lg"
                      ></sl-icon>`
                    : html`<sl-icon
                        class="text-warning"
                        name="exclamation-circle"
                      ></sl-icon>`}
                </sl-tooltip>
              </div>
            </sl-input>
          </div>
          <footer class="flex items-center justify-end border-t px-4 py-3">
            ${this.userInfo && !this.userInfo.isVerified
              ? html`
                  <btrix-request-verify
                    class="mr-auto"
                    email=${this.userInfo.email}
                  ></btrix-request-verify>
                `
              : ""}
            <sl-button
              type="submit"
              size="small"
              variant="primary"
              ?loading=${this.sectionSubmitting === "email"}
              >${msg("Save")}</sl-button
            >
          </footer>
        </form>
        <section class="border rounded mb-5">
          ${when(
            this.isChangingPassword,
            () => html`
              <form @submit=${this.onSubmitPassword}>
                <div class="p-4">
                  <h2 class="text-lg font-semibold leading-none mb-4">
                    ${msg("Password")}
                  </h2>
                  <sl-input
                    class="mb-3"
                    name="password"
                    label=${msg("Enter your current password")}
                    type="password"
                    autocomplete="current-password"
                    password-toggle
                    required
                  ></sl-input>
                  <sl-input
                    name="newPassword"
                    label=${msg("New password")}
                    type="password"
                    autocomplete="new-password"
                    password-toggle
                    minlength="8"
                    required
                    @input=${this.onPasswordInput}
                  ></sl-input>

                  ${when(this.pwStrengthResults, this.renderPasswordStrength)}
                </div>
                <footer
                  class="flex items-center justify-end border-t px-4 py-3"
                >
                  <p class="mr-auto text-gray-500">
                    ${msg(
                      str`Choose a strong password between ${PASSWORD_MINLENGTH}-${PASSWORD_MAXLENGTH} characters.`
                    )}
                  </p>
                  <sl-button
                    type="submit"
                    size="small"
                    variant="primary"
                    ?loading=${this.sectionSubmitting === "password"}
                    ?disabled=${!this.pwStrengthResults ||
                    this.pwStrengthResults.score < PASSWORD_MIN_SCORE}
                    >${msg("Save")}</sl-button
                  >
                </footer>
              </form>
            `,
            () => html`
              <div class="px-4 py-3 flex items-center justify-between">
                <h2 class="text-lg font-semibold leading-none">
                  ${msg("Password")}
                </h2>
                <sl-button
                  size="small"
                  @click=${() => (this.isChangingPassword = true)}
                  >${msg("Change Password")}</sl-button
                >
              </div>
            `
          )}
        </section>
      </div>
    `;
  }

  private renderPasswordStrength = () => html`
    <div class="mt-4">
      <btrix-pw-strength-alert
        .result=${this.pwStrengthResults ?? undefined}
        min=${PASSWORD_MIN_SCORE}
      >
      </btrix-pw-strength-alert>
    </div>
  `;

  private onPasswordInput = debounce(150)(async (e: InputEvent) => {
    const { value } = e.target as SlInput;
    if (!value || value.length < 4) {
      this.pwStrengthResults = null;
      return;
    }
    const userInputs: string[] = [];
    if (this.userInfo) {
      userInputs.push(this.userInfo.name, this.userInfo.email);
    }
    this.pwStrengthResults = await PasswordService.checkStrength(
      value,
      userInputs
    );
  }) as any;

  private async onSubmitName(e: SubmitEvent) {
    if (!this.userInfo || !this.authState) return;
    const form = e.target as HTMLFormElement;
    const input = form.querySelector("sl-input") as SlInput;
    if (!input.checkValidity()) {
      return;
    }
    e.preventDefault();
    const newName = (serialize(form).displayName as string).trim();
    if (newName === this.userInfo.name) {
      return;
    }

    this.sectionSubmitting = "name";

    try {
      await this.apiFetch(`/users/me`, this.authState, {
        method: "PATCH",
        body: JSON.stringify({
          email: this.userInfo.email,
          name: newName,
        }),
      });

      this.dispatchEvent(new CustomEvent("update-user-info"));
      this.notify({
        message: msg("Your name has been updated."),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't update name at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.sectionSubmitting = null;
  }

  private async onSubmitEmail(e: SubmitEvent) {
    if (!this.userInfo || !this.authState) return;
    const form = e.target as HTMLFormElement;
    const input = form.querySelector("sl-input") as SlInput;
    if (!input.checkValidity()) {
      return;
    }
    e.preventDefault();
    const newEmail = (serialize(form).email as string).trim();
    if (newEmail === this.userInfo.email) {
      return;
    }

    this.sectionSubmitting = "email";

    try {
      await this.apiFetch(`/users/me`, this.authState, {
        method: "PATCH",
        body: JSON.stringify({
          email: newEmail,
        }),
      });

      this.dispatchEvent(new CustomEvent("update-user-info"));
      this.notify({
        message: msg("Your email has been updated."),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't update email at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.sectionSubmitting = null;
  }

  private async onSubmitPassword(e: SubmitEvent) {
    if (!this.userInfo || !this.authState) return;
    const form = e.target as HTMLFormElement;
    const inputs = Array.from(form.querySelectorAll("sl-input"));
    if (inputs.some((input) => !input.checkValidity())) {
      return;
    }
    e.preventDefault();
    const { password, newPassword } = serialize(form);

    this.sectionSubmitting = "password";

    try {
      await this.apiFetch("/users/me/password-change", this.authState, {
        method: "PUT",
        body: JSON.stringify({
          email: this.userInfo.email,
          password,
          newPassword,
        }),
      });

      this.isChangingPassword = false;
      this.dispatchEvent(new CustomEvent("update-user-info"));
      this.notify({
        message: msg("Your password has been updated."),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e: any) {
      if (e.isApiError && e.details === "invalid_current_password") {
        this.notify({
          message: msg("Please correct your current password and try again."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      } else {
        this.notify({
          message: msg("Sorry, couldn't update password at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }

    this.sectionSubmitting = null;
  }
}
