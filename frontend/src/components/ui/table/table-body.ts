import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * @cssproperty --btrix-table-grid-column
 * @cssproperty --btrix-row-gap
 */
@customElement("btrix-table-body")
export class TableBody extends LitElement {
  static styles = css`
    :host {
      grid-column: var(--btrix-table-grid-column);
      display: grid;
      grid-template-columns: subgrid;
      grid-row-gap: var(--btrix-row-gap, 0);
      color: var(--sl-color-neutral-900);
    }
  `;

  @property({ type: String, reflect: true, noAccessor: true })
  role = "rowgroup";

  render() {
    return html`<slot></slot>`;
  }
}
