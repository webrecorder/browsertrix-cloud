import { localized, msg, str } from "@lit/localize";
import type { ZxcvbnResult } from "@zxcvbn-ts/core";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";

import type { Input as BtrixInput } from "@/components/ui/input";
import type { UnderlyingFunction } from "@/types/utils";
import AuthService from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";
import PasswordService from "@/utils/PasswordService";

const { PASSWORD_MINLENGTH, PASSWORD_MAXLENGTH, PASSWORD_MIN_SCORE } =
  PasswordService;

/**
 * @event submit
 * @event success
 * @event failure
 * @event authenticated
 * @event unauthenticated
 */
@localized()
@customElement("btrix-sign-up-form")
export class SignUpForm extends LiteElement {
  /** Optional read-only email, e.g. for invitations */
  @property({ type: String })
  email?: string;

  @property({ type: String })
  inviteToken?: string;

  @property({ type: Boolean })
  // TODO replace with org info
  // https://github.com/ikreymer/browsertrix-cloud/issues/35
  isOrgInvite?: boolean;

  @state()
  private serverError?: string;

  @state()
  private isSubmitting = false;

  @state()
  private pwStrengthResults: null | ZxcvbnResult = null;

  protected firstUpdated() {
    void PasswordService.setOptions();
  }

  render() {
    let serverError;

    if (this.serverError) {
      serverError = html`
        <div class="mb-5">
          <btrix-alert id="formError" variant="danger"
            >${this.serverError}</btrix-alert
          >
        </div>
      `;
    }

    return html`
      <form @submit=${this.onSubmit} aria-describedby="formError">
        <div class="mb-5">
          ${this.email
            ? html`
                <div style="font-size: var(--sl-input-label-font-size-medium)">
                  ${msg("Joining as")}
                </div>
                <div class="py-1 font-medium">${this.email}</div>
                <input
                  type="hidden"
                  id="email"
                  name="email"
                  value=${this.email}
                />
              `
            : html`
                <btrix-input
                  id="email"
                  name="email"
                  type="email"
                  label=${msg("Enter your email")}
                  placeholder=${msg("you@email.com")}
                  autocomplete="email"
                  required
                >
                </btrix-input>
              `}
        </div>
        <div class="list- mb-5">
          <btrix-input
            id="name"
            name="name"
            label=${msg("Your name")}
            placeholder=${msg("Lisa Simpson", {
              desc: "Example user’s name",
            })}
            autocomplete="nickname"
            minlength="2"
            required
          >
          </btrix-input>
          <p class="mt-2 text-gray-500">
            ${msg(
              "Your full name, nickname, or another name that org collaborators can see.",
            )}
          </p>
        </div>
        <div class="mb-5">
          <btrix-input
            id="password"
            name="password"
            type="password"
            label="${msg("Password")}"
            minlength=${PASSWORD_MINLENGTH}
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
              str`Choose a strong password between ${PASSWORD_MINLENGTH}–${PASSWORD_MAXLENGTH} characters.`,
            )}
          </p>
          ${when(this.pwStrengthResults, this.renderPasswordStrength)}
        </div>

        ${serverError}

        <sl-button
          class="w-full"
          variant="primary"
          ?loading=${this.isSubmitting}
          ?disabled=${!this.pwStrengthResults ||
          this.pwStrengthResults.score < PASSWORD_MIN_SCORE}
          type="submit"
          >${msg("Sign up")}</sl-button
        >
      </form>
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
    const userInputs: string[] = [];
    if (this.email) {
      userInputs.push(this.email);
    }
    this.pwStrengthResults = await PasswordService.checkStrength(
      value,
      userInputs,
    );
  });

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dispatchEvent(new CustomEvent("submit"));

    this.serverError = undefined;
    this.isSubmitting = true;

    const formData = new FormData(event.target as HTMLFormElement);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const name = formData.get("name") as string;
    const registerParams: {
      email: string;
      password: string;
      name: string;
      newOrg: boolean;
      inviteToken?: string;
    } = {
      email,
      password,
      name: name || email,
      newOrg: true,
    };

    if (this.inviteToken) {
      registerParams.inviteToken = this.inviteToken;

      if (this.isOrgInvite) {
        registerParams.newOrg = false;
      }
    }

    const resp = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registerParams),
    });

    let shouldLogIn = false;

    switch (resp.status) {
      case 201: {
        const data = (await resp.json()) as { id: unknown };

        if (data.id) {
          shouldLogIn = true;
        }

        break;
      }
      case 400:
      case 422: {
        const { detail } = (await resp.json()) as {
          detail: string & { code: string };
        };
        if (detail === "user_already_exists") {
          shouldLogIn = true;
        } else if (detail.code && detail.code === "invalid_password") {
          this.serverError = msg(
            "Invalid password. Must be between 8 and 64 characters",
          );
        } else {
          this.serverError = msg("Invalid email or password");
        }
        break;
      }
      default:
        this.serverError = msg("Something unexpected went wrong");
        break;
    }

    if (this.serverError) {
      this.dispatchEvent(new CustomEvent("error"));
    } else {
      this.dispatchEvent(new CustomEvent("success"));

      if (shouldLogIn) {
        try {
          await this.logIn({ email, password });
        } catch {
          this.dispatchEvent(new CustomEvent("unauthenticated"));
        }
      }
    }

    this.isSubmitting = false;
  }

  private async logIn({
    email,
    password,
  }: {
    email: string;
    password: string;
  }) {
    const data = await AuthService.login({ email, password });

    this.dispatchEvent(new CustomEvent("authenticated", { detail: data }));
  }
}
