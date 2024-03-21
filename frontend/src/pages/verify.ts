import { localized, msg } from "@lit/localize";
import { customElement, property, state } from "lit/decorators.js";

import AuthService, { type AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";

/**
 * @fires user-info-change
 */
@localized()
@customElement("btrix-verify")
export class Verify extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  token?: string;

  @state()
  private serverError?: string;

  firstUpdated() {
    if (this.token) {
      void this.verify();
    }
  }

  render() {
    if (this.serverError) {
      return html`<btrix-alert variant="danger"
        >${this.serverError}</btrix-alert
      >`;
    }
    return html` <div class="text-3xl"><sl-spinner></sl-spinner></div> `;
  }

  private async verify(): Promise<void> {
    const resp = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: this.token,
      }),
    });

    const data = (await resp.json()) as {
      email: string;
      is_verified: boolean;
      detail?: string;
    };

    switch (resp.status) {
      case 200:
        return this.onVerificationComplete(data);
      case 400: {
        const { detail } = data;
        if (detail === "verify_user_bad_token") {
          this.serverError = msg("This verification email is not valid.");
          break;
        }

        if (detail === "verify_user_already_verified") {
          return this.onVerificationComplete(data);
        }
        // falls through
      }
      default:
        this.serverError = msg("Something unexpected went wrong");
        break;
    }
  }

  private onVerificationComplete(data: {
    email: string;
    is_verified: boolean;
  }) {
    const isLoggedIn = Boolean(this.authState);
    const shouldLogOut = isLoggedIn && this.authState?.username !== data.email;

    this.notify({
      title: msg("Email address verified"),
      message: isLoggedIn && !shouldLogOut ? "" : msg("Log in to continue."),
      variant: "success",
      icon: "check2-circle",
      duration: 10000,
    });

    if (shouldLogOut) {
      this.dispatchEvent(AuthService.createLogOutEvent());
    } else {
      if (isLoggedIn) {
        this.dispatchEvent(
          new CustomEvent("user-info-change", {
            detail: {
              isVerified: data.is_verified,
            },
          }),
        );
      }

      this.navTo("/log-in");
    }
  }
}
