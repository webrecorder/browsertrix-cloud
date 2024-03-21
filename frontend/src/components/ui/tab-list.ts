import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, queryAsync } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { TailwindElement } from "@/classes/TailwindElement";

const DEFAULT_PANEL_ID = "default-panel";
// postcss-lit-disable-next-line
export const TWO_COL_SCREEN_MIN_CSS = css`64.5rem`;

/**
 * Tab list
 *
 * Usage example:
 * ```ts
 * <btrix-tab-list activePanel="one">
 *   <btrix-tab slot="nav" name="one">One</btrix-tab>
 *   <btrix-tab slot="nav" name="two">Two</btrix-tab>
 * </btrix-tab-list>
 *
 * <btrix-tab-panel name="one">Tab one content</btrix-tab-panel>
 * <btrix-tab-panel name="two">Tab two content</btrix-tab-panel>
 * ```
 */

@customElement("btrix-tab-panel")
export class TabPanel extends TailwindElement {
  @property({ type: String })
  name?: string;

  @property({ type: Boolean })
  active = false;

  render() {
    return html`
      <div
        class="flex-auto aria-hidden:hidden"
        role="tabpanel"
        id=${ifDefined(this.name)}
        aria-hidden=${!this.active}
      >
        <slot></slot>
      </div>
    `;
  }
}

@customElement("btrix-tab")
export class Tab extends TailwindElement {
  // ID of panel the tab labels/controls
  @property({ type: String })
  name?: string;

  @property({ type: Boolean })
  active = false;

  @property({ type: Boolean })
  disabled = false;

  render() {
    return html`
      <li
        class="cursor-pointer px-3 py-4 font-semibold leading-tight text-neutral-500 transition-colors duration-fast aria-disabled:cursor-default aria-selected:text-blue-600"
        role="tab"
        aria-selected=${this.active}
        aria-controls=${ifDefined(this.name)}
        aria-disabled=${ifDefined(this.disabled)}
        tabindex=${this.disabled ? "-1" : "0"}
      >
        <slot></slot>
      </li>
    `;
  }
}

type TabElement = Tab & HTMLElement;
type TabPanelElement = TabPanel & HTMLElement;

@customElement("btrix-tab-list")
export class TabList extends LitElement {
  static styles = css`
    :host {
      --track-width: 4px;
    }

    .container {
      display: grid;
      grid-template-areas:
        "menu"
        "header"
        "main";
      grid-template-columns: 1fr;
      grid-gap: 1.5rem;
    }

    @media only screen and (min-width: ${TWO_COL_SCREEN_MIN_CSS}) {
      .container {
        grid-template-areas:
          ". header"
          "menu main";
        grid-template-columns: 16.5rem 1fr;
      }
    }

    .navWrapper {
      grid-area: menu;
    }

    @media only screen and (min-width: ${TWO_COL_SCREEN_MIN_CSS}) {
      .navWrapper {
        overflow: initial;
      }
    }

    .header {
      grid-area: header;
      font-size: var(--sl-font-size-large);
      font-weight: 500;
      line-height: 1;
    }

    .content {
      grid-area: main;
    }

    .nav {
      position: relative;
      position: -webkit-sticky;
      position: sticky;
      top: var(--sl-spacing-medium);
    }

    .tablist {
      display: flex;
      margin: 0;
      list-style: none;
      padding: 0;
      gap: 0.5rem;
    }

    .show-indicator .tablist {
      margin-left: var(--track-width);
    }

    @media only screen and (min-width: ${TWO_COL_SCREEN_MIN_CSS}) {
      .tablist {
        flex-direction: column;
      }
    }

    .track {
      display: none;
      position: absolute;
      top: 0;
      height: 100%;
      width: var(--track-width);
      border-radius: var(--track-width);
      background-color: var(--sl-color-neutral-100);
      box-shadow: inset 0 0 2px var(--sl-color-neutral-300);
    }

    .indicator {
      display: none;
      position: absolute;
      width: var(--track-width);
      border-radius: var(--track-width);
      background-color: var(--sl-color-blue-500);
    }

    @media only screen and (min-width: ${TWO_COL_SCREEN_MIN_CSS}) {
      .show-indicator .track,
      .show-indicator .indicator {
        display: block;
      }
    }
  `;

