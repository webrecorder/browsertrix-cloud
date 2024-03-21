import { localized, msg } from "@lit/localize";
import { type SlCheckbox } from "@shoelace-style/shoelace";
import { css, html, nothing } from "lit";
import {
  customElement,
  property,
  query,
  queryAssignedElements,
  state,
} from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { NavigateController } from "@/controllers/navigate";
import type { ArchivedItem } from "@/types/crawler";
import { renderName } from "@/utils/crawler";

export type CheckboxChangeEventDetail = {
  checked: boolean;
};

/**
 * @slot actionCell - Action cell
 * @slot namePrefix - Prefix name in cell
 * @fires btrix-checkbox-change
 */
@localized()
@customElement("btrix-archived-item-list-item")
export class ArchivedItemListItem extends TailwindElement {
  static styles = css`
    :host {
      display: contents;
    }

    btrix-table-row {
      border-top: var(--btrix-border-top, 0);
      border-radius: var(--btrix-border-radius-top, 0)
        var(--btrix-border-radius-to, 0) var(--btrix-border-radius-bottom, 0)
        var(--btrix-border-radius-bottom, 0);
      height: 2.5rem;
    }
  `;

  @property({ type: Object })
  item?: ArchivedItem;

  @property({ type: Boolean })
  checkbox = false;

  @property({ type: Boolean })
  checked = false;

  @property({ type: Number })
  index = 0;

  @property({ type: String })
  href?: string;

  @query("sl-checkbox")
  checkboxEl?: SlCheckbox;

  private readonly navigate = new NavigateController(this);

  render() {
    if (!this.item) return;
    const checkboxId = `${this.item.id}-checkbox`;
    const rowName = html`
      <div class="flex items-center gap-3">
        <slot name="namePrefix"></slot>
        ${renderName(this.item)}
      </div>
    `;
    return html`
      <btrix-table-row
        class=${this.href || this.checkbox
          ? "cursor-pointer select-none transition-colors hover:bg-neutral-50 focus-within:bg-neutral-50"
          : ""}
      >
        ${this.checkbox
          ? html`
              <btrix-table-cell class="pr-0">
                <sl-checkbox
                  id=${checkboxId}
                  class="flex"
                  ?checked=${this.checked}
                  @sl-change=${(e: CustomEvent) => {
                    this.dispatchEvent(
                      new CustomEvent<CheckboxChangeEventDetail>(
                        "btrix-checkbox-change",
                        {
                          detail: {
                            checked: (e.currentTarget as SlCheckbox).checked,
                          },
                        },
                      ),
                    );
                  }}
                ></sl-checkbox>
              </btrix-table-cell>
            `
          : nothing}
        <btrix-table-cell
          rowClickTarget=${ifDefined(
            this.href ? "a" : this.checkbox ? "label" : undefined,
          )}
        >
          ${this.href
            ? html`<a href=${this.href} @click=${this.navigate.link}>
                ${rowName}
              </a>`
            : this.checkbox
              ? html`<label
                  for=${checkboxId}
                  @click=${() => {
                    // We need to simulate click anyway, since external label click
                    // won't work with the shoelace checkbox
                    this.checkboxEl?.click();
                  }}
                >
                  ${rowName}
                </label>`
              : html`<div>${rowName}</div>`}
        </btrix-table-cell>
        <btrix-table-cell>
          <sl-format-date
            class="truncate"
            date=${`${this.item.finished}Z`}
            month="2-digit"
            day="2-digit"
            year="2-digit"
            hour="2-digit"
            minute="2-digit"
          ></sl-format-date>
        </btrix-table-cell>
        <btrix-table-cell>
          <sl-format-bytes
            class="truncate"
            value=${this.item.fileSize || 0}
            display="narrow"
          ></sl-format-bytes>
        </btrix-table-cell>
        <btrix-table-cell>
          ${this.item.type === "crawl"
            ? html`<div class="truncate">
                ${(this.item.stats?.done || 0).toLocaleString()}
              </div>`
            : html`<span class="text-neutral-400">${msg("n/a")}</span>`}
        </btrix-table-cell>
        <btrix-table-cell>
          <div class="truncate">${this.item.userName}</div>
        </btrix-table-cell>
        <slot name="actionCell"></slot>
      </btrix-table-row>
    `;
  }
}

/**
 * @example Usage:
 * ```ts
 * <btrix-archived-item-list>
 *   <btrix-archived-item-list-item .item=${item}
 *   ></btrix-archived-item-list-item>
 * </btrix-archived-item-list>
 * ```
 *
 * @slot checkboxCell
 * @slot actionCell
 */
@localized()
@customElement("btrix-archived-item-list")
export class ArchivedItemList extends TailwindElement {
  static styles = css`
    btrix-table {
      --btrix-cell-gap: var(--sl-spacing-x-small);
      --btrix-cell-padding-left: var(--sl-spacing-small);
      --btrix-cell-padding-right: var(--sl-spacing-small);
    }

    btrix-table-body ::slotted(*:nth-of-type(n + 2)) {
      --btrix-border-top: 1px solid var(--sl-panel-border-color);
    }

    btrix-table-body ::slotted(*:first-of-type) {
      --btrix-border-radius-top: var(--sl-border-radius-medium);
    }

    btrix-table-body ::slotted(*:last-of-type) {
      --btrix-border-radius-bottom: var(--sl-border-radius-medium);
    }
  `;

  @queryAssignedElements({ selector: "btrix-archived-item-list-item" })
  items!: ArchivedItemListItem[];

  @state()
  private hasCheckboxCell = false;

  @state()
  private hasActionCell = false;

  render() {
    return html`
      <style>
        btrix-table {
          grid-template-columns: ${`${
            this.hasCheckboxCell ? "min-content" : ""
          } [clickable-start] 60ch 12rem 1fr 1fr 30ch [clickable-end] ${
            this.hasActionCell ? "min-content" : ""
          }`.trim()};
        }
      </style>
      <div class="overflow-auto">
        <btrix-table>
          <btrix-table-head class="mb-2">
            <slot
              name="checkboxCell"
              @slotchange=${(e: Event) =>
                (this.hasCheckboxCell =
                  (e.target as HTMLSlotElement).assignedElements().length > 0)}
            ></slot>
            <btrix-table-header-cell>${msg("Name")}</btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Date Created")}
            </btrix-table-header-cell>
            <btrix-table-header-cell>${msg("Size")}</btrix-table-header-cell>
            <btrix-table-header-cell
              >${msg("Pages Crawled")}</btrix-table-header-cell
            >
            <btrix-table-header-cell>
              ${msg("Created By")}
            </btrix-table-header-cell>
            <slot
              name="actionCell"
              @slotchange=${(e: Event) =>
                (this.hasActionCell =
                  (e.target as HTMLSlotElement).assignedElements().length > 0)}
            ></slot>
          </btrix-table-head>
          <btrix-table-body class="rounded border">
            <slot></slot>
          </btrix-table-body>
        </btrix-table>
      </div>
    `;
  }
}
