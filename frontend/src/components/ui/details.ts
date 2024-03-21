import { css, html, LitElement, unsafeCSS } from "lit";
import { customElement, property } from "lit/decorators.js";

import caretDownFillSvg from "~assets/images/caret-down-fill.svg";
import caretRightFillSvg from "~assets/images/caret-right-fill.svg";

/**
 * Styled <details>
 *
 * Usage example:
 * ```ts
 * <btrix-details>
 *   <span slot="title">Summary</span>
 *   <span slot="summary-description">Summary</span>
 *   ${content}
 * </btrix-details>
 * ```
 *
 * @event on-toggle { open: boolean; }
 */
@customElement("btrix-details")
export class Details extends LitElement {
  @property({ type: Boolean })
  open? = false;

  @property({ type: Boolean })
  disabled? = false;

  // postcss-lit-disable-next-line
  static styles = css`
    :host {
      display: block;
    }

    summary::-webkit-details-marker {
      display: none;
    }

    summary {
      color: var(--sl-color-neutral-500);
      margin-bottom: var(--sl-spacing-2x-small);
      line-height: 1;
      display: flex;
      align-items: center;
      list-style: none;
    }

    details[aria-disabled="false"] summary {
      border-bottom: 1px solid var(--sl-panel-border-color);
      margin-bottom: var(--sl-spacing-x-small);
      cursor: pointer;
      user-select: none;
    }

    details[aria-disabled="false"] summary::before {
      display: block;
      width: 1rem;
      height: 1rem;
      margin-right: var(--sl-spacing-2x-small);
      flex: 0;
    }

    details[aria-disabled="false"][open] summary::before {
      content: url(${unsafeCSS(caretDownFillSvg)});
    }

    details[aria-disabled="false"]:not([open]) summary::before {
      content: url(${unsafeCSS(caretRightFillSvg)});
    }

    .summary-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex: 1;
    }

    .title {
      line-height: 1.125rem;
      height: 1.125rem;
      padding: 0.375rem 0;
    }
  `;

  connectedCallback() {
    // Preload icon for other state
    const img = new Image();
    if (this.open) {
      img.src = caretRightFillSvg;
    } else {
      img.src = caretDownFillSvg;
    }

    super.connectedCallback();
  }

  render() {
    return html`
      <details
        ?open=${this.open}
        @click=${this.onClick}
        @toggle=${this.onToggle}
        aria-disabled=${this.disabled ? "true" : "false"}
      >
        <summary tabindex=${this.disabled ? "-1" : "0"}>
          <div class="summary-content">
            <div class="title">
              <slot name="title"></slot>
            </div>
            <slot name="summary-description"></slot>
          </div>
        </summary>
        <slot></slot>
      </details>
    `;
  }

  private onClick(e: Event) {
    if (this.disabled) {
      e.preventDefault();
      return;
    }
  }

  private onToggle(e: Event) {
    const isOpen = (e.target as HTMLDetailsElement).open;

    if (isOpen !== this.open) {
      this.dispatchEvent(
        new CustomEvent("on-toggle", {
          detail: { open: isOpen },
        }),
      );
    }
  }
}