  // ID of visible panel
  @property({ type: String })
  activePanel: string = DEFAULT_PANEL_ID;

  // If panels are linear, the current panel in progress
  @property({ type: String })
  progressPanel?: string;

  @property({ type: Boolean })
  hideIndicator = false;

  @queryAsync(".track")
  private readonly trackElem!: HTMLElement;

  @queryAsync(".indicator")
  private readonly indicatorElem!: HTMLElement;

  updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("activePanel") && this.activePanel) {
      this.onActiveChange(!changedProperties.get("activePanel"));
    }
    if (changedProperties.has("progressPanel") && this.progressPanel) {
      this.onProgressChange(!changedProperties.get("progressPanel"));
    }
  }

  private async repositionIndicator(activeTab?: TabElement, animate = true) {
    if (!activeTab || this.hideIndicator) return;

    const trackElem = await this.trackElem;
    const indicatorElem = await this.indicatorElem;
    const { top: tabTop, height: tabHeight } =
      activeTab.getBoundingClientRect();
    const top = tabTop - trackElem.getBoundingClientRect().top;

    if (animate) {
      indicatorElem.style.transition =
        "var(--sl-transition-fast) transform ease, var(--sl-transition-fast) height ease";
    } else {
      indicatorElem.style.transition = "";
    }

    if (this.progressPanel) {
      indicatorElem.style.height = `${top + tabHeight}px`;
    } else {
      indicatorElem.style.height = `${tabHeight}px`;
      indicatorElem.style.transform = `translateY(${top}px)`;
    }
  }

  render() {
    return html`
      <div class="container">
        <div class="navWrapper">${this.renderNav()}</div>
        <div class="header"><slot name="header"></slot></div>
        <div class="content">
          <slot></slot>
        </div>
      </div>
    `;
  }

  renderNav() {
    return html`
      <sl-resize-observer
        @sl-resize=${async () =>
          this.repositionIndicator(this.getTab(this.progressPanel))}
      >
        <div
          class="nav ${this.progressPanel ? "linear" : "nonlinear"} ${this
            .hideIndicator
            ? "hide-indicator"
            : "show-indicator"}"
        >
          <div class="track" role="presentation">
            <div class="indicator" role="presentation"></div>
          </div>

          <ul class="tablist" role="tablist">
            <slot name="nav"></slot>
          </ul>
        </div>
      </sl-resize-observer>
    `;
  }

  private getPanels(): TabPanelElement[] {
    const slotElems = this.renderRoot
      .querySelector<HTMLSlotElement>(".content slot:not([name])")!
      .assignedElements();
    return ([...slotElems] as TabPanelElement[]).filter(
      (el) => el.tagName.toLowerCase() === "btrix-tab-panel",
    );
  }

  private getTabs(): TabElement[] {
    const slotElems = this.renderRoot
      .querySelector<HTMLSlotElement>("slot[name='nav']")!
      .assignedElements();
    return ([...slotElems] as TabElement[]).filter(
      (el) => el.tagName.toLowerCase() === "btrix-tab",
    );
  }

  private getTab(tabName?: string): TabElement | undefined {
    if (!tabName) return;
    const tabs = this.getTabs();
    return tabs.find(({ name }) => name === tabName);
  }

  private onProgressChange(isFirstChange: boolean) {
    const progressTab = this.getTabs().find(
      (el) => el.name === this.progressPanel,
    );
    if (progressTab) {
      void this.repositionIndicator(progressTab, !isFirstChange);
    }
  }

  private onActiveChange(isFirstChange: boolean) {
    this.getTabs().forEach((tab) => {
      if (tab.name === this.activePanel) {
        tab.active = true;

        if (!this.progressPanel) {
          void this.repositionIndicator(tab, !isFirstChange);
        }
      } else {
        tab.active = false;
      }
    });
    this.getPanels().forEach((panel) => {
      panel.active = panel.name === this.activePanel;
      if (panel.active) {
        panel.style.display = "flex";
        panel.setAttribute("aria-hidden", "false");
      } else {
        panel.style.display = "none";
        panel.setAttribute("aria-hidden", "true");
      }
    });
  }
}
