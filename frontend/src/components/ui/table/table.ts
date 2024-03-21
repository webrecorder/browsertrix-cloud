import { css, html, LitElement } from "lit";
import {
  customElement,
  property,
  queryAssignedElements,
} from "lit/decorators.js";

import { type TableHead } from "./table-head";
import tableCSS from "./table.stylesheet.css";

import { theme } from "@/theme";

// Add table CSS to theme CSS to make it available throughout the app,
// to both shadow and light dom components.
// TODO Remove once all `LiteElement`s are migrated over to `TailwindElement`
tableCSS.split("}").forEach((rule: string) => {
  if (!rule.trim()) return;
  theme.insertRule(`${rule}}`);
});

/**
 * Low-level component for displaying content as a table.
 * To style tables, use TailwindCSS utility classes.
 *
 * @example Usage:
 * ```ts
 * <btrix-table>
 *   <btrix-table-head class="border-b">
 *     <btrix-table-header-cell class="border-r">col 1 </btrix-table-header-cell>
 *     <btrix-table-header-cell>col 2</btrix-table-header-cell>
 *   </btrix-table-head>
 *   <btrix-table-body>
 *     <btrix-table-row class="border-b">
 *       <btrix-table-cell class="border-r">row 1 col 1</btrix-table-cell>
 *       <btrix-table-cell>row 1 col 2</btrix-table-cell>
 *     </btrix-table-row>
 *     <btrix-table-row>
 *       <btrix-table-cellclass="border-r">row 2 col 1</btrix-table-cell>
 *       <btrix-table-cell>row 2 col 2</btrix-table-cell>
 *     </btrix-table-row>
 *   </btrix-table-body>
 * </btrix-table>
 * ```
 *
 * Table columns will be automatically sized according to its content.
 * To specify column size, use `grid-template-columns`.
 *
 * @slot head
 * @slot
 * @csspart head
 * @cssproperty --btrix-cell-gap
 * @cssproperty --btrix-cell-padding-top
 * @cssproperty --btrix-cell-padding-left
 * @cssproperty --btrix-cell-padding-right
 * @cssproperty --btrix-cell-padding-bottom
 */
@customElement("btrix-table")
export class Table extends LitElement {
  static styles = css`
    :host {
      --btrix-cell-gap: 0;
      --btrix-cell-padding-top: 0;
      --btrix-cell-padding-bottom: 0;
      --btrix-cell-padding-left: 0;
      --btrix-cell-padding-right: 0;

      display: grid;
    }
  `;

  @property({ type: String, reflect: true, noAccessor: true })
  role = "table";

  @queryAssignedElements({ selector: "btrix-table-head" })
  private readonly head!: TableHead[];

  render() {
    return html`<slot @slotchange=${this.onSlotChange}></slot>`;
  }

  private async onSlotChange() {
    const headEl = this.head[0] as TableHead | undefined;
    if (!headEl) return;
    await headEl.updateComplete;

    this.style.setProperty(
      "--btrix-table-grid-column",
      `span ${headEl.colCount}`,
    );
  }
}
