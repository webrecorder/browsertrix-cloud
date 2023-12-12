/**
 * Display list of workflows
 *
 * Usage example:
 * ```ts
 * <btrix-workflow-list>
 *   <btrix-workflow-list-item .workflow=${workflow1}>
 *   </btrix-workflow-list-item>
 *   <btrix-workflow-list-item .workflow=${workflow2}>
 *   </btrix-workflow-list-item>
 * </btrix-workflow-list>
 * ```
 */
import type { TemplateResult } from "lit";
import { LitElement, html, css } from "lit";
import {
  property,
  query,
  queryAssignedElements,
  customElement,
} from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import { NavigateController } from "@/controllers/navigate";
import { RelativeDuration } from "@/components/ui/relative-duration";
import type { ListWorkflow } from "@/types/crawler";
import { srOnly, truncate } from "@/utils/css";
import { humanizeSchedule } from "@/utils/cron";
import { numberFormatter } from "@/utils/number";
import type { OverflowDropdown } from "@/components/ui/overflow-dropdown";

const mediumBreakpointCss = css`30rem`;
const largeBreakpointCss = css`60rem`;
const rowCss = css`
  .row {
    display: grid;
    grid-template-columns: 1fr;
  }

  @media only screen and (min-width: ${mediumBreakpointCss}) {
    .row {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media only screen and (min-width: ${largeBreakpointCss}) {
    .row {
      grid-template-columns: 1fr 17rem 10rem 11rem 3rem;
    }
  }

  .col {
    grid-column: span 1 / span 1;
  }
`;
const columnCss = css`
  .col:not(.action) {
    padding-left: var(--sl-spacing-small);
    padding-right: var(--sl-spacing-small);
  }

  .col:first-child {
    padding-left: var(--sl-spacing-medium);
  }
`;
// Shared custom variables
const hostVars = css`
  :host {
    --row-offset: var(--sl-spacing-x-small);
  }
`;

@customElement("btrix-workflow-list-item")
@localized()
export class WorkflowListItem extends LitElement {
  static styles = [
    truncate,
    rowCss,
    columnCss,
    hostVars,
    css`
      a {
        all: unset;
      }

      .item {
        contain: size;
        contain-intrinsic-height: auto 4rem;
        cursor: pointer;
        transition-property: background-color, box-shadow, margin;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 150ms;
        overflow: hidden;
      }

      .item:hover,
      .item:focus,
      .item:focus-within {
        background-color: var(--sl-color-neutral-50);
      }

      .item:hover {
        background-color: var(--sl-color-neutral-50);
        margin-left: calc(-1 * var(--row-offset));
        margin-right: calc(-1 * var(--row-offset));
      }

      .item:hover .col:nth-child(n + 2) {
        margin-left: calc(-1 * var(--row-offset));
      }

      .item:hover .col.action {
        margin-left: calc(-2 * var(--row-offset));
      }

      .row {
        border: 1px solid var(--sl-panel-border-color);
        border-radius: var(--sl-border-radius-medium);
        box-shadow: var(--sl-shadow-x-small);
      }

      .row:hover {
        box-shadow: var(--sl-shadow-small);
      }

      .col {
        padding-top: var(--sl-spacing-small);
        padding-bottom: var(--sl-spacing-small);
        transition-property: margin;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 150ms;
        overflow: hidden;
      }

      .detail {
        color: var(--sl-color-neutral-700);
        font-size: var(--sl-font-size-medium);
        text-overflow: ellipsis;
        height: 1.5rem;
      }

      .desc {
        color: var(--sl-color-neutral-500);
        font-size: var(--sl-font-size-x-small);
        font-family: var(--font-monostyle-family);
        font-variation-settings: var(--font-monostyle-variation);
        height: 1rem;
      }

      .notSpecified {
        color: var(--sl-color-neutral-400);
      }

      .url {
        display: flex;
      }

      .url .primaryUrl {
        flex: 0 1 auto;
      }

      .url .additionalUrls {
        flex: none;
        margin-left: var(--sl-spacing-2x-small);
      }

      .primaryUrl {
        word-break: break-all;
      }

      .additionalUrls {
        color: var(--sl-color-neutral-500);
      }

      .currCrawlSize {
        color: var(--success);
      }

      .duration {
        margin-left: calc(1rem + var(--sl-spacing-x-small));
      }

      .userName {
        font-family: var(--font-monostyle-family);
        font-variation-settings: var(--font-monostyle-variation);
      }

      .action {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      @media only screen and (min-width: ${largeBreakpointCss}) {
        .action {
          border-left: 1px solid var(--sl-panel-border-color);
        }
      }
    `,
  ];

