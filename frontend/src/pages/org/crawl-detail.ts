import type { TemplateResult } from "lit";
import { state, property, customElement } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { classMap } from "lit/directives/class-map.js";
import { msg, localized, str } from "@lit/localize";

import type { PageChangeEvent } from "@/components/ui/pagination";
import { RelativeDuration } from "@/components/ui/relative-duration";
import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";
import { isActive } from "@/utils/crawler";
import { CopyButton } from "@/components/ui/copy-button";
import type { Crawl, CrawlConfig, Seed } from "./types";
import type { APIPaginatedList } from "@/types/api";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";
import type { CrawlLog } from "@/features/archived-items/crawl-logs";

const SECTIONS = [
  "overview",
  "watch",
  "replay",
  "files",
  "logs",
  "config",
  "exclusions",
] as const;
type SectionName = (typeof SECTIONS)[number];

/**
 * Usage:
 * ```ts
 * <btrix-crawl-detail></btrix-crawl-detail>
 * ```
 */
@localized()
@customElement("btrix-crawl-detail")
export class CrawlDetail extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  itemType: Crawl["type"] = null;

  @property({ type: String })
  collectionId?: string;

  @property({ type: String })
  workflowId?: string;

  @property({ type: Boolean })
  showOrgLink = false;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  crawlId!: string;

  @property({ type: Boolean })
  isCrawler!: boolean;

  @state()
  private crawl?: Crawl;

  @state()
  private seeds?: APIPaginatedList<Seed>;

  @state()
  private logs?: APIPaginatedList<CrawlLog>;

  @state()
  private sectionName: SectionName = "overview";

  @state()
  private openDialogName?: "scale" | "metadata" | "exclusions";

  private get listUrl(): string {
    let path = "items";
    if (this.workflowId) {
      path = `workflows/crawl/${this.workflowId}#crawls`;
    } else if (this.collectionId) {
      path = `collections/view/${this.collectionId}/items`;
    } else if (this.crawl?.type === "upload") {
      path = "items/upload";
    } else if (this.crawl?.type === "crawl") {
      path = "items/crawl";
    }
    return `${this.orgBasePath}/${path}`;
  }

  // TODO localize
  private numberFormatter = new Intl.NumberFormat();

  private get isActive(): boolean | null {
    if (!this.crawl) return null;

    return (
      this.crawl.state === "running" ||
      this.crawl.state === "starting" ||
      this.crawl.state === "waiting_capacity" ||
      this.crawl.state === "waiting_org_limit" ||
      this.crawl.state === "stopping"
    );
  }

  private get hasFiles(): boolean | null {
    if (!this.crawl) return null;
    if (!this.crawl.resources) return false;

    return this.crawl.resources.length > 0;
  }

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("crawlId") && this.crawlId) {
      this.fetchCrawl();
      this.fetchCrawlLogs();
      this.fetchSeeds();
    }
  }

  connectedCallback(): void {
    // Set initial active section based on URL #hash value
    const hash = window.location.hash.slice(1);
    if ((SECTIONS as readonly string[]).includes(hash)) {
      this.sectionName = hash as SectionName;
    }
    super.connectedCallback();
  }

  render() {
    const authToken = this.authState!.headers.Authorization.split(" ")[1];
    let sectionContent: string | TemplateResult = "";

    switch (this.sectionName) {
      case "replay":
        sectionContent = this.renderPanel(msg("Replay"), this.renderReplay(), {
          "overflow-hidden": true,
          "rounded-lg": true,
          border: true,
        });
        break;
      case "files":
        sectionContent = this.renderPanel(msg("Files"), this.renderFiles());
        break;
      case "logs":
        sectionContent = this.renderPanel(
          html` ${this.renderTitle(msg("Error Logs"))}
            <sl-button
              href=${`/api/orgs/${this.orgId}/crawls/${this.crawlId}/logs?auth_bearer=${authToken}`}
              download=${`btrix-${this.crawlId}-logs.txt`}
              size="small"
              variant="primary"
            >
              <sl-icon slot="prefix" name="download"></sl-icon>
              ${msg("Download Logs")}
            </sl-button>`,
          this.renderLogs()
        );
        break;
      case "config":
        sectionContent = this.renderPanel(
          msg("Crawl Settings"),
          this.renderConfig(),
          {
            "p-4": true,
            "rounded-lg": true,
            border: true,
          }
        );
        break;
      default:
        sectionContent = html`
          <div class="grid gap-5 grid-cols-1 lg:grid-cols-2">
            <div class="col-span-1 flex flex-col">
              ${this.renderPanel(msg("Overview"), this.renderOverview(), {
                "p-4": true,
                "rounded-lg": true,
                border: true,
              })}
            </div>
            <div class="col-span-1 flex flex-col">
              ${this.renderPanel(
                html`
                  ${this.renderTitle(msg("Metadata"))}
                  ${when(
                    this.isCrawler,
                    () => html`
                      <sl-tooltip
                        content=${msg(
                          "Metadata cannot be edited while crawl is running."
                        )}
                        ?disabled=${!this.isActive}
                      >
                        <sl-icon-button
                          class=${`text-base${
                            this.isActive ? " cursor-not-allowed" : ""
                          }`}
                          name="pencil"
                          @click=${this.openMetadataEditor}
                          label=${msg("Edit Metadata")}
                          ?disabled=${this.isActive}
                        ></sl-icon-button>
                      </sl-tooltip>
                    `
                  )}
                `,
                this.renderMetadata(),
                {
                  "p-4": true,
                  "rounded-lg": true,
                  border: true,
                }
              )}
            </div>
          </div>
        `;
        break;
    }

    let label = "";
    if (this.workflowId) {
      label = msg("Back to Crawl Workflow");
    } else if (this.collectionId) {
      label = msg("Back to Collection");
    } else if (this.crawl) {
      if (this.crawl.type === "upload") {
        label = msg("Back to All Uploads");
      } else if (this.crawl.type === "crawl") {
        label = msg("Back to All Crawls");
      } else {
        label = msg("Back to Archived Items");
      }
    }

    return html`
      <div class="mb-7">
        <a
          class="text-neutral-500 hover:text-neutral-600 text-sm font-medium"
          href=${this.listUrl}
          @click=${this.navLink}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle">${label}</span>
        </a>
      </div>

      <div class="mb-4">${this.renderHeader()}</div>

      <main>
        <section class="grid grid-cols-6 gap-4">
          <div class="col-span-6 md:col-span-1">${this.renderNav()}</div>
          <div class="col-span-6 md:col-span-5">${sectionContent}</div>
        </section>
      </main>

      <btrix-crawl-metadata-editor
        .authState=${this.authState}
        .crawl=${this.crawl}
        ?open=${this.openDialogName === "metadata"}
        @request-close=${() => (this.openDialogName = undefined)}
        @updated=${() => this.fetchCrawl()}
      ></btrix-crawl-metadata-editor>
    `;
  }

  private renderName() {
    if (!this.crawl)
      return html`<sl-skeleton
        class="inline-block"
        style="width: 15em"
      ></sl-skeleton>`;

    if (this.crawl.name) return this.crawl.name;
    if (!this.crawl.firstSeed) return this.crawl.id;
    const remainder = this.crawl.seedCount - 1;
    let crawlName: any = html`<span class="break-words"
      >${this.crawl.firstSeed}</span
    >`;
    if (remainder) {
      if (remainder === 1) {
        crawlName = msg(
          html`<span class="break-words">${this.crawl.firstSeed}</span>
            <span class="text-neutral-500">+${remainder} URL</span>`
        );
      } else {
        crawlName = msg(
          html`<span class="break-words">${this.crawl.firstSeed}</span>
            <span class="text-neutral-500">+${remainder} URLs</span>`
        );
      }
    }
    return crawlName;
  }

  private renderNav() {
    const renderNavItem = ({
      section,
      label,
      iconLibrary,
      icon,
    }: {
      section: SectionName;
      label: any;
      iconLibrary: "app" | "default";
      icon: string;
    }) => {
      const isActive = section === this.sectionName;
      const baseUrl = window.location.pathname.split("#")[0];
      return html`
        <li class="relative grow" role="menuitem" aria-selected="${isActive}">
          <a
            class="flex gap-2 flex-col md:flex-row items-center font-semibold rounded-md h-full p-2 ${isActive
              ? "text-blue-600 bg-blue-100 shadow-sm"
              : "text-neutral-600 hover:bg-blue-50"}"
            href=${`${baseUrl}${window.location.search}#${section}`}
            @click=${() => (this.sectionName = section)}
          >
            <sl-icon
              class="w-4 h-4 shrink-0"
              name=${icon}
              aria-hidden="true"
              library=${iconLibrary}
            ></sl-icon>
            ${label}
          </a>
        </li>
      `;
    };
    return html`
      <nav class="border-b md:border-b-0 pb-4 md:mt-10">
        <ul
          class="flex flex-row md:flex-col gap-2 text-center md:text-start"
          role="menu"
        >
          ${renderNavItem({
            section: "overview",
            iconLibrary: "default",
            icon: "info-circle-fill",
            label: msg("Overview"),
          })}
          ${renderNavItem({
            section: "replay",
            iconLibrary: "app",
            icon: "link-replay",
            label: msg("Replay"),
          })}
          ${renderNavItem({
            section: "files",
            iconLibrary: "default",
            icon: "folder-fill",
            label: msg("Files"),
          })}
          ${when(
            this.itemType === "crawl",
            () => html`
              ${renderNavItem({
                section: "logs",
                iconLibrary: "default",
                icon: "terminal-fill",
                label: msg("Error Logs"),
              })}
              ${renderNavItem({
                section: "config",
                iconLibrary: "default",
                icon: "file-code-fill",
                label: msg("Crawl Settings"),
              })}
            `
          )}
        </ul>
      </nav>
    `;
  }

  private renderHeader() {
    return html`
      <header class="md:flex items-center gap-2 pb-3 mb-3 border-b">
        <h1
          class="flex-1 min-w-0 text-xl font-semibold leading-7 truncate mb-2 md:mb-0"
        >
          ${this.renderName()}
        </h1>
        <div
          class="grid gap-2 grid-flow-col ${this.isActive
            ? "justify-between"
            : "justify-end"}"
        >
          ${this.isActive
            ? html`
                <sl-button-group>
                  <sl-button size="small" @click=${this.stop}>
                    <sl-icon name="slash-circle" slot="prefix"></sl-icon>
                    <span> ${msg("Stop")} </span>
                  </sl-button>
                  <sl-button size="small" @click=${this.cancel}>
                    <sl-icon
                      class="text-danger"
                      name="trash3"
                      slot="prefix"
                    ></sl-icon>
                    <span class="text-danger"> ${msg("Cancel")} </span>
                  </sl-button>
                </sl-button-group>
              `
            : ""}
          ${this.crawl && this.isCrawler ? this.renderMenu() : ""}
        </div>
      </header>
    `;
  }

  private renderMenu() {
    if (!this.crawl) return;

    return html`
      <sl-dropdown placement="bottom-end" distance="4" hoist>
        <sl-button slot="trigger" size="small" caret
          >${this.isActive
            ? html`<sl-icon name="three-dots"></sl-icon>`
            : msg("Actions")}</sl-button
        >
        <sl-menu>
          ${when(
            this.isCrawler,
            () => html`
              <sl-menu-item
                @click=${() => {
                  this.openMetadataEditor();
                }}
              >
                <sl-icon name="pencil" slot="prefix"></sl-icon>
                ${msg("Edit Metadata")}
              </sl-menu-item>
              <sl-divider></sl-divider>
            `
          )}
          ${when(
            this.itemType === "crawl",
            () => html`
              <sl-menu-item
                @click=${() =>
                  this.navTo(
                    `${this.orgBasePath}/workflows/crawl/${this.crawl!.cid}`
                  )}
              >
                <sl-icon name="arrow-return-right" slot="prefix"></sl-icon>
                ${msg("Go to Workflow")}
              </sl-menu-item>
              <sl-menu-item
                @click=${() => CopyButton.copyToClipboard(this.crawl!.cid)}
              >
                <sl-icon name="copy-code" library="app" slot="prefix"></sl-icon>
                ${msg("Copy Workflow ID")}
              </sl-menu-item>
            `
          )}
          <sl-menu-item
            @click=${() =>
              CopyButton.copyToClipboard(this.crawl!.tags.join(", "))}
            ?disabled=${!this.crawl.tags.length}
          >
            <sl-icon name="tags" slot="prefix"></sl-icon>
            ${msg("Copy Tags")}
          </sl-menu-item>
          ${when(
            this.isCrawler && !isActive(this.crawl.state),
            () => html`
              <sl-divider></sl-divider>
              <sl-menu-item
                style="--sl-color-neutral-700: var(--danger)"
                @click=${() => this.deleteCrawl()}
              >
                <sl-icon name="trash3" slot="prefix"></sl-icon>
                ${msg("Delete Crawl")}
              </sl-menu-item>
            `
          )}
        </sl-menu>
      </sl-dropdown>
    `;
  }

  private renderTitle(title: string) {
    return html`<h2 class="text-lg font-semibold">${title}</h2>`;
  }

  private renderPanel(
    heading: string | TemplateResult,
    content: any,
    classes: any = {}
  ) {
    const headingIsTitle = typeof heading === "string";
    return html`
      <header
        class="flex-0 flex items-center justify-between leading-none h-8 min-h-fit mb-2"
      >
        ${headingIsTitle ? this.renderTitle(heading) : heading}
      </header>
      <div
        class=${classMap({
          "flex-1": true,
          ...classes,
        })}
      >
        ${content}
      </div>
    `;
  }

  private renderReplay() {
    if (!this.crawl) return;
    const replaySource = `/api/orgs/${this.crawl.oid}/${
      this.crawl.type === "upload" ? "uploads" : "crawls"
    }/${this.crawlId}/replay.json`;

    const headers = this.authState?.headers;

    const config = JSON.stringify({ headers });

    const canReplay = this.hasFiles;

    return html`
      <!-- https://github.com/webrecorder/browsertrix-crawler/blob/9f541ab011e8e4bccf8de5bd7dc59b632c694bab/screencast/index.html -->
      ${
        canReplay
          ? html`<div id="replay-crawl" class="aspect-4/3 overflow-hidden">
              <replay-web-page
                source="${replaySource}"
                coll="${ifDefined(this.crawl?.id)}"
                config="${config}"
                replayBase="/replay/"
                noSandbox="true"
                noCache="true"
              ></replay-web-page>
            </div>`
          : html`
              <p class="text-sm text-neutral-400 p-4">
                ${this.isActive
                  ? msg("No files yet.")
                  : msg("No files to replay.")}
              </p>
            `
      }
      </div>
    `;
  }

  private renderOverview() {
    return html`
      <btrix-desc-list>
        <btrix-desc-list-item label=${msg("Status")}>
          ${this.crawl
            ? html`
                <btrix-crawl-status
                  state=${this.crawl.state}
                  ?isUpload=${this.crawl.type === "upload"}
                ></btrix-crawl-status>
              `
            : html`<sl-skeleton class="h-6"></sl-skeleton>`}
        </btrix-desc-list-item>
        ${when(this.crawl, () =>
          this.crawl!.type === "upload"
            ? html`
                <btrix-desc-list-item label=${msg("Uploaded")}>
                  <sl-format-date
                    date=${`${this.crawl!.finished}Z` /** Z for UTC */}
                    month="2-digit"
                    day="2-digit"
                    year="2-digit"
                    hour="numeric"
                    minute="numeric"
                    timeZoneName="short"
                  ></sl-format-date>
                </btrix-desc-list-item>
              `
            : html`
                <btrix-desc-list-item label=${msg("Start Time")}>
                  <sl-format-date
                    date=${`${this.crawl!.started}Z` /** Z for UTC */}
                    month="2-digit"
                    day="2-digit"
                    year="2-digit"
                    hour="numeric"
                    minute="numeric"
                    timeZoneName="short"
                  ></sl-format-date>
                </btrix-desc-list-item>
                <btrix-desc-list-item label=${msg("Finish Time")}>
                  ${this.crawl!.finished
                    ? html`<sl-format-date
                        date=${`${this.crawl!.finished}Z` /** Z for UTC */}
                        month="2-digit"
                        day="2-digit"
                        year="2-digit"
                        hour="numeric"
                        minute="numeric"
                        timeZoneName="short"
                      ></sl-format-date>`
                    : html`<span class="text-0-400">${msg("Pending")}</span>`}
                </btrix-desc-list-item>
                <btrix-desc-list-item label=${msg("Elapsed Time")}>
                  ${this.crawl!.finished
                    ? html`${RelativeDuration.humanize(
                        new Date(`${this.crawl!.finished}Z`).valueOf() -
                          new Date(`${this.crawl!.started}Z`).valueOf()
                      )}`
                    : html`
                        <span class="text-purple-600">
                          <btrix-relative-duration
                            value=${`${this.crawl!.started}Z`}
                            unitCount="3"
                            tickSeconds="1"
                          ></btrix-relative-duration>
                        </span>
                      `}
                </btrix-desc-list-item>
                <btrix-desc-list-item label=${msg("Execution Time")}>
                  ${this.crawl!.finished
                    ? html`<span
                        >${humanizeExecutionSeconds(
                          this.crawl!.crawlExecSeconds
                        )}</span
                      >`
                    : html`<span class="text-0-400">${msg("Pending")}</span>`}
                </btrix-desc-list-item>
                <btrix-desc-list-item label=${msg("Initiator")}>
                  ${this.crawl!.manual
                    ? msg(
                        html`Manual start by
                          <span
                            >${this.crawl!.userName || this.crawl!.userid}</span
                          >`
                      )
                    : msg(html`Scheduled start`)}
                </btrix-desc-list-item>
              `
        )}

        <btrix-desc-list-item label=${msg("Size")}>
          ${this.crawl
            ? html`${this.crawl.fileSize
                ? html`<sl-format-bytes
                      value=${this.crawl.fileSize || 0}
                      display="narrow"
                    ></sl-format-bytes
                    >${this.crawl.stats
                      ? html`<span>,</span
                          ><span
                            class="font-mono tracking-tighter${this.isActive
                              ? " text-purple-600"
                              : ""}"
                          >
                            ${this.numberFormatter.format(
                              +this.crawl.stats.done
                            )}
                            <span class="text-0-400">/</span>
                            ${this.numberFormatter.format(
                              +this.crawl.stats.found
                            )}
                          </span>
                          <span> pages</span>`
                      : ""}`
                : html`<span class="text-0-400">${msg("Unknown")}</span>`}`
            : html`<sl-skeleton class="h-5"></sl-skeleton>`}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Crawl ID")}>
          ${this.crawl
            ? html`
                <div class="flex items-center gap-2">
                  <code class="grow" title=${this.crawl.id}
                    >${this.crawl.id}</code
                  >
                  <btrix-copy-button value=${this.crawl.id}></btrix-copy-button>
                </div>
              `
            : html`<sl-skeleton class="h-6"></sl-skeleton>`}
        </btrix-desc-list-item>
      </btrix-desc-list>
    `;
  }

  private renderMetadata() {
    const noneText = html`<span class="text-neutral-300">${msg("None")}</span>`;
    return html`
      <btrix-desc-list>
        <btrix-desc-list-item label=${msg("Description")}>
          ${when(
            this.crawl,
            () =>
              when(
                this.crawl!.description?.length,
                () =>
                  html`<pre class="whitespace-pre-line font-sans">
${this.crawl?.description}
                </pre
                  >`,
                () => noneText
              ),
            () => html`<sl-skeleton></sl-skeleton>`
          )}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Tags")}>
          ${when(
            this.crawl,
            () =>
              when(
                this.crawl!.tags.length,
                () =>
                  this.crawl!.tags.map(
                    (tag) =>
                      html`<btrix-tag class="mt-1 mr-2">${tag}</btrix-tag>`
                  ),
                () => noneText
              ),
            () => html`<sl-skeleton></sl-skeleton>`
          )}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("In Collections")}>
          ${when(
            this.crawl,
            () =>
              when(
                this.crawl!.collections.length,
                () => html`
                  <ul>
                    ${this.crawl!.collections.map(
                      ({ id, name }) =>
                        html`<li class="mt-1">
                          <a
                            class="text-primary hover:text-indigo-400"
                            href=${`${this.orgBasePath}/collections/view/${id}`}
                            @click=${this.navLink}
                            >${name}</a
                          >
                        </li>`
                    )}
                  </ul>
                `,
                () => noneText
              ),
            () => html`<sl-skeleton></sl-skeleton>`
          )}
        </btrix-desc-list-item>
      </btrix-desc-list>
    `;
  }

  private renderFiles() {
    return html`
      ${this.hasFiles
        ? html`
            <ul class="border rounded-lg text-sm">
              ${this.crawl!.resources!.map(
                (file) => html`
                  <li
                    class="flex justify-between p-3 border-t first:border-t-0"
                  >
                    <div class="whitespace-nowrap truncate flex items-center">
                      <sl-icon
                        name="file-earmark-zip-fill"
                        class="h-4 pr-2 shrink-0 text-neutral-600"
                      ></sl-icon>
                      <a
                        class="text-primary hover:underline truncate mr-2"
                        href=${file.path}
                        download
                        title=${file.name}
                        >${file.name.slice(file.name.lastIndexOf("/") + 1)}
                      </a>
                    </div>
                    <div
                      class="whitespace-nowrap text-sm font-mono text-neutral-400"
                    >
                      ${when(
                        file.numReplicas > 0,
                        () =>
                          html` <sl-tooltip content=${msg("Backed up")}>
                            <sl-icon
                              name="clouds"
                              class="w-4 h-4 mr-2 align-text-bottom shrink-0 text-success"
                            ></sl-icon>
                          </sl-tooltip>`
                      )}
                      <sl-format-bytes value=${file.size}></sl-format-bytes>
                    </div>
                  </li>
                `
              )}
            </ul>
          `
        : html`
            <p class="text-sm text-neutral-400">
              ${this.isActive
                ? msg("No files yet.")
                : msg("No files to download.")}
            </p>
          `}
    `;
  }

  private renderLogs() {
    return html`
      <div aria-live="polite" aria-busy=${!this.logs}>
        ${when(this.logs, () =>
          this.logs!.total
            ? html`
                <btrix-crawl-logs
                  .logs=${this.logs}
                  paginate
                  @page-change=${async (e: PageChangeEvent) => {
                    await this.fetchCrawlLogs({
                      page: e.detail.page,
                    });
                    // Scroll to top of list
                    this.scrollIntoView();
                  }}
                ></btrix-crawl-logs>
              `
            : html`<div class="border rounded-lg p-4">
                <p class="text-sm text-neutral-400">
                  ${msg("No error logs to display.")}
                </p>
              </div>`
        )}
      </div>
    `;
  }

  private renderConfig() {
    return html`
      <div aria-live="polite" aria-busy=${!this.crawl || !this.seeds}>
        ${when(
          this.crawl && this.seeds,
          () => html`
            <btrix-config-details
              .authState=${this.authState!}
              .crawlConfig=${{
                ...this.crawl,
                autoAddCollections: this.crawl!.collectionIds,
              } as CrawlConfig}
              .seeds=${this.seeds!.items}
              hideTags
            ></btrix-config-details>
          `,
          this.renderLoading
        )}
      </div>
    `;
  }

  private renderLoading = () =>
    html`<div class="w-full flex items-center justify-center my-24 text-3xl">
      <sl-spinner></sl-spinner>
    </div>`;

  /**
   * Fetch crawl and update internal state
   */
  private async fetchCrawl(): Promise<void> {
    try {
      this.crawl = await this.getCrawl();
    } catch {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawl at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async fetchSeeds(): Promise<void> {
    try {
      this.seeds = await this.getSeeds();
    } catch {
      this.notify({
        message: msg(
          "Sorry, couldn't retrieve all crawl settings at this time."
        ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCrawl(): Promise<Crawl> {
    const apiPath = `/orgs/${this.orgId}/${
      this.itemType === "upload" ? "uploads" : "crawls"
    }/${this.crawlId}/replay.json`;
    const data: Crawl = await this.apiFetch(apiPath, this.authState!);

    return data;
  }

  private async getSeeds() {
    // NOTE Returns first 1000 seeds (backend pagination max)
    const data = await this.apiFetch<APIPaginatedList<Seed>>(
      `/orgs/${this.orgId}/crawls/${this.crawlId}/seeds`,
      this.authState!
    );
    return data;
  }

  private async fetchCrawlLogs(
    params: Partial<APIPaginatedList> = {}
  ): Promise<void> {
    if (this.itemType !== "crawl") {
      return;
    }
    try {
      this.logs = await this.getCrawlErrors(params);
    } catch (e: unknown) {
      console.debug(e);

      this.notify({
        message: msg("Sorry, couldn't retrieve crawl logs at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCrawlErrors(params: Partial<APIPaginatedList>) {
    const page = params.page || this.logs?.page || 1;
    const pageSize = params.pageSize || this.logs?.pageSize || 50;

    const data = (await this.apiFetch)<APIPaginatedList<CrawlLog>>(
      `/orgs/${this.orgId}/crawls/${this.crawlId}/errors?page=${page}&pageSize=${pageSize}`,
      this.authState!
    );

    return data;
  }

  private async cancel() {
    if (window.confirm(msg("Are you sure you want to cancel the crawl?"))) {
      const data = await this.apiFetch<{ success: boolean }>(
        `/orgs/${this.crawl!.oid}/crawls/${this.crawlId}/cancel`,
        this.authState!,
        {
          method: "POST",
        }
      );

      if (data.success === true) {
        this.fetchCrawl();
      } else {
        this.notify({
          message: msg("Sorry, couldn't cancel crawl at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async stop() {
    if (window.confirm(msg("Are you sure you want to stop the crawl?"))) {
      const data = await this.apiFetch<{ success: boolean }>(
        `/orgs/${this.crawl!.oid}/crawls/${this.crawlId}/stop`,
        this.authState!,
        {
          method: "POST",
        }
      );

      if (data.success === true) {
        this.fetchCrawl();
      } else {
        this.notify({
          message: msg("Sorry, couldn't stop crawl at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private openMetadataEditor() {
    this.openDialogName = "metadata";
  }

  async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }

  private async deleteCrawl() {
    if (
      !window.confirm(
        msg(str`Are you sure you want to delete crawl of ${this.renderName()}?`)
      )
    ) {
      return;
    }

    try {
      const _data = await this.apiFetch(
        `/orgs/${this.crawl!.oid}/${
          this.crawl!.type === "crawl" ? "crawls" : "uploads"
        }/delete`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify({
            crawl_ids: [this.crawl!.id],
          }),
        }
      );
      this.navTo(this.listUrl);
      this.notify({
        message: msg(`Successfully deleted crawl`),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e: any) {
      let message = msg(
        str`Sorry, couldn't delete archived item at this time.`
      );
      if (e.isApiError) {
        if (e.details == "not_allowed") {
          message = msg(
            str`Only org owners can delete other users' archived items.`
          );
        } else if (e.message) {
          message = e.message;
        }
      }
      this.notify({
        message: message,
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  /** Callback when crawl is no longer running */
  private _crawlDone() {
    if (!this.crawl) return;

    this.fetchCrawlLogs();

    this.notify({
      message: msg(html`Done crawling <strong>${this.renderName()}</strong>.`),
      variant: "success",
      icon: "check2-circle",
    });

    if (this.sectionName === "watch") {
      // Show replay tab
      this.sectionName = "replay";
    }
  }

  /**
   * Enter fullscreen mode
   * @param id ID of element to fullscreen
   */
  private async _enterFullscreen(id: string) {
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
