import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Alert used inline, e.g. for form server errors
 *
 * Usage example:
 * ```ts
 * <input aria-describedby="error_message" />
 * <btrix-alert id="error_message>${errorMessage}</btrix-alert>
 * ```
 */
@customElement("btrix-alert")
export class Alert extends LitElement {
  @property({ type: String })
  variant: "success" | "warning" | "danger" | "info" = "info";

  // postcss-lit-disable-next-line
  static styles = css`
    :host > div {
      padding: var(--sl-spacing-x-small) var(--sl-spacing-small);
      border-radius: var(--sl-border-radius-medium);
    }

    .success {
      background-color: var(--sl-color-success-50);
      color: var(--success);
    }

    .warning {
      background-color: var(--sl-color-warning-50);
      color: var(--warning);
    }

    .danger {
      background-color: var(--sl-color-danger-50);
      color: var(--danger);
    }

    .info {
      background-color: var(--sl-color-sky-50);
      color: var(--sl-color-sky-600);
    }
  `;

  render() {
    return html`
      <div class="${this.variant}" role="alert">
        <slot></slot>
      </div>
    `;
  }
}
