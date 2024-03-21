import { localized, msg, str } from "@lit/localize";
import type { PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import throttle from "lodash/fp/throttle";

import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";

type Pages = string[];
type ResponseData = {
  total: number;
  results: Pages;
  matched: Pages;
};

const POLL_INTERVAL_SECONDS = 5;

/**
 * Show real-time crawl queue results
 *
 * Usage example:
 * ```ts
 * <btrix-crawl-queue
 *   orgId=${this.crawl.oid}
 *   crawlId=${this.crawl.id}
 *   .authState=${this.authState}
 *   regex="skip-me"
 * ></btrix-crawl-queue>
 * ```
 */
@localized()
@customElement("btrix-crawl-queue")
export class CrawlQueue extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  orgId?: string;

  @property({ type: String })
  crawlId?: string;

  @property({ type: Number })
  matchedTotal?: number;

  @property({ type: String })
  /** `new RegExp` constructor string */
  regex = "";

  @property({ type: Array })
  exclusions: string[] = [];

  @state()
  private exclusionsRx: RegExp[] = [];

  @state()
  private queue?: ResponseData;

  @state()
  private isLoading = false;

  @state()
  private pageSize = 50;

  private timerId?: number;

  disconnectedCallback() {
    window.clearInterval(this.timerId);
    super.disconnectedCallback();
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("exclusions")) {
      this.exclusionsRx = this.exclusions.map((x) => new RegExp(x));
    }
  }

  willUpdate(changedProperties: PropertyValues<this> & Map<string, unknown>) {
    if (
      changedProperties.has("authState") ||
      changedProperties.has("orgId") ||
      changedProperties.has("crawlId") ||
      changedProperties.has("pageSize") ||
      changedProperties.has("regex")
    ) {
      void this.fetchOnUpdate();
    }
  }

  render() {
    return html`
      <btrix-section-heading style="--margin: var(--sl-spacing-small)"
        >${msg("Queued URLs")} ${this.renderBadge()}</btrix-section-heading
      >
      ${this.renderContent()}
    `;
  }

  private renderContent() {
    if (!this.queue?.total) {
      if (this.isLoading) {
        return html`
          <div class="flex items-center justify-center text-3xl">
            <sl-spinner></sl-spinner>
          </div>
        `;
      }

      return html`
        <p class="text-sm text-neutral-400">${msg("No pages queued.")}</p>
      `;
    }

    return html`
      <btrix-numbered-list class="break-all text-xs" aria-live="polite">
        ${this.queue.results.map((url, idx) => {
          const isMatch = this.queue!.matched.some((v) => v === url);
          const isExcluded = !isMatch && this.isExcluded(url);
          return html`
            <btrix-numbered-list-item>
              <span class="${isMatch ? "text-red-600" : ""}" slot="marker"
                >${idx + 1}.</span
              >
              <a
                class="${isMatch
                  ? "text-red-500 hover:text-red-400"
                  : isExcluded
                    ? "text-gray-500 hover:text-gray-400 line-through"
                    : "text-blue-500 hover:text-blue-400"}"
                href=${url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                >${url}</a
              >
            </btrix-numbered-list-item>
          `;
        })}
      </btrix-numbered-list>

      <footer class="text-center">
        ${when(
          this.queue.total === this.queue.results.length,
          () =>
            html`<div class="py-3 text-xs text-neutral-400">
              ${msg("End of queue")}
            </div>`,
          () => html`
            <btrix-observable @intersect=${this.onLoadMoreIntersect}>
              <div class="py-3">
                <sl-icon-button
                  name="three-dots"
                  @click=${this.loadMore}
                  label=${msg("Load more")}
                ></sl-icon-button>
              </div>
            </btrix-observable>
          `,
        )}
      </footer>
    `;
  }

  private renderBadge() {
    if (!this.queue) return "";

    return html`
      <btrix-badge class="ml-1">
        ${this.queue.total
          ? this.queue.total > 1
            ? msg(str`${this.queue.total.toLocaleString()} URLs`)
            : msg(str`1 URL`)
          : msg("No queue")}
      </btrix-badge>

      ${this.matchedTotal
        ? html`
            <btrix-badge variant="danger" class="ml-1">
              ${this.matchedTotal > 1
                ? msg(str`-${this.matchedTotal.toLocaleString()} URLs`)
                : msg(str`-1 URL`)}
            </btrix-badge>
          `
        : ""}
    `;
  }

  private readonly onLoadMoreIntersect = throttle(50)((e: CustomEvent) => {
    if (!e.detail.entry.isIntersecting) return;
    this.loadMore();
  }) as (e: CustomEvent) => void;

  private loadMore() {
    this.pageSize = this.pageSize + 50;
  }

  private async fetchOnUpdate() {
    window.clearInterval(this.timerId);
    await this.performUpdate;
    this.isLoading = true;
    await this.fetchQueue();
    this.isLoading = false;
  }

  private async fetchQueue() {
    try {
      this.queue = await this.getQueue();
      this.timerId = window.setTimeout(() => {
        void this.fetchQueue();
      }, POLL_INTERVAL_SECONDS * 1000);
    } catch (e) {
      if ((e as Error).message !== "invalid_regex") {
        this.notify({
          message: msg("Sorry, couldn't fetch crawl queue at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  isExcluded(url: string) {
    for (const rx of this.exclusionsRx) {
      if (rx.test(url)) {
        return true;
      }
    }

    return false;
  }

  private async getQueue(): Promise<ResponseData> {
    const offset = "0";
    const count = this.pageSize.toString();
    const regex = this.regex;
    const params = new URLSearchParams({ offset, count, regex });
    const data: ResponseData = await this.apiFetch(
      `/orgs/${this.orgId}/crawls/${this.crawlId}/queue?${params.toString()}`,
      this.authState!,
    );

    return data;
  }
}
