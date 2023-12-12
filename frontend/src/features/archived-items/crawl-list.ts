/**
 * Display list of crawls
 *
 * Usage example:
 * ```ts
 * <btrix-crawl-list>
 *   <btrix-crawl-list-item .crawl=${crawl1}>
 *   </btrix-crawl-list-item>
 *   <btrix-crawl-list-item .crawl=${crawl2}>
 *   </btrix-crawl-list-item>
 * </btrix-crawl-list>
 * ```
 */
import type { TemplateResult } from "lit";
import { LitElement, html, css } from "lit";
import {
  customElement,
  property,
  query,
  queryAssignedElements,
} from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import queryString from "query-string";

import { NavigateController } from "@/controllers/navigate";
import { RelativeDuration } from "@/components/ui/relative-duration";
import type { Crawl } from "@/types/crawler";
import { srOnly, truncate } from "@/utils/css";
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
      grid-template-columns: 1fr 15rem 10rem 7rem 3rem;
      grid-gap: var(--sl-spacing-x-large);
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

@localized()
@customElement("btrix-crawl-list-item")
export class CrawlListItem extends LitElement {
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
        color: var(--sl-color-neutral-700);
        cursor: pointer;
        overflow: hidden;
      }

      @media only screen and (min-width: ${largeBreakpointCss}) {
        .item {
          height: 2.5rem;
        }
      }

      .col {
        display: flex;
        align-items: center;
        transition-property: margin;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 150ms;
        overflow: hidden;
        white-space: nowrap;
      }

      .detail {
        font-size: var(--sl-font-size-medium);
        text-overflow: ellipsis;
      }

      .desc {
        font-size: var(--sl-font-size-x-small);
        font-family: var(--font-monostyle-family);
        font-variation-settings: var(--font-monostyle-variation);
        text-overflow: ellipsis;
      }

      .desc:nth-child(2) {
        margin-left: 1rem;
        color: var(--sl-color-neutral-400);
      }

      .unknownValue {
        color: var(--sl-color-neutral-400);
      }

      .detail btrix-crawl-status {
        display: flex;
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

      .fileSize {
        min-width: 4em;
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
    `,
  ];

  @property({ type: String })
  orgSlug!: string;

  @property({ type: Object })
  crawl?: Crawl;

  @property({ type: String })
  collectionId?: string;

  @property({ type: String })
  workflowId?: string;

  @query(".row")
  row!: HTMLElement;

  @query("btrix-overflow-dropdown")
  dropdownMenu!: OverflowDropdown;

  private navigate = new NavigateController(this);

  // TODO localize
  private numberFormatter = new Intl.NumberFormat(undefined, {
    notation: "compact",
  });

  render() {
    const search =
      this.collectionId || this.workflowId
        ? `?${queryString.stringify(
            {
              collectionId: this.collectionId,
              workflowId: this.workflowId,
            },
            { skipEmptyString: true }
          )}`
        : "";
    return html`<div
      class="item row"
      role="button"
      @click=${async (e: MouseEvent) => {
        if (e.target === this.dropdownMenu) {
          return;
        }
        e.preventDefault();
        await this.updateComplete;
        const href = `/orgs/${this.orgSlug}/items/${this.crawl?.type}/${this.crawl?.id}${search}`;
        this.navigate.to(href);
      }}
    >
      <div class="col">
        <div class="detail url truncate">
          ${this.safeRender(
            (workflow) => html`
              <btrix-crawl-status
                state=${workflow.state}
                hideLabel
                ?isUpload=${workflow.type === "upload"}
              ></btrix-crawl-status>
              <slot name="id">${this.renderName(workflow)}</slot>
            `
          )}
        </div>
      </div>
      <div class="col">
        <div class="desc">
          ${this.safeRender((crawl) =>
            crawl.finished
              ? html`
                  <sl-format-date
                    date=${`${crawl.finished}Z`}
                    month="2-digit"
                    day="2-digit"
                    year="2-digit"
                    hour="2-digit"
                    minute="2-digit"
                  ></sl-format-date>
                `
              : msg(
                  str`Running for ${RelativeDuration.humanize(
                    new Date().valueOf() -
                      new Date(`${crawl.started}Z`).valueOf()
                  )}`
                )
          )}
        </div>
        ${this.safeRender((crawl) =>
          crawl.finished && crawl.type === "crawl"
            ? html`<div class="desc truncate">
                ${msg(
                  str`in ${RelativeDuration.humanize(
                    new Date(`${crawl.finished}Z`).valueOf() -
                      new Date(`${crawl.started}Z`).valueOf()
                  )}`
                )}
              </div>`
            : ""
        )}
      </div>
      <div class="col">
        ${this.safeRender((crawl) => {
          if (crawl.finished) {
            return html`<div class="desc fileSize">
              <sl-format-bytes
                value=${crawl.fileSize || 0}
                display="narrow"
              ></sl-format-bytes>
            </div>`;
          }
          const pagesComplete = +(crawl.stats?.done || 0);
          const pagesFound = +(crawl.stats?.found || 0);
          return html` <div class="desc">
            ${pagesFound === 1
              ? msg(
                  str`${this.numberFormatter.format(
                    pagesComplete
                  )} / ${this.numberFormatter.format(pagesFound)} page`
                )
              : msg(
                  str`${this.numberFormatter.format(
                    pagesComplete
                  )} / ${this.numberFormatter.format(pagesFound)} pages`
                )}
          </div>`;
        })}
        ${this.safeRender((crawl) => {
          if (crawl.type === "upload") {
            // TODO add back once API supports page count
            return;
          }
          if (crawl.finished) {
            const pagesComplete = +(crawl.stats?.done || 0);
            return html`
              <div class="desc pages truncate">
                ${pagesComplete === 1
                  ? msg(str`${this.numberFormatter.format(pagesComplete)} page`)
                  : msg(
                      str`${this.numberFormatter.format(pagesComplete)} pages`
                    )}
              </div>
            `;
          }
          return "";
        })}
      </div>
      <div class="col">
        <div class="detail truncate">
          ${this.safeRender(
            (crawl) => html`<span class="userName">${crawl.userName}</span>`
          )}
        </div>
      </div>
      ${this.renderActions()}
    </div>`;
  }

  private safeRender(
    render: (crawl: Crawl) => string | TemplateResult<1> | undefined
  ) {
    if (!this.crawl) {
      return html`<sl-skeleton></sl-skeleton>`;
    }
    return render(this.crawl);
  }

  private renderName(crawl: Crawl) {
    if (crawl.name) return html`<span class="truncate">${crawl.name}</span>`;
    if (!crawl.firstSeed)
      return html`<span class="truncate">${crawl.id}</span>`;
    const remainder = crawl.seedCount - 1;
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
      <span class="primaryUrl truncate">${crawl.firstSeed}</span>${nameSuffix}
    `;
  }

  private renderActions() {
    return html` <div class="col action">
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
    </div>`;
  }
}

