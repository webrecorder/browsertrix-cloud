import { css } from "lit";
import SlDialog from "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import dialogStyles from "@shoelace-style/shoelace/dist/components/dialog/dialog.styles.js";
import { customElement } from "lit/decorators.js";

/**
 * <sl-dialog> with custom CSS
 *
 * Usage: see https://shoelace.style/components/dialog
 */
@customElement("btrix-dialog")
export class Dialog extends SlDialog {
  static styles = [
    dialogStyles,
    css`
      .dialog__panel {
        overflow: hidden;
      }

      .dialog__header {
        background-color: var(--sl-color-neutral-50);
        border-bottom: 1px solid var(--sl-color-neutral-100);
      }

      .dialog__title {
        padding-top: calc(var(--sl-spacing-small) + 0.2rem);
        padding-bottom: var(--sl-spacing-small);
        font-size: var(--font-size-base);
        font-weight: var(--sl-font-weight-medium);
        line-height: 1;
      }

      .dialog__close {
        --header-spacing: var(--sl-spacing-x-small);
      }

      .dialog__body {
        line-height: var(--sl-line-height-normal);
      }

      .dialog__footer {
        padding-top: var(--sl-spacing-small);
        padding-bottom: var(--sl-spacing-small);
        border-top: 1px solid var(--sl-color-neutral-100);
      }
    `,
  ];
}
