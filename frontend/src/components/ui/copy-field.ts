import { localized } from "@lit/localize";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";

import { TailwindElement } from "@/classes/TailwindElement";

/**
 * Copy text to clipboard on click
 *
 * @example
 * ```ts
 * <btrix-copy-field label="my field" value=${value}></btrix-copy-field>
 * ```
 */
@localized()
@customElement("btrix-copy-field")
export class CopyField extends TailwindElement {
  @property({ type: String })
  value?: string;

  @property({ type: Boolean })
  hideContentFromScreenReaders = false;

  @property({ type: String })
  buttonIconName?: string;

  @property({ type: String })
  buttonContent?: string;

  @property({ attribute: false })
  getValue?: () => string | undefined;

  @property({ type: Boolean })
  hoist = false;

  @property({ type: Boolean })
  monostyle = true;

  @property({ type: Boolean })
  filled = this.monostyle;

  @property()
  label?: string;

  static styles = css`
    :host {
      display: block;
    }
  `;

  get _slottedChildren() {
    const slot = this.shadowRoot?.querySelector("slot[name=label]");
    return (slot as HTMLSlotElement | null | undefined)?.assignedElements();
  }

  render() {
    return html`
      <div role="group">
        <label
          class="${classMap({
            hidden: !this.label && !this._slottedChildren,
          })} mb-1.5 inline-block font-sans text-xs leading-[1.4] text-neutral-800"
          ><slot name="label">${this.label}</slot></label
        >
        <div
          class="${classMap({
            "bg-slate-50": this.filled,
            "font-monostyle": this.monostyle,
          })} relative inline-flex w-full items-stretch justify-start rounded border"
        >
          <slot name="prefix"></slot>
          <span
            aria-hidden=${this.hideContentFromScreenReaders}
            class="mx-1.5 flex-auto select-all self-center overflow-x-auto whitespace-nowrap px-1.5 text-neutral-700"
          >
            ${this.value}
          </span>
          <btrix-copy-button
            .value=${this.value}
            .name=${this.buttonIconName}
            .content=${this.buttonContent}
            .getValue=${this.getValue}
            .hoist=${this.hoist}
          ></btrix-copy-button>
        </div>
      </div>
    `;
  }
}
