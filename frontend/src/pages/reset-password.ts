import { localized, msg, str } from "@lit/localize";
import type { ZxcvbnResult } from "@zxcvbn-ts/core";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";

import type { Input as BtrixInput } from "@/components/ui/input";
import type { UnderlyingFunction } from "@/types/utils";
import type { ViewState } from "@/utils/APIRouter";
import LiteElement, { html } from "@/utils/LiteElement";
import PasswordService from "@/utils/PasswordService";

const { PASSWORD_MINLENGTH, PASSWORD_MAXLENGTH, PASSWORD_MIN_SCORE } =
  PasswordService;

@localized()
@customElement("btrix-reset-password")
export class ResetPassword extends LiteElement {
  @property({ type: Object })
  viewState!: ViewState;

  @state()
  private pwStrengthResults: null | ZxcvbnResult = null;

  @state()
  private serverError?: string;

  @state()
  private isSubmitting = false;

  protected firstUpdated() {
    void PasswordService.setOptions();
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

    return html`
      <div class="grid w-full max-w-md gap-5">
        <div class="md:rounded-lg md:border md:bg-white md:p-10 md:shadow-lg">
          <form @submit=${this.onSubmit} aria-describedby="formError">
            <div class="mb-5">
              <btrix-input
                id="password"
                name="password"
                type="password"
                label="${msg("Enter new password")}"
                help-text=${msg("Must be between 8-64 characters")}
                minlength="8"
                autocomplete="new-password"
                passwordToggle
                required
                @input=${this.onPasswordInput as UnderlyingFunction<
                  typeof this.onPasswordInput
                >}
              >
              </btrix-input>
              <p class="mt-2 text-gray-500">
                ${msg(
                  str`Choose a strong password between ${PASSWORD_MINLENGTH}-${PASSWORD_MAXLENGTH} characters.`,
                )}
              </p>
              ${when(this.pwStrengthResults, this.renderPasswordStrength)}
            </div>

            ${formError}

            <sl-button
              class="w-full"
              variant="primary"
              ?loading=${this.isSubmitting}
              ?disabled=${!this.pwStrengthResults ||
              this.pwStrengthResults.score < PASSWORD_MIN_SCORE}
              type="submit"
              >${msg("Change Password")}</sl-button
            >
          </form>
        </div>

        <div class="text-center">
          <a
            class="text-sm text-gray-400 hover:text-gray-500"
            href="/log-in/forgot-password"
            @click=${this.navLink}
            >${msg("Resend password reset email?")}</a
          >
        </div>
      </div>
    `;
  }

  private readonly renderPasswordStrength = () => html`
    <div class="my-3">
      <btrix-pw-strength-alert
        .result=${this.pwStrengthResults ?? undefined}
        min=${PASSWORD_MIN_SCORE}
      >
      </btrix-pw-strength-alert>
    </div>
  `;

  private readonly onPasswordInput = debounce(150)(async (e: InputEvent) => {
    const { value } = e.target as BtrixInput;
    if (!value || value.length < 4) {
      this.pwStrengthResults = null;
      return;
    }
    this.pwStrengthResults = await PasswordService.checkStrength(value);
  });

  async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    this.isSubmitting = true;

    const formData = new FormData(event.target as HTMLFormElement);
    const password = formData.get("password") as string;

    const resp = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: this.viewState.params.token,
        password,
      }),
    });

    switch (resp.status) {
      case 200:
        // TODO show toast notification
        this.navTo("/log-in");
        break;
      case 400:
      case 422: {
        const { detail } = await resp.json();
        if (detail === "reset_password_bad_token") {
          // TODO password validation details
          this.serverError = msg(
            "Password reset email is not valid. Request a new password reset email",
          );
        } else if (detail.code && detail.code === "invalid_password") {
          this.serverError = msg(
            "Invalid password. Must be between 8 and 64 characters",
          );
        }
        break;
      }
      default:
        this.serverError = msg("Something unexpected went wrong");
        break;
    }

    this.isSubmitting = false;
  }
}
