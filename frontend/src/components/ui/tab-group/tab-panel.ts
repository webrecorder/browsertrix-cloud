import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";

/**
 * TODO consolidate with btrix-tab-list btrix-tab-panel
 */
@customElement("btrix-tab-group-panel")
export class TabGroupPanel extends TailwindElement {
  @property({ type: String })
  name = "";

  @property({ type: Boolean })
  active = false;

  render() {
    return html`
      <div
        id="${this.name}--panel"
        class="${this.active ? "" : "offscreen"}"
        role="tabpanel"
        aria-labelledby="${this.name}--tab"
        aria-hidden="${!this.active}"
      >
        <slot></slot>
      </div>
    `;
  }
}
