import { localized, msg, str } from "@lit/localize";
import { type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";

import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";

const POLL_INTERVAL_SECONDS = 2;
const hiddenClassList = ["translate-x-2/3", "opacity-0", "pointer-events-none"];

/**
 * View embedded profile browser
 *
 * Usage example:
 * ```ts
 * <btrix-profile-browser
 *   authState=${authState}
 *   orgId=${orgId}
 *   browserId=${browserId}
 *   initialNavigateUrl=${initialNavigateUrl}
 *   origins=${origins}
 * ></btrix-profile-browser>
 * ```
 *
 * @event load Event on iframe load, with src URL
 */
@localized()
@customElement("btrix-profile-browser")
export class ProfileBrowser extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  browserId?: string;

  @property({ type: String })
  initialNavigateUrl?: string;

  @property({ type: Array })
  origins?: string[];

  @state()
  private iframeSrc?: string;

  @state()
  private isIframeLoaded = false;

  @state()
  private hasFetchError = false;

  @state()
  private isFullscreen = false;

  @state()
  private showOriginSidebar = false;

  @state()
  private newOrigins?: string[] = [];

  @query("#profileBrowserSidebar")
  private readonly sidebar?: HTMLElement;

  @query("#iframeWrapper")
  private readonly iframeWrapper?: HTMLElement;

  @query("iframe")
  private readonly iframe?: HTMLIFrameElement;

  private pollTimerId?: number;

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener("fullscreenchange", this.onFullscreenChange);
  }

  disconnectedCallback() {
    window.clearTimeout(this.pollTimerId);
    document.removeEventListener("fullscreenchange", this.onFullscreenChange);
  }

  willUpdate(changedProperties: PropertyValues<this> & Map<string, unknown>) {
    if (changedProperties.has("browserId")) {
      if (this.browserId) {
        window.clearTimeout(this.pollTimerId);
        void this.fetchBrowser();
      } else if (changedProperties.get("browserId")) {
        this.iframeSrc = undefined;
        this.isIframeLoaded = false;

        window.clearTimeout(this.pollTimerId);
      }
    }
    if (
      changedProperties.has("showOriginSidebar") &&
      changedProperties.get("showOriginSidebar") !== undefined
    ) {
      this.animateSidebar();
    }
  }

  private animateSidebar() {
    if (!this.sidebar) return;
    if (this.showOriginSidebar) {
      this.sidebar.classList.remove(...hiddenClassList);
    } else {
      this.sidebar.classList.add(...hiddenClassList);
    }
  }

  render() {
    return html`
      <div id="interactive-browser" class="flex h-full w-full flex-col">
        ${this.renderControlBar()}
        <div
          id="iframeWrapper"
          class="${this.isFullscreen
            ? "w-screen h-screen"
            : "border-t"} relative flex-1 overflow-hidden bg-neutral-50"
          aria-live="polite"
        >
          ${this.renderBrowser()}
          <div
            id="profileBrowserSidebar"
            class="${hiddenClassList.join(
              " ",
            )} bottom-0 right-0 top-0 flex transition-all duration-300 ease-out lg:absolute lg:w-80 lg:p-3"
          >
            <div
              class="flex-1 overflow-auto rounded-lg border bg-white shadow-lg"
            >
              ${this.renderOrigins()} ${this.renderNewOrigins()}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderControlBar() {
    if (this.isFullscreen) {
      return html`
        <div
          class="fixed left-1/2 top-2 z-50 flex -translate-x-1/2 items-center rounded-lg bg-white text-base shadow"
        >
          ${this.renderSidebarButton()}
          <sl-icon-button
            name="fullscreen-exit"
            label=${msg("Exit fullscreen")}
            @click=${() => void document.exitFullscreen()}
          ></sl-icon-button>
        </div>
      `;
    }

    return html`
      <div class="p-1 text-right text-base">
        ${this.renderSidebarButton()}
        <sl-icon-button
          name="arrows-fullscreen"
          label=${msg("Enter fullscreen")}
          @click=${() => void this.enterFullscreen("interactive-browser")}
        ></sl-icon-button>
      </div>
    `;
  }

  private renderBrowser() {
    if (this.hasFetchError) {
      return html`
        <btrix-alert variant="danger">
          ${msg(`The interactive browser is not available.`)}
        </btrix-alert>
      `;
    }

    if (this.iframeSrc) {
      return html`<iframe
        class="h-full w-full"
        title=${msg("Interactive browser for creating browser profile")}
        src=${this.iframeSrc}
        @load=${this.onIframeLoad}
      ></iframe>`;
    }

    if (this.browserId && !this.isIframeLoaded) {
      return html`
        <div class="flex h-full w-full items-center justify-center text-3xl">
          <sl-spinner></sl-spinner>
        </div>
      `;
    }

    return "";
  }

  private renderSidebarButton() {
    return html`
      <sl-icon-button
        name="layout-sidebar-reverse"
        label=${!this.showOriginSidebar
          ? msg("Show sidebar")
          : msg("Hide sidebar")}
        class="${this.showOriginSidebar ? "text-blue-600" : ""}"
        @click=${() => (this.showOriginSidebar = !this.showOriginSidebar)}
      ></sl-icon-button>
    `;
  }

  private renderOrigins() {
    return html`
      <h4 class="border-b p-2 text-xs leading-tight text-neutral-500">
        <span class="inline-block align-middle">${msg("Visited Sites")}</span>
        <sl-tooltip content=${msg("Websites in the browser profile")}
          ><sl-icon
            class="inline-block align-middle"
            name="info-circle"
          ></sl-icon
        ></sl-tooltip>
      </h4>
      <ul>
        ${this.origins?.map((url) => this.renderOriginItem(url))}
      </ul>
    `;
  }

  private renderNewOrigins() {
    if (!this.newOrigins?.length) return;

    return html`
      <h4 class="border-b p-2 text-xs leading-tight text-neutral-500">
        <span class="inline-block align-middle">${msg("New Sites")}</span>
        <sl-tooltip
          content=${msg(
            "Websites that are not in the browser profile yet. Finish editing and save to add these websites to the profile.",
          )}
          ><sl-icon
            class="inline-block align-middle"
            name="info-circle"
          ></sl-icon
        ></sl-tooltip>
      </h4>
      <ul>
        ${this.newOrigins.map((url) => this.renderOriginItem(url))}
      </ul>
    `;
  }

  private renderOriginItem(url: string) {
    return html`<li
      class="border-t-neutral-100${this.iframeSrc
        ? " hover:bg-slate-50 hover:text-primary"
        : ""} flex items-center justify-between border-t p-2 first:border-t-0"
      role=${this.iframeSrc ? "button" : "listitem"}
      title=${msg(str`Go to ${url}`)}
      @click=${() => (this.iframeSrc ? this.navigateBrowser({ url }) : {})}
    >
      <div class="w-full truncate text-sm">${url}</div>
      ${this.iframeSrc
        ? html`<sl-icon name="play-btn" class="text-xl"></sl-icon>`
        : ""}
    </li>`;
  }

  /**
   * Fetch browser profile and update internal state
   */
  private async fetchBrowser(): Promise<void> {
    await this.updateComplete;

    this.iframeSrc = undefined;
    this.isIframeLoaded = false;

    try {
      await this.checkBrowserStatus();
    } catch (e) {
      this.hasFetchError = true;

      this.notify({
        message: msg("Sorry, couldn't create browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  /**
   * Check whether temporary browser is up
   **/
  private async checkBrowserStatus() {
    const result = await this.getBrowser();

    if (result.detail === "waiting_for_browser") {
      this.pollTimerId = window.setTimeout(
        () => void this.checkBrowserStatus(),
        POLL_INTERVAL_SECONDS * 1000,
      );

      return;
    } else if (result.url) {
      // check that the browser is actually available
      // if not, continue waiting
      // (will not work with local frontend due to CORS)
      try {
        const resp = await fetch(result.url, { method: "HEAD" });
        if (!resp.ok) {
          return;
        }
      } catch (e) {
        // ignore
      }

      if (this.initialNavigateUrl) {
        await this.navigateBrowser({ url: this.initialNavigateUrl });
      }

      this.iframeSrc = result.url;

      await this.updateComplete;

      this.dispatchEvent(new CustomEvent("load", { detail: result.url }));

      void this.pingBrowser();
    } else {
      console.debug("Unknown checkBrowserStatus state");
    }
  }

  private async getBrowser() {
    const data = await this.apiFetch<{
      detail?: string;
      url?: string;
    }>(
      `/orgs/${this.orgId}/profiles/browser/${this.browserId}`,
      this.authState!,
    );

    return data;
  }

  /**
   * Navigate to URL in temporary browser
   **/
  private async navigateBrowser({ url }: { url: string }) {
    if (!this.iframeSrc) return;

    const data = this.apiFetch(
      `/orgs/${this.orgId}/profiles/browser/${this.browserId}/navigate`,
      this.authState!,
      {
        method: "POST",
        body: JSON.stringify({ url }),
      },
    );

    return data;
  }

  /**
   * Ping temporary browser every minute to keep it alive
   **/
  private async pingBrowser() {
    if (!this.iframeSrc) return;

    const data = await this.apiFetch<{ origins?: string[] }>(
      `/orgs/${this.orgId}/profiles/browser/${this.browserId}/ping`,
      this.authState!,
      {
        method: "POST",
      },
    );

    if (!this.origins) {
      this.origins = data.origins;
    } else {
      this.newOrigins = data.origins?.filter(
        (url: string) => !this.origins?.includes(url),
      );
    }

    this.pollTimerId = window.setTimeout(
      () => void this.pingBrowser(),
      POLL_INTERVAL_SECONDS * 1000,
    );
  }

  /**
   * Enter fullscreen mode
   * @param id ID of element to fullscreen
   */
  private async enterFullscreen(id: string) {
    try {
      await document.getElementById(id)!.requestFullscreen({
        // Hide browser navigation controls
        navigationUI: "hide",
      });
    } catch (err) {
      console.error(err);
    }
  }

  private onIframeLoad() {
    this.isIframeLoaded = true;
    try {
      this.iframe?.contentWindow?.localStorage.setItem("uiTheme", '"default"');
    } catch (e) {
      /* empty */
    }
    this.dispatchEvent(new CustomEvent("load", { detail: this.iframeSrc }));
  }

  private readonly onFullscreenChange = async () => {
    if (document.fullscreenElement) {
      this.isFullscreen = true;
    } else {
      this.isFullscreen = false;
    }
  };
}
