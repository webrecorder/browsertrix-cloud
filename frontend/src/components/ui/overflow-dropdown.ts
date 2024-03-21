import { localized, msg } from "@lit/localize";
import type { SlDropdown, SlMenu } from "@shoelace-style/shoelace";
import { css, html, LitElement } from "lit";
import {
  customElement,
  query,
  queryAssignedElements,
  state,
} from "lit/decorators.js";

/**
 * Dropdown for additional actions.
 *
 * Usage:
 * ```ts
 * <btrix-overflow-dropdown>
 *   <sl-menu>
 *     <sl-menu-item>Item 1</sl-menu-item>
 *     <sl-menu-item>Item 2</sl-menu-item>
 *   </sl-menu>
 *< /btrix-overflow-dropdown>
 * ```
 */
@localized()
@customElement("btrix-overflow-dropdown")
export class OverflowDropdown extends LitElement {
  static style = [
    css`
      .trigger {
        font-size: 1rem;
      }

      .trigger[disabled] {
        visibility: hidden;
      }
    `,
  ];

  @state()
  private hasMenuItems?: boolean;

  @query("sl-dropdown")
  private readonly dropdown?: SlDropdown;

  @queryAssignedElements({ selector: "sl-menu", flatten: true })
  private readonly menu!: SlMenu[];

  render() {
    return html`
      <sl-dropdown ?disabled=${!this.hasMenuItems} hoist>
        <sl-icon-button
          slot="trigger"
          class="trigger"
          label=${msg("Actions")}
          name="three-dots-vertical"
          ?disabled=${!this.hasMenuItems}
        >
        </sl-icon-button>
        <slot
          @slotchange=${() => (this.hasMenuItems = this.menu.length > 0)}
        ></slot>
      </sl-dropdown>
    `;
  }

  hide() {
    void this.dropdown?.hide();
  }
}
