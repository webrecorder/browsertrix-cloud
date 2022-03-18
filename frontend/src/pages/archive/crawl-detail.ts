import type { TemplateResult, HTMLTemplateResult } from "lit";
import { state, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized, str } from "@lit/localize";

import { RelativeDuration } from "../../components/relative-duration";
import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import { CopyButton } from "../../components/copy-button";
import type { Crawl } from "./types";

type SectionName = "overview" | "watch" | "download" | "logs";

const POLL_INTERVAL_SECONDS = 10;

/**
 * Usage:
 * ```ts
 * <btrix-crawl-detail></btrix-crawl-detail>
 * ```
 */
@localized()
export class CrawlDetail extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  archiveId?: string;

  @property({ type: String })
  crawlId?: string;

  @state()
  private crawl?: Crawl;

  @state()
  private watchUrl?: string;

  @state()
  private isWatchExpanded: boolean = false;

  @state()
  private sectionName: SectionName = "overview";

  @state()
  private isSubmittingUpdate: boolean = false;

  @state()
  private openDialogName?: "scale";

  @state()
  private isDialogVisible: boolean = false;

  // For long polling:
  private timerId?: number;

  // TODO localize
  private numberFormatter = new Intl.NumberFormat();

  private get isRunning(): boolean | null {
    if (!this.crawl) return null;

    return this.crawl.state === "running" || this.crawl.state === "starting";
  }

  async firstUpdated() {
    this.fetchCrawl();
  }

  connectedCallback(): void {
    // Set initial active section based on URL #hash value
    const hash = window.location.hash.slice(1);
    if (["overview", "watch", "download", "logs"].includes(hash)) {
      this.sectionName = hash as SectionName;
    }
    super.connectedCallback();
  }

  disconnectedCallback(): void {
    this.stopPollTimer();
    super.disconnectedCallback();
  }

  render() {
    let sectionContent: string | TemplateResult = "";

    switch (this.sectionName) {
      case "watch": {
        if (this.crawl) {
          if (this.isRunning) {
            sectionContent = this.renderWatch();
          } else {
            sectionContent = this.renderReplay();
          }
        } else {
          // TODO loading indicator?
          return "";
        }

        break;
      }

      case "download":
        sectionContent = this.renderFiles();
        break;
      case "logs":
        sectionContent = this.renderLogs();
        break;
      default:
        sectionContent = this.renderOverview();
        break;
    }

    return html`
      <div class="mb-7">
        <a
          class="text-neutral-500 hover:text-neutral-600 text-sm font-medium"
          href=${`/archives/${this.archiveId}/crawls`}
          @click=${this.navLink}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle"
            >${msg("Back to Crawls")}</span
          >
        </a>
      </div>

      <div class="mb-2">${this.renderHeader()}</div>

      <main>
        <section class="grid grid-cols-6 gap-4 mb-4">
          <div class="col-span-6 md:col-span-1">
            <h3 class="font-medium p-2">${msg("Summary")}</h3>
          </div>
          <div class="col-span-6 md:col-span-5">${this.renderSummary()}</div>
        </section>

        <section class="grid grid-cols-6 gap-4">
          <div class="col-span-6 md:col-span-1">${this.renderNav()}</div>
          <div class="col-span-6 md:col-span-5">${sectionContent}</div>
        </section>
      </main>

      <sl-dialog
        label=${msg(str`Change Crawl Scale`)}
        ?open=${this.openDialogName === "scale"}
        @sl-request-close=${() => (this.openDialogName = undefined)}
        @sl-show=${() => (this.isDialogVisible = true)}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
      >
        ${this.isDialogVisible ? this.renderEditScale() : ""}
      </sl-dialog>
    `;
  }

  private renderNav() {
    const renderNavItem = ({
      section,
      label,
    }: {
      section: SectionName;
      label: any;
    }) => {
      const isActive = section === this.sectionName;
      return html`
        <li
          class="relative"
          role="menuitem"
          aria-selected=${isActive ? "true" : "false"}
        >
          <a
            class="block px-2 py-1 my-1 font-medium rounded hover:bg-neutral-50 ${isActive
              ? "text-primary bg-slate-50"
              : "text-neutral-500 hover:text-neutral-900"}"
            href=${`/archives/${this.archiveId}/crawls/crawl/${this.crawlId}#${section}`}
            @click=${() => (this.sectionName = section)}
          >
            ${label}
          </a>
        </li>
      `;
    };
    return html`
      <nav class="border-b md:border-b-0">
        <ul class="flex flex-row md:flex-col" role="menu">
          ${renderNavItem({ section: "overview", label: msg("Overview") })}
          ${renderNavItem({ section: "watch", label: msg("View Crawl") })}
          ${renderNavItem({ section: "download", label: msg("Download") })}
          ${renderNavItem({ section: "logs", label: msg("Logs") })}
        </ul>
      </nav>
    `;
  }

  private renderHeader() {
    return html`
      <header class="flex justify-between">
        <h2 class="text-2xl font-medium mb-3 md:h-8">
          ${msg(
            html`<span class="font-normal">Crawl of</span> ${this.crawl
                ? this.crawl.configName
                : html`<sl-skeleton
                    class="inline-block"
                    style="width: 15em"
                  ></sl-skeleton>`}`
          )}
        </h2>
        <div class="grid gap-2 grid-flow-col">
          ${this.isRunning
            ? html`
                <sl-button-group>
                  <sl-button
                    size="small"
                    @click=${() => {
                      this.openDialogName = "scale";
                      this.isDialogVisible = true;
                    }}
                  >
                    <sl-icon name="plus-slash-minus" slot="prefix"></sl-icon>
                    <span> ${msg("Scale")} </span>
                  </sl-button>
                  <sl-button size="small" @click=${this.stop}>
                    <sl-icon name="slash-circle" slot="prefix"></sl-icon>
                    <span> ${msg("Stop")} </span>
                  </sl-button>
                  <sl-button size="small" @click=${this.cancel}>
                    <sl-icon
                      class="text-danger"
                      name="trash"
                      slot="prefix"
                    ></sl-icon>
                    <span class="text-danger"> ${msg("Cancel")} </span>
                  </sl-button>
                </sl-button-group>
              `
            : ""}
          ${this.crawl
            ? html` ${this.renderMenu()} `
            : html`<sl-skeleton
                style="width: 6em; height: 2em;"
              ></sl-skeleton>`}
        </div>
      </header>
    `;
  }

  private renderMenu() {
    if (!this.crawl) return;

    const crawlId = this.crawl.id;
    const crawlTemplateId = this.crawl.cid;

    const closeDropdown = (e: any) => {
      e.target.closest("sl-dropdown").hide();
    };

    return html`
      <sl-dropdown placement="bottom-end" distance="4">
        <sl-button slot="trigger" size="small" caret
          >${this.isRunning
            ? html`<sl-icon name="three-dots"></sl-icon>`
            : msg("Actions")}</sl-button
        >

        <ul class="text-sm text-0-800 whitespace-nowrap" role="menu">
          <li
            class="p-2 hover:bg-zinc-100 cursor-pointer"
            role="menuitem"
            @click=${(e: any) => {
              CopyButton.copyToClipboard(crawlId);
              closeDropdown(e);
            }}
          >
            ${msg("Copy Crawl ID")}
          </li>
          <li
            class="p-2 hover:bg-zinc-100 cursor-pointer"
            role="menuitem"
            @click=${(e: any) => {
              CopyButton.copyToClipboard(crawlId);
              closeDropdown(e);
            }}
          >
            ${msg("Copy Crawl Template ID")}
          </li>
          <li
            class="p-2 hover:bg-zinc-100 cursor-pointer"
            role="menuitem"
            @click=${(e: any) => {
              this.navTo(
                `/archives/${this.archiveId}/crawl-templates/config/${crawlTemplateId}`
              );
            }}
          >
            ${msg("View Crawl Template")}
          </li>
        </ul>
      </sl-dropdown>
    `;
  }

  private renderSummary() {
    return html`
      <dl class="grid grid-cols-4 gap-5 rounded-lg border py-3 px-5 text-sm">
        <div class="col-span-1">
          <dt class="text-xs text-0-600">${msg("Status")}</dt>
          <dd>
            ${this.crawl
              ? html`
                  <div class="flex items-baseline justify-between">
                    <div
                      class="whitespace-nowrap capitalize${this.isRunning
                        ? " motion-safe:animate-pulse"
                        : ""}"
                    >
                      <span
                        class="inline-block ${this.crawl.state === "failed"
                          ? "text-red-500"
                          : this.crawl.state === "complete"
                          ? "text-emerald-500"
                          : this.isRunning
                          ? "text-purple-500"
                          : "text-zinc-300"}"
                        style="font-size: 10px; vertical-align: 2px"
                      >
                        &#9679;
                      </span>
                      ${this.crawl.state.replace(/_/g, " ")}
                    </div>
                  </div>
                `
              : html`<sl-skeleton class="h-5"></sl-skeleton>`}
          </dd>
        </div>
        <div class="col-span-1">
          <dt class="text-xs text-0-600">${msg("Pages Crawled")}</dt>
          <dd>
            ${this.crawl?.stats
              ? html`
                  <span
                    class="font-mono tracking-tighter${this.isRunning
                      ? " text-purple-600"
                      : ""}"
                  >
                    ${this.numberFormatter.format(+this.crawl.stats.done)}
                    <span class="text-0-400">/</span>
                    ${this.numberFormatter.format(+this.crawl.stats.found)}
                  </span>
                `
              : this.crawl
              ? html` <span class="text-0-400">${msg("Unknown")}</span> `
              : html`<sl-skeleton class="h-5"></sl-skeleton>`}
          </dd>
        </div>
        <div class="col-span-1">
          <dt class="text-xs text-0-600">${msg("Run Duration")}</dt>
          <dd>
            ${this.crawl
              ? html`
                  ${this.crawl.finished
                    ? html`${RelativeDuration.humanize(
                        new Date(`${this.crawl.finished}Z`).valueOf() -
                          new Date(`${this.crawl.started}Z`).valueOf()
                      )}`
                    : html`
                        <span class="text-purple-600">
                          <btrix-relative-duration
                            value=${`${this.crawl.started}Z`}
                          ></btrix-relative-duration>
                        </span>
                      `}
                `
              : html`<sl-skeleton class="h-5"></sl-skeleton>`}
          </dd>
        </div>
        <div class="col-span-1">
          <dt class="text-xs text-0-600">${msg("Crawl Scale")}</dt>
          <dd>
            ${this.crawl
              ? html`<span class="font-mono">${this.crawl.scale}</span>`
              : html`<sl-skeleton class="h-5"></sl-skeleton>`}
          </dd>
        </div>
      </dl>
    `;
  }

  private renderWatch() {
    if (!this.authState) return "";

    const authToken = this.authState.headers.Authorization.split(" ")[1];

    return html`
      <header class="flex justify-between">
        <h3 class="text-lg font-medium mb-2">${msg("Watch Crawl")}</h3>
        ${document.fullscreenEnabled
          ? html`
              <sl-icon-button
                name="arrows-fullscreen"
                label=${msg("Fullscreen")}
                @click=${() => this.enterFullscreen("screencast-crawl")}
              ></sl-icon-button>
            `
          : ""}
      </header>

      ${this.crawl
        ? html` <div id="screencast-crawl">
            <btrix-screencast
              authToken=${authToken}
              archiveId=${this.archiveId!}
              crawlId=${this.crawlId!}
              .watchIPs=${this.crawl.watchIPs || []}
            ></btrix-screencast>
          </div>`
        : ""}
    `;
  }

  private renderReplay() {
    const isRunning = this.isRunning;

    const bearer = this.authState?.headers?.Authorization?.split(" ", 2)[1];

    // for now, just use the first file until multi-wacz support is fully implemented
    //const replaySource = `/api/archives/${this.archiveId}/crawls/${this.crawlId}.json?auth_bearer=${bearer}`;
    const replaySource = this.crawl?.resources?.[0]?.path;

    return html`
      <header class="flex justify-between">
        <h3 class="text-lg font-medium mb-2">${msg("Replay Crawl")}</h3>
        ${document.fullscreenEnabled
          ? html`
              <sl-icon-button
                name="arrows-fullscreen"
                label=${msg("Fullscreen")}
                @click=${() => this.enterFullscreen("replay-crawl")}
              ></sl-icon-button>
            `
          : ""}
      </header>

      <div
        id="replay-crawl"
        class="aspect-4/3 rounded border ${isRunning
          ? "border-purple-200"
          : "border-slate-100"}"
      >
        <!-- https://github.com/webrecorder/browsertrix-crawler/blob/9f541ab011e8e4bccf8de5bd7dc59b632c694bab/screencast/index.html -->
        ${replaySource
          ? html`<replay-web-page
              source="${replaySource}"
              coll="${ifDefined(this.crawl?.id)}"
              replayBase="/replay/"
              noSandbox="true"
            ></replay-web-page>`
          : ``}
      </div>
    `;
  }

  private renderOverview() {
    return html`
      <dl class="grid grid-cols-2 gap-5 rounded-lg border p-5">
        <div class="col-span-1">
          <dt class="text-sm text-0-600">${msg("Started")}</dt>
          <dd>
            ${this.crawl
              ? html`
                  <sl-format-date
                    date=${`${this.crawl.started}Z` /** Z for UTC */}
                    month="2-digit"
                    day="2-digit"
                    year="2-digit"
                    hour="numeric"
                    minute="numeric"
                    time-zone-name="short"
                  ></sl-format-date>
                `
              : html`<sl-skeleton class="h-6"></sl-skeleton>`}
          </dd>
        </div>
        <div class="col-span-1">
          <dt class="text-sm text-0-600">${msg("Finished")}</dt>
          <dd>
            ${this.crawl
              ? html`
                  ${this.crawl.finished
                    ? html`<sl-format-date
                        date=${`${this.crawl.finished}Z` /** Z for UTC */}
                        month="2-digit"
                        day="2-digit"
                        year="2-digit"
                        hour="numeric"
                        minute="numeric"
                        time-zone-name="short"
                      ></sl-format-date>`
                    : html`<span class="text-0-400">${msg("Pending")}</span>`}
                `
              : html`<sl-skeleton class="h-6"></sl-skeleton>`}
          </dd>
        </div>
        <div class="col-span-1">
          <dt class="text-sm text-0-600">${msg("Reason")}</dt>
          <dd>
            ${this.crawl
              ? html`
                  ${this.crawl.manual
                    ? msg(
                        html`Manual start by
                          <span
                            >${this.crawl?.userName || this.crawl?.userid}</span
                          >`
                      )
                    : msg(html`Scheduled run`)}
                `
              : html`<sl-skeleton class="h-6"></sl-skeleton>`}
          </dd>
        </div>
        <div class="col-span-1">
          <dt class="text-sm text-0-600">${msg("Crawl Template")}</dt>
          <dd>
            ${this.crawl
              ? html`
                  <a
                    class="font-medium text-neutral-700 hover:text-neutral-900"
                    href=${`/archives/${this.archiveId}/crawl-templates/config/${this.crawl.cid}`}
                    @click=${this.navLink}
                  >
                    <sl-icon
                      class="inline-block align-middle"
                      name="link-45deg"
                    ></sl-icon>
                    <span class="inline-block align-middle">
                      ${this.crawl.configName}
                    </span>
                  </a>
                `
              : html`<sl-skeleton class="h-6"></sl-skeleton>`}
          </dd>
        </div>
        <div class="col-span-1">
          <dt class="text-sm text-0-600">${msg("Crawl ID")}</dt>
          <dd class="truncate">
            ${this.crawl
              ? html`<btrix-copy-button
                    value=${this.crawl.id}
                  ></btrix-copy-button>
                  <code class="text-xs" title=${this.crawl.id}
                    >${this.crawl.id}</code
                  > `
              : html`<sl-skeleton class="h-6"></sl-skeleton>`}
          </dd>
        </div>
      </dl>
    `;
  }

  private renderFiles() {
    return html`
      <h3 class="text-lg font-medium my-2">${msg("Download Files")}</h3>

      ${this.crawl
        ? this.crawl.resources && this.crawl.resources.length
          ? html`
              <ul class="border rounded text-sm">
                ${this.crawl.resources.map(
                  (file) => html`
                    <li
                      class="flex justify-between p-3 border-t first:border-t-0"
                    >
                      <div>
                        <a
                          class="text-primary hover:underline"
                          href=${file.path}
                          download
                          title=${file.name}
                          >${file.name.slice(file.name.lastIndexOf("/") + 1)}
                        </a>
                      </div>
                      <div>
                        <sl-format-bytes value=${file.size}></sl-format-bytes>
                      </div>
                    </li>
                  `
                )}
              </ul>
            `
          : html`
              <p class="text-neutral-400">${msg("No files to download.")}</p>
            `
        : ""}
    `;
  }

  private renderLogs() {
    const logs: string[] = ["test log 1", "test log 2"];

    return html`
      <header class="flex items-end justify-between my-2">
        <h3 class="text-lg font-medium">${msg("Logs")}</h3>

        <sl-select value="1" size="small">
          <sl-menu-item value="1">Instance 1</sl-menu-item>
          <sl-menu-item value="2">Instance 2</sl-menu-item>
        </sl-select>
      </header>

      <figure
        class="h-80 overflow-auto p-4 rounded bg-neutral-800 text-neutral-100"
      >
        <pre class="text-sm">${logs.join("\n")}</pre>
      </figure>
    `;
  }

  private renderEditScale() {
    if (!this.crawl) return;

    const scaleOptions = [
      {
        value: 1,
        label: msg("Standard"),
      },
      {
        value: 2,
        label: msg("Big (2x)"),
      },
      {
        value: 3,
        label: msg("Bigger (3x)"),
      },
    ];

    return html`
      <div class="text-center">
        <sl-button-group>
          ${scaleOptions.map(
            ({ value, label }) => html`
              <sl-button
                type=${value === this.crawl?.scale ? "neutral" : "default"}
                aria-selected=${value === this.crawl?.scale}
                pill
                @click=${() => this.scale(value)}
                ?disabled=${this.isSubmittingUpdate}
                >${label}</sl-button
              >
            `
          )}
        </sl-button-group>
      </div>

      <div class="mt-5 text-right">
        <sl-button type="text" @click=${() => (this.openDialogName = undefined)}
          >${msg("Cancel")}</sl-button
        >
      </div>
    `;
  }

  /**
   * Fetch crawl and update internal state
   */
  private async fetchCrawl(): Promise<void> {
    try {
      this.crawl = await this.getCrawl();

      if (this.isRunning) {
        // Start timer for next poll
        this.timerId = window.setTimeout(() => {
          this.fetchCrawl();
        }, 1000 * POLL_INTERVAL_SECONDS);
      } else {
        this.stopPollTimer();
      }
    } catch {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawl at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  async getCrawl(): Promise<Crawl> {
    // Mock to use in dev:
    // return import("../../__mocks__/api/archives/[id]/crawls").then(
    //   (module) => module.default.running[0]
    //   // (module) => module.default.finished[0]
    // );

    const data: Crawl = await this.apiFetch(
      `/archives/${this.archiveId}/crawls/${this.crawlId}.json`,
      this.authState!
    );

    return data;
  }

  private async cancel() {
    if (window.confirm(msg("Are you sure you want to cancel the crawl?"))) {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawls/${this.crawlId}/cancel`,
        this.authState!,
        {
          method: "POST",
        }
      );

      if (data.canceled === true) {
        this.fetchCrawl();
      } else {
        this.notify({
          message: msg("Sorry, couldn't cancel crawl at this time."),
          type: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async stop() {
    if (window.confirm(msg("Are you sure you want to stop the crawl?"))) {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawls/${this.crawlId}/stop`,
        this.authState!,
        {
          method: "POST",
        }
      );

      if (data.stopping_gracefully === true) {
        this.fetchCrawl();
      } else {
        this.notify({
          message: msg("Sorry, couldn't stop crawl at this time."),
          type: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async scale(value: Crawl["scale"]) {
    this.isSubmittingUpdate = true;

    try {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawls/${this.crawlId}/scale`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify({ scale: +value }),
        }
      );

      if (data.scaled) {
        this.crawl!.scale = data.scaled;

        this.notify({
          message: msg("Updated crawl scale."),
          type: "success",
          icon: "check2-circle",
        });
      } else {
        throw new Error("unhandled API response");
      }

      this.openDialogName = undefined;
      this.isDialogVisible = false;
    } catch {
      this.notify({
        message: msg("Sorry, couldn't change crawl scale at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmittingUpdate = false;
  }

  private stopPollTimer() {
    window.clearTimeout(this.timerId);
  }

  /**
   * Enter fullscreen mode
   * @param id ID of element to fullscreen
   */
  private async enterFullscreen(id: string) {
    try {
      document.getElementById(id)!.requestFullscreen({
        // Show browser navigation controls
        navigationUI: "show",
      });
    } catch (err) {
      console.error(err);
    }
  }
}

customElements.define("btrix-crawl-detail", CrawlDetail);