@localized()
@customElement("btrix-crawl-list")
export class CrawlList extends LitElement {
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

      .list {
        border: 1px solid var(--sl-panel-border-color);
        border-radius: var(--sl-border-radius-medium);
        overflow: hidden;
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

      ::slotted(btrix-crawl-list-item) {
        display: block;
        transition-property: background-color, box-shadow;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 150ms;
      }

      ::slotted(btrix-crawl-list-item:not(:first-of-type)) {
        box-shadow: inset 0px 1px 0 var(--sl-panel-border-color);
      }

      ::slotted(btrix-crawl-list-item:hover),
      ::slotted(btrix-crawl-list-item:focus),
      ::slotted(btrix-crawl-list-item:focus-within) {
        background-color: var(--sl-color-neutral-50);
      }
    `,
  ];

  @property({ type: String })
  collectionId?: string;

  @property({ type: String })
  workflowId?: string;

  @property({ type: String })
  itemType: Crawl["type"] = null;

  @queryAssignedElements({ selector: "btrix-crawl-list-item" })
  listItems!: Array<HTMLElement>;

  render() {
    return html` <div class="listHeader row">
        <div class="col">
          <slot name="idCol">${msg("Name")}</slot>
        </div>
        <div class="col">${msg("Date Created")}</div>
        <div class="col">${msg("Size")}</div>
        <div class="col">${msg("Created By")}</div>
        <div class="col action">
          <span class="srOnly">${msg("Actions")}</span>
        </div>
      </div>
      <div class="list" role="list">
        <slot @slotchange=${this.handleSlotchange}></slot>
      </div>`;
  }

  private handleSlotchange() {
    const assignProp = (
      el: HTMLElement,
      attr: { name: string; value: string }
    ) => {
      if (!el.attributes.getNamedItem(attr.name)) {
        el.setAttribute(attr.name, attr.value);
      }
    };

    this.listItems.forEach((el) => {
      assignProp(el, { name: "role", value: "listitem" });
      assignProp(el, { name: "collectionId", value: this.collectionId || "" });
      assignProp(el, { name: "workflowId", value: this.workflowId || "" });
    });
  }
}
