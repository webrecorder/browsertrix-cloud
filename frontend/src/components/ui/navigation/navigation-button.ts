/* eslint-disable lit/binding-positions */
/* eslint-disable lit/no-invalid-html */
import { css, type PropertyValueMap } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { html, literal } from "lit/static-html.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

/**
 * Custom styled button with active state
 *
 * Usage example:
 * ```ts
 * <btrix-navigation-button>Click me</btrix-navigation-button>
 * ```
 *
 * @exportparts button
 */
@customElement("btrix-navigation-button")
export class NavigationButton extends TailwindElement {
  @property({ type: Boolean })
  active = false;

  @property({ type: String })
  type: "submit" | "button" = "button";

  @property({ type: String })
  label?: string;

  @property({ type: String })
  href?: string;

  @property({ type: Boolean })
  disabled = false;

  @property({ type: Boolean })
  icon = false;

  @property({ type: String, reflect: true })
  role: ARIAMixin["role"] = null;

  @property({ type: String })
  size: "small" | "medium" | "large" = "medium";

  @property({ type: String })
  align: "left" | "center" | "right" = "left";

  connectedCallback(): void {
    if (!this.role && !this.href) {
      this.role = "tab";
    }
    super.connectedCallback();
  }

  protected willUpdate(changedProperties: PropertyValueMap<this>) {
    if (changedProperties.has("active")) {
      this.ariaSelected = this.active ? "true" : null;
    }
  }

  static styles = css`
    :host {
      display: inline-block;
    }

    ::slotted(sl-icon) {
      display: block;
      font-size: 1rem;
    }
  `;

  render() {
    const tag = this.href ? literal`a` : literal`button`;
    return html`<${tag}
      type=${this.type === "submit" ? "submit" : "button"}
      part="button"
      class=${[
        tw`flex w-full cursor-pointer items-center gap-2 rounded font-medium leading-[16px] outline-primary-600 transition hover:transition-none focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:bg-transparent disabled:opacity-50`,
        this.icon ? tw`min-h-6 min-w-6` : tw``,
        {
          small: this.icon ? tw`min-h-6 p-0` : tw`min-h-6 px-2 py-0`,
          medium: tw`p-2`,
          large: tw`px-2 py-4`,
        }[this.size],
        {
          left: "justify-start",
          center: "justify-center",
          right: "justify-end",
        }[this.align],
        this.active
          ? tw`bg-blue-100 text-blue-600 shadow-sm shadow-blue-900/20 hover:bg-blue-100`
          : tw`text-neutral-600 hover:bg-blue-50`,
      ]
        .filter(Boolean)
        .join(" ")}
      ?disabled=${this.disabled}
      href=${ifDefined(this.href)}
      aria-label=${ifDefined(this.label)}
      @click=${this.handleClick}
      
    >
      <slot></slot>
    </${tag}>`;
  }

  private handleClick(e: MouseEvent) {
    if (this.disabled) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (this.type === "submit") {
      this.closest("form")?.submit();
    }
  }
}
