import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TableCell } from "./table-cell";

@customElement("btrix-table-header-cell")
export class TableHeaderCell extends TableCell {
  @property({ type: String, reflect: true, noAccessor: true })
  role = "columnheader";

  @property({ type: String, reflect: true, noAccessor: true })
  ariaSort = "none";

  render() {
    return html`<slot></slot>`;
  }
}