  @property({ type: String })
  orgSlug!: string;

  @property({ type: Object })
  workflow?: ListWorkflow;

  @query(".row")
  row!: HTMLElement;

  @query("btrix-overflow-dropdown")
  dropdownMenu!: OverflowDropdown;

  private navigate = new NavigateController(this);

  private numberFormatter = numberFormatter(undefined, {
    notation: "compact",
  });

  render() {
    const notSpecified = html`<span class="notSpecified" role="presentation"
      >---</span
    >`;

    return html`<div
      class="item row"
      role="button"
      @click=${async (e: MouseEvent) => {
        if (e.target === this.dropdownMenu) {
          return;
        }
        e.preventDefault();
        await this.updateComplete;
        const href = `/orgs/${this.orgSlug}/workflows/crawl/${
          this.workflow?.id
        }#${this.workflow?.isCrawlRunning ? "watch" : "crawls"}`;
        this.navigate.to(href);
      }}
    >
      <div class="col">
        <div class="detail url truncate">
          ${this.safeRender(this.renderName)}
        </div>
        <div class="desc">
          ${this.safeRender((workflow) => {
            if (workflow.schedule) {
              return msg(
                str`${humanizeSchedule(
                  workflow.schedule,
                  {
                    length: "short",
                  },
                  numberFormatter
                )}`
              );
            }
            if (workflow.lastStartedByName) {
              return msg(str`Manual run by ${workflow.lastStartedByName}`);
            }
            return msg("---");
          })}
        </div>
      </div>
      <div class="col">
        <div class="detail">
          ${this.safeRender(
            (workflow) =>
              html`
                <btrix-crawl-status
                  state=${workflow.lastCrawlState || msg("No Crawls Yet")}
                  ?stopping=${workflow.lastCrawlStopping}
                ></btrix-crawl-status>
              `
          )}
        </div>
        <div class="desc duration">
          ${this.safeRender((workflow) => {
            if (workflow.lastCrawlTime && workflow.lastCrawlStartTime) {
              return html`<sl-format-date
                  date="${workflow.lastRun.toString()}Z"
                  month="2-digit"
                  day="2-digit"
                  year="2-digit"
                  hour="2-digit"
                  minute="2-digit"
                ></sl-format-date>
                ${msg(
                  str`in ${RelativeDuration.humanize(
                    new Date(`${workflow.lastCrawlTime}Z`).valueOf() -
                      new Date(`${workflow.lastCrawlStartTime}Z`).valueOf(),
                    { compact: true }
                  )}`
                )}`;
            }
            if (workflow.lastCrawlStartTime) {
              const diff =
                new Date().valueOf() -
                new Date(`${workflow.lastCrawlStartTime}Z`).valueOf();
              if (diff < 1000) {
                return "";
              }
              return msg(
                str`Running for ${RelativeDuration.humanize(diff, {
                  compact: true,
                })}`
              );
            }
            return notSpecified;
          })}
        </div>
      </div>
      <div class="col">
        <div class="detail">
          ${this.safeRender((workflow) => {
            if (
              workflow.isCrawlRunning &&
              workflow.totalSize &&
              workflow.lastCrawlSize
            ) {
              return html`<sl-format-bytes
                  value=${+workflow.totalSize}
                  display="narrow"
                ></sl-format-bytes>
                <span class="currCrawlSize">
                  +
                  <sl-format-bytes
                    value=${workflow.lastCrawlSize}
                    display="narrow"
                  ></sl-format-bytes>
                </span>`;
            }
            if (workflow.totalSize && workflow.lastCrawlSize) {
              return html`<sl-format-bytes
                value=${+workflow.totalSize}
                display="narrow"
              ></sl-format-bytes>`;
            }
            if (workflow.isCrawlRunning && workflow.lastCrawlSize) {
              return html`<span class="currCrawlSize">
                <sl-format-bytes
                  value=${workflow.lastCrawlSize}
                  display="narrow"
                ></sl-format-bytes>
              </span>`;
            }
            if (workflow.totalSize) {
              return html`<sl-format-bytes
                value=${+workflow.totalSize}
                display="narrow"
              ></sl-format-bytes>`;
            }
            return notSpecified;
          })}
        </div>
        <div class="desc">
          ${this.safeRender((workflow) =>
            workflow.crawlCount === 1
              ? msg(str`${workflow.crawlCount} crawl`)
              : msg(
                  str`${this.numberFormatter.format(
                    workflow.crawlCount ?? 0
                  )} crawls`
                )
          )}
        </div>
      </div>
      <div class="col">
        <div class="detail truncate">
          ${this.safeRender(
            (workflow) =>
              html`<span class="userName">${workflow.modifiedByName}</span>`
          )}
        </div>
        <div class="desc">
          ${this.safeRender(
            (workflow) => html`
              <sl-format-date
                date=${workflow.modified.toString()}
                month="2-digit"
                day="2-digit"
                year="2-digit"
                hour="2-digit"
                minute="2-digit"
              ></sl-format-date>
            `
          )}
        </div>
      </div>
      <div class="col action">
        <btrix-overflow-dropdown>
          <slot
            name="menu"
            @click=${(e: MouseEvent) => {
              // Prevent navigation to detail view
              e.preventDefault();
              e.stopPropagation();
            }}
          ></slot>
        </btrix-overflow-dropdown>
      </div>
    </div>`;
  }

  private safeRender(
    render: (workflow: ListWorkflow) => string | TemplateResult<1>
  ) {
    if (!this.workflow) {
      return html`<sl-skeleton></sl-skeleton>`;
    }
    return render(this.workflow);
  }

  // TODO consolidate collections/workflow name
  private renderName(workflow: ListWorkflow) {
    if (workflow.name)
      return html`<span class="truncate">${workflow.name}</span>`;
    if (!workflow.firstSeed)
      return html`<span class="truncate">${workflow.id}</span>`;
    const remainder = workflow.seedCount - 1;
    let nameSuffix: string | TemplateResult<1> = "";
    if (remainder) {
      if (remainder === 1) {
        nameSuffix = html`<span class="additionalUrls"
          >${msg(str`+${remainder} URL`)}</span
        >`;
      } else {
        nameSuffix = html`<span class="additionalUrls"
          >${msg(str`+${remainder} URLs`)}</span
        >`;
      }
    }
    return html`
      <span class="primaryUrl truncate">${workflow.firstSeed}</span
      >${nameSuffix}
    `;
  }
}

@localized()
@customElement("btrix-workflow-list")
export class WorkflowList extends LitElement {
  static styles = [
    srOnly,
    rowCss,
    columnCss,
    hostVars,
    css`
      .listHeader,
      .list {
        margin-left: var(--row-offset);
        margin-right: var(--row-offset);
      }

      .listHeader {
        line-height: 1;
      }

      .row {
        display: none;
        font-size: var(--sl-font-size-x-small);
        color: var(--sl-color-neutral-600);
      }

      .col {
        padding-top: var(--sl-spacing-x-small);
        padding-bottom: var(--sl-spacing-x-small);
      }

      @media only screen and (min-width: ${largeBreakpointCss}) {
        .row {
          display: grid;
        }
      }

      ::slotted(btrix-workflow-list-item) {
        display: block;
      }

      ::slotted(btrix-workflow-list-item:not(:last-of-type)) {
        margin-bottom: var(--sl-spacing-x-small);
      }
    `,
  ];

  @queryAssignedElements({ selector: "btrix-workflow-list-item" })
  listItems!: Array<HTMLElement>;

  render() {
    return html` <div class="listHeader row">
        <div class="col">${msg("Name & Schedule")}</div>
        <div class="col">${msg("Latest Crawl")}</div>
        <div class="col">${msg("Total Size")}</div>
        <div class="col">${msg("Last Modified")}</div>
        <div class="col action">
          <span class="srOnly">${msg("Actions")}</span>
        </div>
      </div>
      <div class="list" role="list">
        <slot @slotchange=${this.handleSlotchange}></slot>
      </div>`;
  }

  private handleSlotchange() {
    this.listItems.map((el) => {
      if (!el.attributes.getNamedItem("role")) {
        el.setAttribute("role", "listitem");
      }
    });
  }
}
