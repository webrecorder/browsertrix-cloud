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

  private readonly api = new APIController(this);
  private readonly navigate = new NavigateController(this);
  private readonly notify = new NotifyController(this);

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
    await this.fetchPages({ page: 1 });
    const firstPage = this.pages?.items[0];

    if (!this.itemPageId && firstPage) {
      this.navigate.to(
        `${window.location.pathname}?itemPageId=${firstPage.id}`,
      );
    }
  }

  render() {
    if (!this.pages) {
      return html`loading pages...`;
    }

    const crawlBaseUrl = `${this.navigate.orgBasePath}/items/crawl/${this.itemId}`;
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
        </header>
        <section class="main outline">
          <nav class="flex items-center justify-between p-2">
            <div class="flex gap-4">
              <btrix-navigation-button
                id="screenshot-tab"
                href=${`${crawlBaseUrl}/review/screenshots`}
                ?active=${this.tab === "screenshots"}
                @click=${this.navigate.link}
              >
                ${msg("Screenshots")}
              </btrix-navigation-button>
              <btrix-navigation-button
                id="replay-tab"
                href=${`${crawlBaseUrl}/review/replay`}
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
            ${this.pages.items.map(
              (page) => html`
                <li>
                  <a
                    class="underline"
                    href="${window.location.pathname}?itemPageId=${page.id}"
                    @click=${this.navigate.link}
                  >
                    id: ${page.id}</a
                  >
                </li>
              `,
            )}
          </ul>
          pg ${this.pages.page} of
          ${Math.ceil(this.pages.total / this.pages.pageSize)}
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
                date=${`${page.timestamp}Z`}
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
    return html`
      ${TABS.map((tab) => {
        const section = tabSection[tab];
        const isActive = tab === this.tab;
        return html`
          <section
            class="${isActive ? "" : "invisible absolute -top-full -left-full"}"
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
    return html`[screenshots]`;
  };

  private readonly renderReplay = () => {
    return html`[replay]`;
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
}
