import { localized, msg } from "@lit/localize";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import type { APIPaginatedList } from "@/types/api";
import { truncate } from "@/utils/css";

export type CrawlLog = {
  timestamp: string;
  logLevel: "error";
  details: Record<string, unknown>;
  context: string;
  message: string;
};

@localized()
@customElement("btrix-crawl-logs")
export class CrawlLogs extends LitElement {
  static styles = [
    truncate,
    css`
      btrix-numbered-list {
        font-size: var(--sl-font-size-x-small);
      }

      .row {
        display: grid;
        grid-template-columns: 9rem 4rem 15rem 1fr;
        line-height: 1.3;
      }

      .cell {
        padding-left: var(--sl-spacing-x-small);
        padding-right: var(--sl-spacing-x-small);
      }

      .tag {
        display: inline-block;
        border-radius: var(--sl-border-radius-small);
        padding: var(--sl-spacing-3x-small) var(--sl-spacing-2x-small);
        text-transform: capitalize;
        /* TODO handle non-errors */
        background-color: var(--danger);
        color: var(--sl-color-neutral-0);
      }

      footer {
        display: flex;
        justify-content: center;
        margin-top: var(--sl-spacing-large);
        margin-bottom: var(--sl-spacing-x-large);
      }

      .message {
        white-space: pre-wrap;
      }

      .url {
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
      }

      a {
        color: inherit;
      }

      a:hover {
        text-decoration: none;
      }

      pre {
        white-space: pre-wrap;
        font-family: var(--sl-font-mono);
        font-size: var(--sl-font-size-x-small);
        margin: 0;
        padding: var(--sl-spacing-small);
        border: 1px solid var(--sl-panel-border-color);
        border-radius: var(--sl-border-radius-medium);
      }
    `,
  ];

  @property({ type: Object })
  logs?: APIPaginatedList<CrawlLog>;

  @property({ type: Boolean })
  paginate = false;

  @state()
  private selectedLog:
    | (CrawlLog & {
        index: number;
      })
    | null = null;

  render() {
    if (!this.logs) return;
    return html`<btrix-numbered-list>
        <btrix-numbered-list-header slot="header">
          <div class="row">
            <div class="cell">${msg("Date")}</div>
            <div class="cell">${msg("Level")}</div>
            <div class="cell">${msg("Error Message")}</div>
            <div class="cell">${msg("Page URL")}</div>
          </div>
        </btrix-numbered-list-header>
        ${this.logs.items.map((log: CrawlLog, idx) => {
          const selected = this.selectedLog?.index === idx;
          return html`
            <btrix-numbered-list-item
              hoverable
              ?selected=${selected}
              aria-selected="${selected}"
              @click=${() => {
                this.selectedLog = {
                  index: idx,
                  ...log,
                };
              }}
            >
              <div slot="marker">${idx + 1}.</div>
              <div class="row">
                <div>
                  <sl-format-date
                    date=${log.timestamp}
                    month="2-digit"
                    day="2-digit"
                    year="2-digit"
                    hour="2-digit"
                    minute="2-digit"
                    second="2-digit"
                    hour-format="24"
                  >
                  </sl-format-date>
                </div>
                <div>
                  <span class="tag">${log.logLevel}</span>
                </div>
                <div class="message">${log.message}</div>
                <div class="url" title="${log.details.page as string}">
                  <a target="_blank" href="${log.details.page as string}"
                    >${log.details.page}</a
                  >
                </div>
              </div>
            </btrix-numbered-list-item>
          `;
        })}
      </btrix-numbered-list>
      ${this.paginate
        ? html`<footer>
            <btrix-pagination
              page=${this.logs.page}
              totalCount=${this.logs.total}
              size=${this.logs.pageSize}
            >
            </btrix-pagination>
          </footer>`
        : ""}

      <btrix-dialog
        .label=${msg("Log Details")}
        .open=${!!this.selectedLog}
        style="--width: 40rem"
        @sl-after-hide=${() => (this.selectedLog = null)}
        >${this.renderLogDetails()}</btrix-dialog
      > `;
  }

  private renderLogDetails() {
    if (!this.selectedLog) return;
    const { details } = this.selectedLog;
    return html`
      <btrix-desc-list>
        <btrix-desc-list-item label=${msg("Timestamp").toUpperCase()}>
          ${this.selectedLog.timestamp}
        </btrix-desc-list-item>
        ${Object.entries(details).map(
          ([key, value]) => html`
            <btrix-desc-list-item label=${key.toUpperCase()}>
              ${key === "stack" ||
              (typeof value !== "string" && typeof value !== "number")
                ? this.renderPre(value)
                : value || "--"}
            </btrix-desc-list-item>
          `,
        )}
      </btrix-desc-list>
    `;
  }

  private renderPre(value: unknown) {
    let str = value;
    if (typeof value !== "string") {
      str = JSON.stringify(value, null, 2);
    }
    return html`<pre><code>${str}</code></pre>`;
  }
}
