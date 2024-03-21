import { css, html, LitElement } from "lit";
import {
  customElement,
  property,
  queryAssignedElements,
} from "lit/decorators.js";

import { type TableHeaderCell } from "./table-header-cell";

/**
 * @csspart base
 * @cssproperty --btrix-table-grid-column
 */
@customElement("btrix-table-head")
export class TableHead extends LitElement {
  static styles = css`
    :host {
      grid-column: var(--btrix-table-grid-column);
      display: grid;
      grid-template-columns: subgrid;
      color: var(--sl-color-neutral-700);
      font-size: var(--sl-font-size-x-small);
      line-height: 1;
    }
  `;

  @property({ type: String, reflect: true, noAccessor: true })
  role = "rowgroup";

  @property({ type: Number, reflect: true, noAccessor: true })
  colCount = 1;

  @queryAssignedElements({
    selector: "btrix-table-header-cell",
    flatten: true,
  })
  private readonly headerCells!: TableHeaderCell[];

  render() {
    return html`<btrix-table-row>
      <slot @slotchange=${this.onSlotChange}></slot>
    </btrix-table-row>`;
  }

  private onSlotChange() {
    this.colCount = this.headerCells.length || 1;
  }
}
