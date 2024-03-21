import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * @cssproperty --btrix-table-grid-column
 */
@customElement("btrix-table-row")
export class TableRow extends LitElement {
  static styles = css`
    :host {
      grid-column: var(--btrix-table-grid-column);
      display: grid;
      grid-template-columns: subgrid;
      position: relative;
    }
  `;

  @property({ type: String, reflect: true, noAccessor: true })
  role = "row";

  render() {
    return html`<slot></slot>`;
  }
}
