import { state, property, customElement } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";
import AuthService from "@/utils/AuthService";

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
      this.verify();
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

    const data = await resp.json();

    switch (resp.status) {
      case 200:
        return this.onVerificationComplete(data);
      case 400:
        const { detail } = data;
        if (detail === "verify_user_bad_token") {
          this.serverError = msg("This verification email is not valid.");
          break;
        }

        if (detail === "verify_user_already_verified") {
          return this.onVerificationComplete(data);
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
          })
        );
      }

      this.navTo("/log-in");
    }
  }
}
