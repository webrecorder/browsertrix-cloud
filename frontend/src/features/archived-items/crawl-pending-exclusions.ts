import { customElement, property, state } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import LiteElement, { html } from "@/utils/LiteElement";
import { type PageChangeEvent } from "@/components/ui/pagination";

type URLs = string[];

/**
 * Show pending exclusions in crawl queue
 *
 * Usage example:
 * ```ts
 * <btrix-crawl-pending-exclusions
 *   .matchedURLs=${this.matchedURLs}
 * ></btrix-crawl-pending-exclusions>
 * ```
 */
@localized()
@customElement("btrix-crawl-pending-exclusions")
export class CrawlPendingExclusions extends LiteElement {
  @property({ type: Array })
  matchedURLs: URLs | null = null;

  @state()
  private page = 1;

  private get pageSize() {
    return 10;
  }

  private get total(): number {
    return this.matchedURLs?.length || 0;
  }

  private get pageResults(): URLs {
    if (!this.matchedURLs) return [];

    return this.matchedURLs.slice(
      (this.page - 1) * this.pageSize,
      this.page * this.pageSize,
    );
  }

  render() {
    return html`
      <btrix-section-heading style="--margin: var(--sl-spacing-small)">
        <div class="flex w-full items-center justify-between">
          <div>${msg("Pending Exclusions")} ${this.renderBadge()}</div>
          ${this.total && this.total > this.pageSize
            ? html`<btrix-pagination
                page=${this.page}
                size=${this.pageSize}
                totalCount=${this.total}
                compact
                @page-change=${(e: PageChangeEvent) => {
                  this.page = e.detail.page;
                }}
              >
              </btrix-pagination>`
            : ""}
        </div>
      </btrix-section-heading>
      ${this.renderContent()}
    `;
  }

  private renderBadge() {
    if (!this.matchedURLs) return "";

    return html`
      <btrix-badge variant=${this.total ? "danger" : "neutral"} class="ml-1">
        ${this.total
          ? this.total > 1
            ? msg(str`+${this.total.toLocaleString()} URLs`)
            : msg(str`+1 URL`)
          : msg("No matches")}
      </btrix-badge>
    `;
  }

  private renderContent() {
    if (!this.total) {
      return html`<p class="px-5 text-sm text-neutral-400">
        ${this.matchedURLs
          ? msg("No matching URLs found in queue.")
          : msg(
              "Start typing an exclusion to view matching URLs in the queue.",
            )}
      </p>`;
    }

    return html`
      <btrix-numbered-list class="break-all text-xs" aria-live="polite">
        ${this.pageResults.map(
          (url, idx) => html`
            <btrix-numbered-list-item>
              <span class="text-red-600" slot="marker"
                >${idx + 1 + (this.page - 1) * this.pageSize}.</span
              >
              <a
                class="text-red-600 hover:text-red-500"
                href=${url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                >${url}</a
              >
            </btrix-numbered-list-item>
          `,
        )}
      </btrix-numbered-list>
    `;
  }
}
