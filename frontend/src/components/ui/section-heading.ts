import { css, html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * Styled section heading
 *
 * Usage example:
 * ```ts
 * <btrix-section-heading>Text</btrix-section-heading>
 * ```
 */
@customElement("btrix-section-heading")
export class SectionHeading extends LitElement {
  // postcss-lit-disable-next-line
  static styles = css`
    .heading {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: var(--sl-font-size-medium);
      color: var(--sl-color-neutral-500);
      padding-top: var(--sl-spacing-x-small);
      padding-bottom: var(--sl-spacing-x-small);
      line-height: 1;
      border-bottom: 1px solid var(--sl-panel-border-color);
      margin-bottom: var(--margin);
    }
  `;

  render() {
    return html`<div class="heading"><slot></slot></div>`;
  }
}
