import type { TemplateResult } from "lit";
import { render } from "lit";
import { property, state, query, customElement } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { msg, localized } from "@lit/localize";
import { ifDefined } from "lit/directives/if-defined.js";
import type { SlDialog, SlInput } from "@shoelace-style/shoelace";
import "broadcastchannel-polyfill";
import "tailwindcss/tailwind.css";

import "./utils/polyfills";
import appState, { use, AppStateService } from "./utils/state";
import type { OrgTab } from "./pages/org";
import type { NavigateEvent } from "@/controllers/navigate";
import type { NotifyEvent } from "@/controllers/notify";
import LiteElement, { html } from "./utils/LiteElement";
import APIRouter from "./utils/APIRouter";
import AuthService from "./utils/AuthService";
import type {
  LoggedInEvent,
  NeedLoginEvent,
  AuthState,
} from "./utils/AuthService";
import type { ViewState } from "./utils/APIRouter";
import type { CurrentUser, UserOrg } from "./types/user";
import type { AuthStorageEventData } from "./utils/AuthService";
import theme from "./theme";
import { ROUTES } from "./routes";
import "./shoelace";
import "./components";
import "./features";
import "./pages";
import "./assets/fonts/Inter/inter.css";
import "./assets/fonts/Recursive/recursive.css";
import "./styles.css";

type DialogContent = {
  label?: TemplateResult | string;
  body?: TemplateResult | string;
  noHeader?: boolean;
};

export type APIUser = {
  id: string;
  email: string;
  name: string;
  is_verified: boolean;
  is_superuser: boolean;
  orgs: UserOrg[];
};

/**
 * @event navigate
 * @event notify
 * @event need-login
 * @event logged-in
 * @event log-out
 * @event user-info-change
 * @event update-user-info
 */
@localized()
@customElement("browsertrix-app")
export class App extends LiteElement {
  @property({ type: String })
  version?: string;

  private router = new APIRouter(ROUTES);
  authService = new AuthService();

  @use()
  appState = appState;

  @state()
  private viewState!: ViewState;

  @state()
  private globalDialogContent: DialogContent = {};

  @query("#globalDialog")
  private globalDialog!: SlDialog;

  @state()
  private isAppSettingsLoaded: boolean = false;

  @state()
  private isRegistrationEnabled?: boolean;

  async connectedCallback() {
    let authState: AuthState = null;
    try {
      authState = await AuthService.initSessionStorage();
    } catch (e) {
      console.debug(e);
    }
    this.syncViewState();
    if (this.viewState.route === "org") {
      AppStateService.updateOrgSlug(this.viewState.params.slug || null);
    }
    if (authState) {
      this.authService.saveLogin(authState);
      this.updateUserInfo();
    }
    super.connectedCallback();

    this.addEventListener("navigate", this.onNavigateTo);
    window.addEventListener("need-login", this.onNeedLogin);
    window.addEventListener("popstate", () => {
      this.syncViewState();
    });

    this.startSyncBrowserTabs();
    this.fetchAppSettings();
  }

  willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.get("viewState") && this.viewState.route === "org") {
      AppStateService.updateOrgSlug(this.viewState.params.slug || null);
    }
  }

  private syncViewState() {
    if (
      this.authService.authState &&
      (window.location.pathname === "/log-in" ||
        window.location.pathname === "/reset-password")
    ) {
      // Redirect to logged in home page
      this.viewState = this.router.match(ROUTES.home);
      window.history.replaceState(this.viewState, "", this.viewState.pathname);
    } else {
      this.viewState = this.router.match(
        `${window.location.pathname}${window.location.search}`
      );
    }
  }

  private async fetchAppSettings() {
    const settings = await this.getAppSettings();

    if (settings) {
      this.isRegistrationEnabled = settings.registrationEnabled;
    }

    this.isAppSettingsLoaded = true;
  }

  private async updateUserInfo() {
    try {
      const userInfo = await this.getUserInfo();
      AppStateService.updateUserInfo({
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        isVerified: userInfo.is_verified,
        isAdmin: userInfo.is_superuser,
        orgs: userInfo.orgs,
      });
      const orgs = userInfo.orgs;
      if (
        orgs.length &&
        !this.appState.userInfo!.isAdmin &&
        !this.appState.orgSlug
      ) {
        const firstOrg = orgs[0].slug;
        AppStateService.updateOrgSlug(firstOrg);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err?.message === "Unauthorized") {
        console.debug(
          "Unauthorized with authState:",
          this.authService.authState
        );
        this.clearUser();
        this.navigate(ROUTES.login);
      }
    }
  }

  async getAppSettings(): Promise<{ registrationEnabled: boolean } | void> {
    const resp = await fetch("/api/settings", {
      headers: { "Content-Type": "application/json" },
    });

    if (resp.status === 200) {
      const body = await resp.json();

      return body;
    } else {
      console.debug(resp);
    }
  }

  navigate(newViewPath: string, state?: object) {
    let url;

    if (newViewPath.startsWith("http")) {
      url = new URL(newViewPath);
    } else {
      url = new URL(
        `${window.location.origin}/${newViewPath.replace(/^\//, "")}`
      );
    }

    // Remove hash from path for matching
    newViewPath = `${url.pathname}${url.search}`;

    if (newViewPath === "/log-in" && this.authService.authState) {
      // Redirect to logged in home page
      this.viewState = this.router.match(ROUTES.home);
    } else {
      this.viewState = this.router.match(newViewPath);
    }

    this.viewState.data = state;

    window.history.pushState(
      this.viewState,
      "",
      `${this.viewState.pathname.replace(url.search, "")}${url.hash}${
        url.search
      }`
    );
  }

  render() {
    return html`
      <style>
        ${theme}
      </style>

      <div class="min-w-screen min-h-screen flex flex-col">
        ${this.renderNavBar()}
        <main class="relative flex-auto flex">${this.renderPage()}</main>
        <div class="border-t border-neutral-100">${this.renderFooter()}</div>
      </div>

      <sl-dialog
        id="globalDialog"
        ?noHeader=${this.globalDialogContent?.noHeader === true}
        label=${this.globalDialogContent?.label || msg("Message")}
        @sl-after-hide=${() => (this.globalDialogContent = {})}
        >${this.globalDialogContent?.body}</sl-dialog
      >
    `;
  }

  private renderNavBar() {
    const isAdmin = this.appState.userInfo?.isAdmin;
    let homeHref = "/";
    if (!isAdmin && this.appState.orgSlug) {
      homeHref = `/orgs/${this.appState.orgSlug}`;
    }

    return html`
      <div class="border-b">
        <nav
          class="max-w-screen-lg mx-auto pl-3 box-border h-12 flex items-center justify-between"
        >
          <div>
            <a
              class="text-sm hover:text-neutral-400 font-medium"
              href=${homeHref}
              @click=${(e: MouseEvent) => {
                if (isAdmin) {
                  this.clearSelectedOrg();
                }
                this.navLink(e);
              }}
            >
              ${msg("Browsertrix Cloud")}
            </a>
          </div>

          ${isAdmin
            ? html`
                <div
                  class="text-xs md:text-sm grid grid-flow-col gap-3 md:gap-5 items-center"
                >
                  <a
                    class="text-neutral-500 hover:text-neutral-400 font-medium"
                    href="/"
                    @click=${(e: MouseEvent) => {
                      this.clearSelectedOrg();
                      this.navLink(e);
                    }}
                    >${msg("Dashboard")}</a
                  >
                  <a
                    class="text-neutral-500 hover:text-neutral-400 font-medium"
                    href="/crawls"
                    @click=${this.navLink}
                    >${msg("Running Crawls")}</a
                  >
                  <div class="hidden md:block">${this.renderFindCrawl()}</div>
                </div>
              `
            : ""}

          <div class="grid grid-flow-col auto-cols-max gap-3 items-center">
            ${this.authService.authState
              ? html` ${this.renderOrgs()}
                  <sl-dropdown placement="bottom-end">
                    <sl-icon-button
                      slot="trigger"
                      name="person-circle"
                      label=${msg("Open user menu")}
                      style="font-size: 1.5rem;"
                    ></sl-icon-button>

                    <sl-menu class="w-60 min-w-min max-w-full">
                      <div class="px-7 py-2">${this.renderMenuUserInfo()}</div>
                      <sl-divider></sl-divider>
                      <sl-menu-item
                        @click=${() => this.navigate(ROUTES.accountSettings)}
                      >
                        <sl-icon slot="prefix" name="gear"></sl-icon>
                        ${msg("Account Settings")}
                      </sl-menu-item>
                      ${this.appState.userInfo?.isAdmin
                        ? html` <sl-menu-item
                            @click=${() => this.navigate(ROUTES.usersInvite)}
                          >
                            <sl-icon slot="prefix" name="person-plus"></sl-icon>
                            ${msg("Invite Users")}
                          </sl-menu-item>`
                        : ""}
                      <sl-divider></sl-divider>
                      <sl-menu-item @click="${this.onLogOut}">
                        <sl-icon slot="prefix" name="door-open"></sl-icon>
                        ${msg("Log Out")}
                      </sl-menu-item>
                    </sl-menu>
                  </sl-dropdown>`
              : html`
                  <a href="/log-in"> ${msg("Log In")} </a>
                  ${this.isRegistrationEnabled
                    ? html`
                        <sl-button
                          variant="text"
                          @click="${() => this.navigate("/sign-up")}"
                        >
                          ${msg("Sign up")}
                        </sl-button>
                      `
                    : html``}
                `}
          </div>
        </nav>
      </div>
    `;
  }

  private renderOrgs() {
    const orgs = this.appState.userInfo?.orgs;
    if (!orgs || orgs.length < 2 || !this.appState.userInfo) return;

    const selectedOption = this.appState.orgSlug
      ? orgs.find(({ slug }) => slug === this.appState.orgSlug)
      : { slug: "", name: msg("All Organizations") };
    if (!selectedOption) {
      console.debug(
        `Could't find organization with slug ${this.appState.orgSlug}`,
        orgs
      );
      return;
    }

    // Limit org name display for orgs created before org name max length restriction
    const orgNameLength = 50;

    return html`
      <sl-dropdown placement="bottom-end">
        <sl-button slot="trigger" variant="text" size="small" caret
          >${selectedOption.name.slice(0, orgNameLength)}</sl-button
        >
        <sl-menu
          @sl-select=${(e: CustomEvent) => {
            const { value } = e.detail.item;
            if (value) {
              this.navigate(`/orgs/${value}`);
            } else {
              if (this.appState.userInfo) {
                this.clearSelectedOrg();
              }
              this.navigate(`/`);
            }
          }}
        >
          ${when(
            this.appState.userInfo.isAdmin,
            () => html`
              <sl-menu-item
                type="checkbox"
                value=""
                ?checked=${!selectedOption.slug}
                >${msg("All Organizations")}</sl-menu-item
              >
              <sl-divider></sl-divider>
            `
          )}
          ${this.appState.userInfo?.orgs.map(
            (org) => html`
              <sl-menu-item
                type="checkbox"
                value=${org.slug}
                ?checked=${org.slug === selectedOption.slug}
                >${org.name.slice(0, orgNameLength)}</sl-menu-item
              >
            `
          )}
        </sl-menu>
      </sl-dropdown>
    `;
  }

  private renderMenuUserInfo() {
    if (!this.appState.userInfo) return;
    if (this.appState.userInfo.isAdmin) {
      return html`
        <div class="mb-2">
          <sl-tag class="uppercase" variant="primary" size="small"
            >${msg("admin")}</sl-tag
          >
        </div>
        <div class="font-medium text-neutral-700">
          ${this.appState.userInfo?.name}
        </div>
        <div class="text-xs text-neutral-500 whitespace-nowrap">
          ${this.appState.userInfo?.email}
        </div>
      `;
    }

    const orgs = this.appState.userInfo?.orgs;
    if (orgs?.length === 1) {
      return html`
        <div class="font-medium text-neutral-700 my-1">${orgs[0].name}</div>
        <div class="text-neutral-500">${this.appState.userInfo?.name}</div>
        <div class="text-xs text-neutral-500 whitespace-nowrap">
          ${this.appState.userInfo?.email}
        </div>
      `;
    }

    return html`
      <div class="font-medium text-neutral-700">
        ${this.appState.userInfo?.name}
      </div>
      <div class="text-xs text-neutral-500 whitespace-nowrap">
        ${this.appState.userInfo?.email}
      </div>
    `;
  }

  private renderFooter() {
    return html`
      <footer
        class="w-full max-w-screen-lg mx-auto p-3 box-border flex flex-col gap-4 md:flex-row justify-between"
      >
        <!-- <div> -->
        <!-- TODO re-enable when translations are added -->
        <!-- <btrix-locale-picker></btrix-locale-picker> -->
        <!-- </div> -->
        <div class="flex items-center justify-center">
          <a
            class="text-neutral-400 flex items-center gap-2 hover:text-primary"
            href="https://github.com/webrecorder/browsertrix-cloud"
            target="_blank"
            rel="noopener"
          >
            <sl-icon
              name="github"
              class="inline-block align-middle text-base"
            ></sl-icon>
            Source Code
          </a>
        </div>
        <div class="flex items-center justify-center">
          <a
            class="text-neutral-400 flex items-center gap-2 hover:text-primary"
            href="https://docs.browsertrix.cloud"
            target="_blank"
            rel="noopener"
          >
            <sl-icon
              name="book-half"
              class="inline-block align-middle text-base"
            ></sl-icon>
            Documentation
          </a>
        </div>
        <div class="flex items-center justify-center">
          ${this.version
            ? html`
                <btrix-copy-button
                  class="text-neutral-400"
                  .getValue=${() => this.version}
                  content=${msg("Copy Version Code")}
                ></btrix-copy-button>
                <span
                  class="inline-block align-middle font-monostyle text-xs text-neutral-400"
                >
                  ${this.version}
                </span>
              `
            : ""}
        </div>
      </footer>
    `;
  }

  private renderPage() {
    switch (this.viewState.route) {
      case "signUp": {
        if (!this.isAppSettingsLoaded) {
          return html`<div
            class="w-full md:bg-neutral-50 flex items-center justify-center"
          ></div>`;
        }
        if (this.isRegistrationEnabled) {
          return html`<btrix-sign-up
            class="w-full md:bg-neutral-50 flex items-center justify-center"
            @logged-in="${this.onLoggedIn}"
            @log-out="${this.onLogOut}"
            .authState="${this.authService.authState}"
          ></btrix-sign-up>`;
        } else {
          return this.renderNotFoundPage();
        }
      }

      case "verify":
        return html`<btrix-verify
          class="w-full md:bg-neutral-50 flex items-center justify-center"
          token="${this.viewState.params.token}"
          @notify="${this.onNotify}"
          @log-out="${this.onLogOut}"
          @user-info-change="${this.onUserInfoChange}"
          .authState="${this.authService.authState}"
        ></btrix-verify>`;

      case "join":
        return html`<btrix-join
          class="w-full md:bg-neutral-50 flex items-center justify-center"
          @logged-in="${this.onLoggedIn}"
          token="${this.viewState.params.token}"
          email="${this.viewState.params.email}"
        ></btrix-join>`;

      case "acceptInvite":
        return html`<btrix-accept-invite
          class="w-full md:bg-neutral-50 flex items-center justify-center"
          @logged-in="${this.onLoggedIn}"
          @notify="${this.onNotify}"
          .authState="${this.authService.authState}"
          token="${this.viewState.params.token}"
          email="${this.viewState.params.email}"
        ></btrix-accept-invite>`;

      case "login":
      case "loginWithRedirect":
      case "forgotPassword":
        return html`<btrix-log-in
          class="w-full md:bg-neutral-50 flex items-center justify-center"
          @navigate=${this.onNavigateTo}
          @logged-in=${this.onLoggedIn}
          .viewState=${this.viewState}
          redirectUrl=${this.viewState.params.redirectUrl ||
          this.viewState.data?.redirectUrl}
        ></btrix-log-in>`;

      case "resetPassword":
        return html`<btrix-reset-password
          class="w-full md:bg-neutral-50 flex items-center justify-center"
          @navigate=${this.onNavigateTo}
          @logged-in=${this.onLoggedIn}
          .viewState=${this.viewState}
        ></btrix-reset-password>`;

      case "home":
        return html`<btrix-home
          class="w-full md:bg-neutral-50"
          @navigate=${this.onNavigateTo}
          @logged-in=${this.onLoggedIn}
          @update-user-info=${(e: CustomEvent) => {
            e.stopPropagation();
            this.updateUserInfo();
          }}
          @notify="${this.onNotify}"
          .authState=${this.authService.authState}
          .userInfo=${this.appState.userInfo ?? undefined}
          slug=${ifDefined(this.appState.orgSlug ?? undefined)}
        ></btrix-home>`;

      case "orgs":
        return html`<btrix-orgs
          class="w-full md:bg-neutral-50"
          .authState="${this.authService.authState}"
          .userInfo="${this.appState.userInfo ?? undefined}"
        ></btrix-orgs>`;

      case "org": {
        const slug = this.viewState.params.slug;
        const orgPath = this.viewState.pathname;
        const orgTab =
          window.location.pathname
            .slice(window.location.pathname.indexOf(slug) + slug.length)
            .replace(/(^\/|\/$)/, "")
            .split("/")[0] || "home";
        return html`<btrix-org
          class="w-full"
          @navigate=${this.onNavigateTo}
          @update-user-info=${(e: CustomEvent) => {
            e.stopPropagation();
            this.updateUserInfo();
          }}
          @notify="${this.onNotify}"
          .authState=${this.authService.authState}
          .userInfo=${this.appState.userInfo ?? undefined}
          .viewStateData=${this.viewState.data}
          .params=${this.viewState.params}
          slug=${slug}
          orgPath=${orgPath.split(slug)[1]}
          orgTab=${orgTab as OrgTab}
        ></btrix-org>`;
      }

      case "accountSettings":
        return html`<btrix-account-settings
          class="w-full max-w-screen-lg mx-auto p-2 md:py-8 box-border"
          @logged-in=${this.onLoggedIn}
          @update-user-info=${(e: CustomEvent) => {
            e.stopPropagation();
            this.updateUserInfo();
          }}
          @notify="${this.onNotify}"
          .authState="${this.authService.authState}"
          .userInfo="${this.appState.userInfo ?? undefined}"
        ></btrix-account-settings>`;

      case "usersInvite": {
        if (this.appState.userInfo) {
          if (this.appState.userInfo.isAdmin) {
            return html`<btrix-users-invite
              class="w-full max-w-screen-lg mx-auto p-2 md:py-8 box-border"
              @logged-in=${this.onLoggedIn}
              .authState="${this.authService.authState}"
              .userInfo="${this.appState.userInfo}"
            ></btrix-users-invite>`;
          } else {
            return this.renderNotFoundPage();
          }
        } else {
          return this.renderSpinner();
        }
      }

      case "crawls":
      case "crawl": {
        if (this.appState.userInfo) {
          if (this.appState.userInfo.isAdmin) {
            return html`<btrix-crawls
              class="w-full"
              @navigate=${this.onNavigateTo}
              @notify=${this.onNotify}
              .authState=${this.authService.authState}
              crawlId=${this.viewState.params.crawlId}
            ></btrix-crawls>`;
          } else {
            return this.renderNotFoundPage();
          }
        } else {
          return this.renderSpinner();
        }
      }

      case "awpUploadRedirect": {
        const { orgId, uploadId } = this.viewState.params;
        if (this.appState.slugLookup) {
          const slug = this.appState.slugLookup[orgId];
          if (slug) {
            this.navigate(`/orgs/${slug}/items/upload/${uploadId}`);
            return;
          }
        }
      }

      default:
        return this.renderNotFoundPage();
    }
  }

  private renderSpinner() {
    return html`
      <div class="w-full flex items-center justify-center text-3xl">
        <sl-spinner></sl-spinner>
      </div>
    `;
  }

  private renderNotFoundPage() {
    return html`<btrix-not-found
      class="w-full md:bg-neutral-50 flex items-center justify-center"
    ></btrix-not-found>`;
  }

  private renderFindCrawl() {
    return html`
      <sl-dropdown
        @sl-after-show=${(e: Event) => {
          (e.target as HTMLElement).querySelector("sl-input")?.focus();
        }}
        @sl-after-hide=${(e: Event) => {
          (
            (e.target as HTMLElement).querySelector("sl-input") as SlInput
          ).value = "";
        }}
        hoist
      >
        <button
          slot="trigger"
          class="text-primary hover:text-indigo-400 font-medium"
        >
          ${msg("Jump to Crawl")}
        </button>

        <div class="p-2">
          <form
            @submit=${(e: SubmitEvent) => {
              e.preventDefault();
              const id = new FormData(e.target as HTMLFormElement).get(
                "crawlId"
              ) as string;
              this.navigate(`/crawls/crawl/${id}#watch`);
              (e.target as HTMLFormElement).closest("sl-dropdown")?.hide();
            }}
          >
            <div class="flex flex-wrap items-center">
              <div class="mr-2 w-90">
                <sl-input
                  size="small"
                  name="crawlId"
                  placeholder=${msg("Enter Crawl ID")}
                  required
                ></sl-input>
              </div>
              <div class="grow-0">
                <sl-button size="small" variant="neutral" type="submit">
                  <sl-icon slot="prefix" name="arrow-right-circle"></sl-icon>
                  ${msg("Go")}</sl-button
                >
              </div>
            </div>
          </form>
        </div>
      </sl-dropdown>
    `;
  }

  onLogOut(event: CustomEvent<{ redirect?: boolean } | null>) {
    const detail = event.detail || {};
    const redirect = detail.redirect !== false;

    this.clearUser();

    if (redirect) {
      this.navigate(ROUTES.login);
    }
  }

  onLoggedIn(event: LoggedInEvent) {
    const { detail } = event;

    this.authService.saveLogin({
      username: detail.username,
      headers: detail.headers,
      tokenExpiresAt: detail.tokenExpiresAt,
    });

    if (!detail.api) {
      this.navigate(detail.redirectUrl || ROUTES.home);
    }

    if (detail.firstLogin) {
      this.onFirstLogin({ email: detail.username });
    }

    this.updateUserInfo();
  }

  onNeedLogin = (e: Event) => {
    e.stopPropagation();

    this.clearUser();
    const redirectUrl = (e as NeedLoginEvent).detail?.redirectUrl;
    this.navigate(ROUTES.login, {
      redirectUrl,
    });
    this.onNotify(
      new CustomEvent("notify", {
        detail: {
          message: msg("Please log in to continue."),
          variant: "warning",
          icon: "exclamation-triangle",
        },
      } as const)
    );
  };

  onNavigateTo = (event: NavigateEvent) => {
    event.stopPropagation();

    this.navigate(event.detail.url, event.detail.state);

    // Scroll to top of page
    window.scrollTo({ top: 0 });
  };

  onUserInfoChange(event: CustomEvent<Partial<CurrentUser>>) {
    AppStateService.updateUserInfo({
      ...this.appState.userInfo,
      ...event.detail,
    } as CurrentUser);
  }

  /**
   * Show global toast alert
   */
  onNotify(event: NotifyEvent) {
    event.stopPropagation();

    const {
      title,
      message,
      variant = "primary",
      icon = "info-circle",
      duration = 5000,
    } = event.detail;

    const container = document.createElement("sl-alert");
    const alert = Object.assign(container, {
      variant,
      closable: true,
      duration: duration,
      style: [
        "--sl-panel-background-color: var(--sl-color-neutral-1000)",
        "--sl-color-neutral-700: var(--sl-color-neutral-0)",
        // "--sl-panel-border-width: 0px",
        "--sl-spacing-large: var(--sl-spacing-medium)",
      ].join(";"),
    });

    render(
      html`
        <sl-icon name="${icon}" slot="icon"></sl-icon>
        ${title ? html`<strong>${title}</strong>` : ""}
        ${message ? html`<div>${message}</div>` : ""}
      `,
      container
    );
    document.body.append(alert);
    alert.toast();
  }

  getUserInfo(): Promise<APIUser> {
    return this.apiFetch("/users/me", this.authService.authState!);
  }

  private clearUser() {
    this.authService.logout();
    this.authService = new AuthService();
    AppStateService.reset();
  }

  private showDialog(content: DialogContent) {
    this.globalDialogContent = content;
    this.globalDialog.show();
  }

  private closeDialog() {
    this.globalDialog.hide();
  }

  private onFirstLogin({ email }: { email: string }) {
    this.showDialog({
      label: "Welcome to Browsertrix Cloud",
      noHeader: true,
      body: html`
        <div class="grid gap-4 text-center">
          <p class="mt-8 text-xl font-medium">
            ${msg("Welcome to Browsertrix Cloud!")}
          </p>

          <p>
            ${msg(html`A confirmation email was sent to: <br />
              <strong>${email}</strong>.`)}
          </p>
          <p class="max-w-xs mx-auto">
            ${msg(
              "Click the link in your email to confirm your email address."
            )}
          </p>
        </div>

        <div class="mb-4 mt-8 text-center">
          <sl-button variant="primary" @click=${() => this.closeDialog()}
            >${msg("Got it, go to dashboard")}</sl-button
          >
        </div>
      `,
    });
  }

  private startSyncBrowserTabs() {
    AuthService.broadcastChannel.addEventListener(
      "message",
      ({ data }: { data: AuthStorageEventData }) => {
        if (data.name === "auth_storage") {
          if (data.value !== AuthService.storage.getItem()) {
            if (data.value) {
              this.authService.saveLogin(JSON.parse(data.value));
              this.updateUserInfo();
              this.syncViewState();
            } else {
              this.clearUser();
              this.navigate(ROUTES.login);
            }
          }
        }
      }
    );
  }

  private clearSelectedOrg() {
    AppStateService.updateOrgSlug(null);
  }
}
