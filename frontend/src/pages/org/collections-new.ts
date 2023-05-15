import type { PropertyValueMap, TemplateResult } from "lit";
import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";

import type { Crawl } from "./types";

const STEPS = ["crawls", "metadata"] as const;
type Tab = (typeof STEPS)[number];
type Collection = {
  name: string;
  description: string;
  crawlIds: string[];
};

@localized()
export class CollectionsNew extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @state()
  private collection?: Collection;

  @state()
  private crawlsToAdd: Crawl[] = [];

  @state()
  private activeTab: Tab = STEPS[0];

  private readonly tabLabels: Record<Tab, string> = {
    crawls: msg("Select Crawls"),
    metadata: msg("Information"),
  };

  protected async willUpdate(changedProperties: Map<string, any>) {}

  render() {
    return html`${this.renderHeader()}
      <h2 class="text-xl font-semibold mb-6">${msg("New Collection")}</h2>
      ${this.renderEditor()}`;
  }

  private renderHeader = () => html`
    <nav class="mb-5">
      <a
        class="text-gray-600 hover:text-gray-800 text-sm font-medium"
        href=${`/orgs/${this.orgId}/collections`}
        @click=${this.navLink}
      >
        <sl-icon name="arrow-left" class="inline-block align-middle"></sl-icon>
        <span class="inline-block align-middle"
          >${msg("Back to Collections")}</span
        >
      </a>
    </nav>
  `;

  private renderEditor() {
    return html`<btrix-tab-list
      activePanel="newCollection-${this.activeTab}"
      progressPanel="newCollection-${this.activeTab}"
    >
      <h3 slot="header" class="font-semibold">
        ${this.tabLabels[this.activeTab]}
      </h3>

      ${STEPS.map(this.renderTab)}

      <btrix-tab-panel name="newCollection-crawls">
        ${this.renderCrawls()}
      </btrix-tab-panel>
      <btrix-tab-panel name="newCollection-metadata">
        ${this.renderMetadata()}
      </btrix-tab-panel>
    </btrix-tab-list>`;
  }

  private renderTab = (tab: Tab) => {
    const isActive = tab === this.activeTab;
    const completed = false; // TODO
    const iconProps = {
      name: "circle",
      library: "default",
      class: "text-neutral-400",
    };
    if (isActive) {
      iconProps.name = "pencil-circle-dashed";
      iconProps.library = "app";
      iconProps.class = "text-base";
    } else if (completed) {
      iconProps.name = "check-circle";
    }
    return html`
      <btrix-tab
        slot="nav"
        name="newCollection-${tab}"
        class="whitespace-nowrap"
        @click=${() => {
          this.activeTab = tab;
        }}
      >
        <sl-icon
          name=${iconProps.name}
          library=${iconProps.library}
          class="inline-block align-middle mr-1 text-base ${iconProps.class}"
        ></sl-icon>
        <span class="inline-block align-middle whitespace-normal">
          ${this.tabLabels[tab]}
        </span>
      </btrix-tab>
    `;
  };

  private renderCrawls() {
    return html`
      <section class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <section class="col-span-1 flex flex-col">
          <h4 class="text-base font-semibold mb-3">
            ${msg("Crawls in Collection")}
          </h4>
          <div class="border rounded-lg p-6 flex-1">
            ${this.renderCrawlsInCollection()}
          </div>
        </section>
        <section class="col-span-1 flex flex-col">
          <h4 class="text-base font-semibold mb-3">
            ${msg("Finished Crawls")}
          </h4>
          <div class="border rounded-lg p-6 flex-1">
            ${this.renderCrawlsNotInCollection()}
          </div>
        </section>
        <footer
          class="col-span-2 border rounded-lg px-6 py-4 flex justify-between"
        >
          <sl-button variant="primary" size="small" class="ml-auto">
            <sl-icon slot="suffix" name="chevron-right"></sl-icon>
            ${msg("Next Step")}
          </sl-button>
        </footer>
      </section>
    `;
  }

  private renderMetadata() {
    return html`
      <section class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <section class="col-span-1 flex flex-col">
          <h4 class="text-base font-semibold mb-3">${msg("Metadata")}</h4>
          <div class="border rounded-lg p-6 flex-1">
            <sl-input
              class="mb-4"
              name="collectionName"
              label=${msg("Name")}
              autocomplete="off"
              placeholder=${msg("My Collection")}
              required
            ></sl-input>
            <sl-textarea
              name="collectionDescription"
              label=${msg("Description Preview")}
              autocomplete="off"
            ></sl-textarea>
          </div>
        </section>
        <section class="col-span-1 flex flex-col">
          <h4 class="text-base font-semibold mb-3">${msg("Preview")}</h4>
          <div class="border rounded-lg p-6 flex-1">
            <btrix-markdown-viewer></btrix-markdown-viewer>
          </div>
        </section>
        <footer
          class="col-span-2 border rounded-lg px-6 py-4 flex justify-between"
        >
          <sl-button size="small">
            <sl-icon slot="prefix" name="chevron-left"></sl-icon>
            ${msg("Previous Step")}
          </sl-button>
          <sl-button variant="primary" size="small">
            ${msg("Save New Collection")}
          </sl-button>
        </footer>
      </section>
    `;
  }

  private renderCrawlsInCollection() {
    if (!this.crawlsToAdd.length) {
      return html`
        <div>
          <span class="text-base font-semibold"
            >${msg("Add Crawls to this Collection")}</span
          >
          <p>
            ${msg(
              "Select finished crawls to include them in this collection. You can always come back and add them later."
            )}
          </p>
        </div>
      `;
    }
    return html``;
  }

  private renderCrawlsNotInCollection() {
    return html``;
  }
}
customElements.define("btrix-collections-new", CollectionsNew);
