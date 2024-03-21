import { localized, msg, str } from "@lit/localize";
import { customElement, property, state } from "lit/decorators.js";

import AuthService, { type LoggedInEventDetail } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";

@localized()
@customElement("btrix-join")
export class Join extends LiteElement {
  @property({ type: String })
  token?: string;

  @property({ type: String })
  email?: string;

  @state()
  private serverError?: string;

  @state()
  private inviteInfo: {
    inviterEmail: string;
    inviterName: string;
    orgName: string;
  } = {
    inviterEmail: "",
    inviterName: "",
    orgName: "",
  };

  connectedCallback(): void {
    if (this.token && this.email) {
      super.connectedCallback();
    } else {
      throw new Error("Missing email or token");
    }
  }

  firstUpdated() {
    void this.getInviteInfo();
  }

  render() {
    if (this.serverError) {
      return html`<btrix-alert variant="danger"
        >${this.serverError}</btrix-alert
      >`;
    }

    const hasInviteInfo = Boolean(this.inviteInfo.inviterEmail);
    const placeholder = html`<span
      class="inline-block rounded-full bg-gray-100"
      style="width: 6em"
      >&nbsp;</span
    >`;

    return html`
      <article class="flex w-full flex-col justify-center p-5 md:flex-row">
        <div class="max-w-sm md:mr-12 md:mt-12">
          <div class="mb-3 text-gray-500">
            ${msg(
              str`Invited by ${
                this.inviteInfo.inviterName ||
                this.inviteInfo.inviterEmail ||
                placeholder
              }`,
            )}
          </div>
          <p class="mb-5 text-xl font-semibold md:text-2xl">
            ${msg(
              html`You’ve been invited to join
                <span class="break-words text-primary"
                  >${hasInviteInfo
                    ? this.inviteInfo.orgName || msg("Browsertrix")
                    : placeholder}</span
                >.`,
            )}
          </p>
        </div>

        <main
          class="max-w-md md:rounded-lg md:border md:bg-white md:p-10 md:shadow-lg"
        >
          <btrix-sign-up-form
            email=${this.email!}
            inviteToken=${this.token!}
            @authenticated=${this.onAuthenticated}
          ></btrix-sign-up-form>
        </main>
      </article>
    `;
  }

  private async getInviteInfo() {
    const resp = await fetch(
      `/api/users/invite/${this.token}?email=${encodeURIComponent(this.email!)}`,
    );

    if (resp.status === 200) {
      const body = (await resp.json()) as {
        inviterEmail: string;
        inviterName: string;
        orgName: string;
      };

      this.inviteInfo = {
        inviterEmail: body.inviterEmail,
        inviterName: body.inviterName,
        orgName: body.orgName,
      };
    } else if (resp.status === 404) {
      this.serverError = msg(
        "This invite doesn't exist or has expired. Please ask the organization administrator to resend an invitation.",
      );
    } else {
      this.serverError = msg("This invitation is not valid");
    }
  }

  private onAuthenticated(event: CustomEvent<LoggedInEventDetail>) {
    this.dispatchEvent(
      AuthService.createLoggedInEvent({
        ...event.detail,
        // TODO separate logic for confirmation message
        // firstLogin: true,
      }),
    );
  }
}
