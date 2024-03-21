import SlDialog from "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import dialogStyles from "@shoelace-style/shoelace/dist/components/dialog/dialog.styles.js";
import { css } from "lit";
import { customElement, queryAssignedElements } from "lit/decorators.js";

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
      :host {
        --header-spacing: var(--sl-spacing-medium);
        --body-spacing: var(--sl-spacing-medium);
        --footer-spacing: var(--sl-spacing-medium);
      }

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
    // TODO remove this type coercion once we migrate to
    // lit@3 (or more specifically, to when the version of lit we use uses the
    // same version of `@lit/reactive-element` as Shoelace -- at the time of
    // writing, that's `@lit/reactive-element@2.0.2`)
  ] as typeof SlDialog.styles;

  @queryAssignedElements({ selector: "form", flatten: true })
  readonly formElems!: HTMLFormElement[];

  /**
   * Submit form using external buttons to bypass
   * incorrect `getRootNode` in Chrome.
   *
   * TODO refactor dialog instances that self implements `form.requestSubmit`
   */
  submit = () => {
    this.formElems[0]?.requestSubmit();
  };
}
