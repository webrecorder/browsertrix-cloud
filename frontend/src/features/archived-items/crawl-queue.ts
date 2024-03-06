import { customElement, property, state } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import throttle from "lodash/fp/throttle";
import type {
  SlInput,
  SlChangeEvent,
  SlInputEvent,
} from "@shoelace-style/shoelace";

import LiteElement, { html } from "@/utils/LiteElement";
import type { AuthState } from "@/utils/AuthService";
import type { PropertyValues } from "lit";

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
  private pageOffset = 0;

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
      changedProperties.has("regex") ||
      (changedProperties.has("pageOffset") &&
        // Prevents double-fetch when offset is programmatically changed according to queue total
        !changedProperties.has("queue"))
    ) {
      void this.fetchOnUpdate();
    }
  }

  render() {
    return html`
      <btrix-section-heading style="--margin: var(--sl-spacing-small)">
        <div class="flex w-full items-center justify-between">
          <div>${msg("Queued URLs")} ${this.renderBadge()}</div>
          ${this.renderOffsetControl()}
        </div>
      </btrix-section-heading>
      ${this.renderContent()}
    `;
  }

  private renderOffsetControl() {
    if (!this.queue) return;
    const offsetValue = this.pageOffset + 1;
    const countMax = Math.min(
      this.pageOffset + this.pageSize,
      this.queue.total,
    );
    const getInputWIdth = (v: number | string) =>
      `${Math.max(v.toString().length, 3) + 2}ch`;

    return html`
      <div class="flex items-center text-neutral-500">
        ${msg(html`
          Viewing
          <btrix-inline-input
            class="mx-1 inline-block"
            style="width: ${Math.max(offsetValue.toString().length, 3) + 2}ch"
            value=${offsetValue}
            inputmode="numeric"
            size="small"
            autocomplete="off"
            @sl-input=${(e: SlInputEvent) => {
              const input = e.target as SlInput;

              input.style.width = getInputWIdth(input.value);
            }}
            @sl-change=${(e: SlChangeEvent) => {
              const input = e.target as SlInput;
              const int = +input.value.replace(/\D/g, "");
              const value = Math.max(
                1,
                Math.min(int, this.queue!.total - this.pageSize),
              );

              input.value = value.toString();
              this.pageOffset = value - 1;
            }}
          ></btrix-inline-input>
          to ${countMax.toLocaleString()} of
          ${this.queue.total.toLocaleString()}
        `)}
      </div>
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
                >${idx + this.pageOffset + 1}.</span
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
          this.queue.total <= this.pageOffset + this.pageSize,
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
      if (this.pageOffset + this.pageSize >= this.queue.total) {
        this.pageOffset = Math.max(0, this.queue.total - this.pageSize - 1);
      }
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
    const count = this.pageSize.toString();
    const regex = this.regex;
    const params = new URLSearchParams({
      offset: this.pageOffset.toString(),
      count,
      regex,
    });
    const data: ResponseData = await this.apiFetch(
      `/orgs/${this.orgId}/crawls/${this.crawlId}/queue?${params.toString()}`,
      this.authState!,
    );

    return data;
  }
}
