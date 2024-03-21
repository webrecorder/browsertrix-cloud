import type { SlMenu, SlMenuItem, SlPopup } from "@shoelace-style/shoelace";
import { css, html, LitElement, type PropertyValues } from "lit";
import {
  customElement,
  property,
  query,
  queryAssignedElements,
  state,
} from "lit/decorators.js";

import { dropdown } from "@/utils/css";

/**
 * Input that opens a popup of autocomplete options
 *
 * Usage:
 * ```ts
 * ```
 *
 * @event request-close
 */
@customElement("btrix-combobox")
export class Combobox extends LitElement {
  static styles = [
    dropdown,
    css`
      :host {
        position: relative;
        z-index: 2;
      }
    `,
  ];

  @property({ type: Boolean })
  open = false;

  @state()
  isActive = true;

  @query("#dropdown")
  private readonly dropdown?: HTMLDivElement;

  @query("sl-menu")
  private readonly menu?: SlMenu;

  @query("sl-popup")
  private readonly combobox?: SlPopup;

  @queryAssignedElements({
    flatten: true,
  })
  private readonly anchor?: HTMLElement[];

  @queryAssignedElements({
    slot: "menu-item",
    selector: "sl-menu-item:not([disabled])",
  })
  private readonly menuItems?: SlMenuItem[];

  protected willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("open")) {
      if (this.open) {
        void this.openDropdown();
      } else {
        this.closeDropdown();
      }
    }
  }

  render() {
    return html`
      <sl-popup
        placement="bottom-start"
        shift
        strategy="fixed"
        ?active=${this.isActive}
        @keydown=${this.onKeydown}
        @keyup=${this.onKeyup}
        @focusout=${this.onFocusout}
      >
        <div slot="anchor">
          <slot></slot>
        </div>
        <div
          id="dropdown"
          class="dropdown hidden"
          @animationend=${(e: AnimationEvent) => {
            const el = e.target as HTMLDivElement;
            if (e.animationName === "dropdownShow") {
              el.classList.remove("animateShow");
            }
            if (e.animationName === "dropdownHide") {
              el.classList.add("hidden");
              el.classList.remove("animateHide");
              this.isActive = false;
            }
          }}
        >
          <sl-menu role="listbox">
            <slot name="menu-item"></slot>
          </sl-menu>
        </div>
      </sl-popup>
    `;
  }

  private async onFocusout(e: FocusEvent) {
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!this.open) {
      return;
    }

    if (
      !relatedTarget ||
      (!this.anchor?.some((item) => item === relatedTarget) &&
        !this.menuItems?.some((item) => item === relatedTarget))
    ) {
      await this.updateComplete;
      this.dispatchEvent(new CustomEvent("request-close"));
    }
  }

  private onKeydown(e: KeyboardEvent) {
    if (this.open && e.key === "ArrowDown") {
      if (this.menu && this.menuItems?.length && !this.menu.getCurrentItem()) {
        // Focus on first menu item
        e.preventDefault();
        const menuItem = this.menuItems[0];
        this.menu.setCurrentItem(menuItem);
        menuItem.focus();
      }
    }
  }

  private async onKeyup(e: KeyboardEvent) {
    if (this.open && e.key === "Escape") {
      await this.updateComplete;
      this.dispatchEvent(new CustomEvent("request-close"));
    }
  }

  private async openDropdown() {
    this.isActive = true;
    await this.combobox?.updateComplete;

    // Manually sync dropdown width instead of using `sync="width"`
    // to get around ResizeObserver loop error
    if (this.anchor?.length && this.dropdown) {
      const anchorWidth = this.anchor[0].clientWidth;
      if (anchorWidth) {
        this.dropdown.style.width = `${anchorWidth}px`;
      }
    }

    this.dropdown?.classList.add("animateShow");
    this.dropdown?.classList.remove("hidden");
  }

  private closeDropdown() {
    this.dropdown?.classList.add("animateHide");
  }
}
