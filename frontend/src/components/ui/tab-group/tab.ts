import { type PropertyValueMap } from "lit";
import { customElement, property, query } from "lit/decorators.js";

import "@/components/ui/navigation/navigation-button";

import { NavigationButton } from "@/components/ui/navigation/navigation-button";

export type TabClickDetail = { panel: string };

/**
 * TODO consolidate with btrix-tab-list btrix-tab
 *
 * @fires btrix-select-tab
 */
@customElement("btrix-tab-group-tab")
export class TabGroupTab extends NavigationButton {
  @property({ type: String, reflect: false })
  panel = "";

  @property({ type: Boolean, reflect: true })
  active = false;

  @property({ type: String, noAccessor: true, reflect: true })
  role = "tab";

  @query("[part='button']")
  button?: HTMLElement | null;

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener("click", this.onClick);
    this.addEventListener("keydown", this.onKeyDown);
  }

  disconnectedCallback(): void {
    this.removeEventListener("click", this.onClick);
    this.removeEventListener("keydown", this.onKeyDown);
    super.disconnectedCallback();
  }

  protected willUpdate(changedProperties: PropertyValueMap<this>): void {
    if (changedProperties.has("panel") && this.panel) {
      this.setAttribute("id", `${this.panel}--tab`);
      this.setAttribute("aria-controls", `${this.panel}--panel`);
    }
  }

  private onClick() {
    this.dispatchSelect();
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !this.active) {
      this.dispatchSelect();
    }
  }

  private dispatchSelect() {
    this.dispatchEvent(
      new CustomEvent<TabClickDetail>("btrix-select-tab", {
        detail: { panel: this.panel },
        composed: true,
        bubbles: true,
      }),
    );
  }
}
