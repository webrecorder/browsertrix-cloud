import { localized, msg } from "@lit/localize";
import {
  css,
  html,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { TailwindElement } from "@/classes/TailwindElement";
import { TWO_COL_SCREEN_MIN_CSS } from "@/components/ui/tab-list";
import { APIController } from "@/controllers/api";
import { NavigateController } from "@/controllers/navigate";
import { NotifyController } from "@/controllers/notify";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { ArchivedItem, ArchivedItemPage } from "@/types/crawler";
import type { QARun } from "@/types/qa";
import { type AuthState } from "@/utils/AuthService";
import { renderName } from "@/utils/crawler";

const TABS = ["screenshots", "replay"] as const;
export type QATab = (typeof TABS)[number];

@localized()
@customElement("btrix-archived-item-qa")
export class ArchivedItemQA extends TailwindElement {
  static styles = css`
    :host {
      height: inherit;
      display: flex;
      flex-direction: column;
    }

    article {
      flex-grow: 1;
      display: grid;
      grid-gap: 1rem;
      grid-template:
        "mainHeader"
        "main"
        "pageListHeader"
        "pageList";
      grid-template-columns: 100%;
      grid-template-rows: repeat(4, max-content);
    }

    @media only screen and (min-width: ${TWO_COL_SCREEN_MIN_CSS}) {
      article {
        grid-template:
          "mainHeader pageListHeader"
          "main pageList";
        grid-template-columns: 75% 1fr;
        grid-template-rows: min-content 1fr;
      }
    }

    .mainHeader {
      grid-area: mainHeader;
    }

    .pageListHeader {
      grid-area: pageListHeader;
    }

    .main {
      grid-area: main;
    }

    .pageList {
      grid-area: pageList;
    }
  `;

  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  orgId?: string;

  @property({ type: String })
  itemId?: string;

  @property({ type: String })
  itemPageId?: string;

  @property({ type: String })
  qaRunId?: string;

  @property({ type: Boolean })
  isCrawler = false;

  @property({ type: String })
  tab: QATab = "screenshots";

  @state()
  private item?: ArchivedItem;

  @state()
  private pages?: APIPaginatedList<ArchivedItemPage>;

  @state()
  private page?: ArchivedItemPage;

  @state()
  private qaRuns?: QARun[];

  @state()
  private crawlDataAvail = false;

  @state()
  private qaDataAvail = false;

  private readonly api = new APIController(this);
  private readonly navigate = new NavigateController(this);
  private readonly notify = new NotifyController(this);

  connectedCallback(): void {
    super.connectedCallback();

    // Check if replay-web-page is ready
    window.addEventListener("message", (event) => {
      const sourceLoc = (event.source as Window).location.href;

      // ensure its an rwp frame
      if (sourceLoc.indexOf("?source=") > 0) {
        // check if has /qa/ in path, then QA
        if (sourceLoc.indexOf("%2Fqa%2F") >= 0) {
          this.qaDataAvail = true;
          // otherwise main crawl replay
        } else {
          this.crawlDataAvail = true;
        }
      }
    });
  }

  protected willUpdate(
    changedProperties: PropertyValues<this> | Map<PropertyKey, unknown>,
  ): void {
    if (changedProperties.has("itemId") && this.itemId) {
      void this.initItem();
    }
    if (changedProperties.has("itemPageId") && this.itemPageId) {
      void this.fetchPage();
    }
  }

  private async initItem() {
    void this.fetchCrawl();

    if (this.qaRunId) {
      void this.fetchQARuns();
    } else {
      await void this.fetchQARuns();
    }
    if (this.itemPageId) {
      void this.fetchPages({ page: 1 });
    } else {
      await void this.fetchPages({ page: 1 });
    }

    const searchParams = this.getSearchParams();
    this.navigate.to(`${window.location.pathname}?${searchParams}`);
  }

  private getSearchParams() {
    const searchParams = new URLSearchParams(window.location.search);

    const firstQaRunId = this.qaRuns?.[0]?.id;
    const firstPageId = this.pages?.items[0]?.id;

    if (!searchParams.get("qaRunId") && firstQaRunId) {
      searchParams.set("qaRunId", firstQaRunId);
    }
    if (!searchParams.get("itemPageId") && firstPageId) {
      searchParams.set("itemPageId", firstPageId);
    }

    return searchParams;
  }

  render() {
    if (!this.pages) {
      return html`loading pages...`;
    }

    const crawlBaseUrl = `${this.navigate.orgBasePath}/items/crawl/${this.itemId}`;
    const searchParams = this.getSearchParams();

    const itemName = this.item ? renderName(this.item) : nothing;
    return html`
      <nav class="mb-7 text-success-600">
        <a
          class="text-sm font-medium text-neutral-500 hover:text-neutral-600"
          href=${`${crawlBaseUrl}`}
          @click=${this.navigate.link}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle">
            ${msg("Back to")} ${itemName}
          </span>
        </a>
      </nav>

      <article>
        <header class="mainHeader outline">
          <h1>${msg("Review")} &mdash; ${itemName}</h1>
          <code>qa run id: ${this.qaRunId}</code>
        </header>
        <section class="main outline">
          <nav class="flex items-center justify-between p-2">
            <div class="flex gap-4">
              <btrix-navigation-button
                id="screenshot-tab"
                href=${`${crawlBaseUrl}/review/screenshots?${searchParams}`}
                ?active=${this.tab === "screenshots"}
                @click=${this.navigate.link}
              >
                ${msg("Screenshots")}
              </btrix-navigation-button>
              <btrix-navigation-button
                id="replay-tab"
                href=${`${crawlBaseUrl}/review/replay?${searchParams}`}
                ?active=${this.tab === "replay"}
                @click=${this.navigate.link}
              >
                ${msg("Replay")}
              </btrix-navigation-button>
            </div>
            <div class="flex gap-4">
              <sl-button size="small">
                <sl-icon slot="prefix" name="arrow-left"></sl-icon>
                ${msg("Previous Page")}
              </sl-button>
              <btrix-page-qa-toolbar
                .authState=${this.authState}
                .orgId=${this.orgId}
                .itemId=${this.itemId}
                .pageId=${this.itemPageId}
              ></btrix-page-qa-toolbar>
              <sl-button variant="primary" size="small">
                <sl-icon slot="suffix" name="arrow-right"></sl-icon>
                ${msg("Next Page")}
              </sl-button>
            </div>
          </nav>
          ${this.renderToolbar()} ${this.renderSections()}
        </section>
        <h2 class="pageListHeader outline">
          ${msg("Pages List")} <sl-button>${msg("Finish Review")}</sl-button>
        </h2>
        <section class="pageList outline">
          <ul>
            ${this.pages.items.map((page) => {
              const pageSearchParams = new URLSearchParams(searchParams);
              pageSearchParams.set("itemPageId", page.id!);
              return html`
                <li>
                  <a
                    class="underline"
                    href="${window.location.pathname}?${pageSearchParams}"
                    @click=${this.navigate.link}
                  >
                    id: ${page.id}</a
                  >
                </li>
              `;
            })}
          </ul>
          pg ${this.pages.page} of
          ${this.pages
            ? Math.ceil(this.pages.total / this.pages.pageSize)
            : "unknown"}
        </section>
      </article>
    `;
  }

  private renderToolbar() {
    return html`
      <div
        class="${this.tab === "replay"
          ? "rounded-t-lg"
          : "rounded-lg"} my-2 flex h-12 items-center border bg-neutral-50 text-base"
      >
        <div class="ml-1 flex">
          ${choose(this.tab, [
            [
              "replay",
              () => html`
                <sl-icon-button name="arrow-clockwise"></sl-icon-button>
              `,
            ],
            [
              "screenshots",
              () => html`
                <sl-icon-button name="intersect"></sl-icon-button>
                <sl-icon-button name="vr"></sl-icon-button>
              `,
            ],
          ])}
        </div>
        <div
          class="mx-1.5 flex h-8 min-w-0 flex-1 items-center justify-between gap-2 overflow-hidden whitespace-nowrap rounded border bg-neutral-0 px-2 text-sm"
        >
          <div class="fade-out-r scrollbar-hidden flex-1 overflow-x-scroll">
            <span class="pr-2">${this.page?.url || "http://"}</span>
          </div>
          ${when(
            this.page,
            (page) => html`
              <sl-format-date
                class="font-monostyle text-xs text-neutral-500"
                date=${`${page.ts}Z`}
                month="2-digit"
                day="2-digit"
                year="2-digit"
                hour="2-digit"
                minute="2-digit"
              >
              </sl-format-date>
            `,
          )}
        </div>
      </div>
    `;
  }

  private renderSections() {
    const tabSection: Record<
      QATab,
      { render: () => TemplateResult<1> | undefined }
    > = {
      screenshots: {
        render: this.renderScreenshots,
      },
      replay: {
        render: this.renderReplay,
      },
    };

    // All sections are rendered at page load to enable
    // quick switching between tabs without reloading RWP.
    //
    // This also enables us to reuse the replay tab RWP
    // embed to load the replay screenshot
    return html`
      ${TABS.map((tab) => {
        const section = tabSection[tab];
        const isActive = tab === this.tab;
        return html`
          <section
            class="${isActive ? "" : "offscreen"}"
            aria-labelledby="${this.tab}-tab"
            aria-hidden=${!isActive}
          >
            ${section.render()}
          </section>
        `;
      })}
    `;
  }

  private readonly renderScreenshots = () => {
    if (!this.page) return; // TODO loading indicator

    const timestamp = this.page.ts?.split(".")[0].replace(/\D/g, "");
    const crawlUrl = `/replay/w/${this.itemId}/${timestamp}mp_/urn:view:${this.page.url}`;
    const qaUrl = `/replay/w/${this.qaRunId}/${timestamp}mp_/urn:view:${this.page.url}`;
    const renderSpinner = () =>
      html`<div class="flex h-full w-full items-center justify-center text-2xl">
        <sl-spinner></sl-spinner>
      </div>`;

    return html`
      <div class="mb-2 flex justify-between text-base font-medium">
        <h3 id="crawlScreenshotHeading">${msg("Crawl Screenshot")}</h3>
        <h3 id="replayScreenshotHeading">${msg("Replay Screenshot")}</h3>
      </div>
      <div class="flex overflow-hidden rounded border bg-slate-50">
        <div
          class="aspect-video flex-1 outline -outline-offset-2 outline-yellow-400"
        >
          ${when(
            this.qaDataAvail,
            () => html`
              <iframe
                slot="before"
                name="crawlScreenshot"
                src="${crawlUrl}"
                class="h-full w-full"
                aria-labelledby="crawlScreenshotHeading"
                @load=${this.onScreenshotLoad}
              ></iframe>
            `,
            renderSpinner,
          )}
        </div>
        <div
          class="aspect-video flex-1 outline -outline-offset-2 outline-green-400"
        >
          ${when(
            this.crawlDataAvail,
            () => html`
              <iframe
                slot="after"
                name="replayScreenshot"
                src="${qaUrl}"
                class="h-full w-full"
                aria-labelledby="replayScreenshotHeading"
                @load=${this.onScreenshotLoad}
              ></iframe>
            `,
            renderSpinner,
          )}
        </div>
      </div>
      <div class="offscreen" aria-hidden="true">
        ${when(this.qaRunId, (id) =>
          this.renderReplay(id, { qa: true, screenshot: true }),
        )}
      </div>
    `;
  };

  private readonly renderReplay = (
    rwpId = this.itemId,
    { qa, screenshot } = { qa: false, screenshot: false },
  ) => {
    if (!rwpId) return;

    const replaySource = `/api/orgs/${this.orgId}/crawls/${this.itemId}${qa ? `/qa/${rwpId}` : ""}/replay.json`;
    const headers = this.authState?.headers;
    const config = JSON.stringify({ headers });

    return html`<div class="aspect-4/3 w-full overflow-hidden">
      <replay-web-page
        source="${replaySource}"
        coll="${rwpId}"
        config="${config}"
        replayBase="/replay/"
        embed="replayonly"
        noCache="true"
        url="${screenshot ? "urn:view:" : ""}${this.page?.url}"
      ></replay-web-page>
    </div>`;
  };

  private readonly onScreenshotLoad = (e: Event) => {
    const iframe = e.currentTarget as HTMLIFrameElement;
    const img = iframe.contentDocument?.body.querySelector("img");
    // Make image fill iframe container
    if (img) {
      img.style.height = "auto";
      img.style.width = "100%";
    }
  };

  private async fetchCrawl(): Promise<void> {
    try {
      this.item = await this.getCrawl();
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve archived item at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async fetchPages(params?: APIPaginationQuery): Promise<void> {
    try {
      this.pages = await this.getPages(params);
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve archived item at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async fetchQARuns(): Promise<void> {
    try {
      this.qaRuns = await this.getQARuns();
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve archived item at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCrawl(): Promise<ArchivedItem> {
    return this.api.fetch<ArchivedItem>(
      `/orgs/${this.orgId}/crawls/${this.itemId}`,
      this.authState!,
    );
  }

  private async getPages(
    params?: APIPaginationQuery,
  ): Promise<APIPaginatedList<ArchivedItemPage>> {
    const query = queryString.stringify(
      {
        ...params,
      },
      {
        arrayFormat: "comma",
      },
    );
    return this.api.fetch<APIPaginatedList<ArchivedItemPage>>(
      `/orgs/${this.orgId}/crawls/${this.itemId}/pages?${query}`,
      this.authState!,
    );
  }
  private async fetchPage(): Promise<void> {
    if (!this.itemPageId) return;
    try {
      this.page = await this.getPage(this.itemPageId);
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve archived item at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getPage(pageId: string): Promise<ArchivedItemPage> {
    return this.api.fetch<ArchivedItemPage>(
      `/orgs/${this.orgId}/crawls/${this.itemId}/pages/${pageId}`,
      this.authState!,
    );
  }

  private async getQARuns(): Promise<QARun[]> {
    return this.api.fetch<QARun[]>(
      `/orgs/${this.orgId}/crawls/${this.itemId}/qa`,
      this.authState!,
    );
  }
}
