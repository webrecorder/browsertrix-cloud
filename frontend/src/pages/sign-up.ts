import { localized, msg } from "@lit/localize";
import { customElement, property, state } from "lit/decorators.js";

import AuthService, {
  type AuthState,
  type LoggedInEventDetail,
} from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";

@localized()
@customElement("btrix-sign-up")
export class SignUp extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @state()
  isSignedUpWithoutAuth?: boolean;

  render() {
    return html`
      <article class="grid w-full max-w-md gap-5">
        <main class="p-10 md:rounded-lg md:border md:bg-white md:shadow-lg">
          ${this.isSignedUpWithoutAuth
            ? html`
                <div
                  class="mb-5 text-xl font-semibold text-primary"
                  role="alert"
                >
                  ${msg("Successfully signed up")}
                </div>
                <p class="text-lg">
                  ${msg(
                    "Click the link in the verification email we sent you to log in.",
                  )}
                </p>
              `
            : html`
                <h1 class="mb-5 text-2xl font-semibold">${msg("Sign up")}</h1>

                <btrix-sign-up-form
                  @submit=${this.onSubmit}
                  @authenticated=${this.onAuthenticated}
                  @unauthenticated=${this.onUnauthenticated}
                ></btrix-sign-up-form>
              `}
        </main>
      </article>
    `;
  }

  private onSubmit() {
    if (this.authState) {
      this.dispatchEvent(AuthService.createLogOutEvent({ redirect: false }));
    }
  }

  private onAuthenticated(event: CustomEvent<LoggedInEventDetail>) {
    this.dispatchEvent(
      AuthService.createLoggedInEvent({
        ...event.detail,
        firstLogin: true,
      }),
    );
  }

  private onUnauthenticated() {
    this.isSignedUpWithoutAuth = true;
  }
}
