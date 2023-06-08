import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";
import type { SlMenuItem } from "@shoelace-style/shoelace";
import queryString from "query-string";

import type { AuthState } from "../../utils/AuthService";
import type { Collection, CollectionList } from "../../types/collection";
import LiteElement, { html } from "../../utils/LiteElement";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "../../types/api";

const INITIAL_PAGE_SIZE = 10;
const MIN_SEARCH_LENGTH = 2;

type CollectionSearchResults = APIPaginatedList & {
  items: CollectionList;
};

export type CollectionsChangeEvent = CustomEvent<{
  collections: string[];
}>;

/**
 * Usage:
 * ```ts
 * <btrix-collections-add
 *   .authState=${this.authState}
 *   .initialCollections=${[]}
 *   .orgId=${this.orgId}
 *   .configId=${this.configId}
 *   @collections-change=${console.log}
 * ></btrix-collections-add>
 * ```
 * @events collections-change
 */
@localized()
export class CollectionsAdd extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: Array })
  initialCollections?: string[];

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  configId!: string;

  @state()
  private collections: CollectionList = [];

  @state()
  private collectionIds: string[] = [];

  @state()
  private searchByValue: string = "";

  @state()
  private searchResults: CollectionList = [];

  private get hasSearchStr() {
    return this.searchByValue.length >= MIN_SEARCH_LENGTH;
  }

  @state()
  private searchResultsOpen = false;

  async connectedCallback() {
    if (this.initialCollections) {
      this.collectionIds = this.initialCollections;
    }
    await this.initializeCollectionsFromIds();
    super.connectedCallback();
  }

  render() {
    return html`
      <div class="form-control form-control--has-label">
        <label
          class="form-control__label"
          part="form-control-label"
          for="input"
        >
          <slot name="label">${msg("Collection Auto-Add")}</slot>
        </label>
        <div class="mb-2 mt-2 p-2 bg-neutral-50 border rounded-lg">
          ${this.renderSearch()}
        </div>

        ${when(
          this.collections,
          () =>
            this.collections.length
              ? html`
                  <div class="mb-2">
                    <ul class="contents">
                      ${this.collections.map(this.renderCollectionItem)}
                    </ul>
                  </div>
                `
              : html`
                  <div class="mb-2">
                    <p class="text-center text-0-500">
                      ${msg("Search for a Collection to auto-add crawls")}
                    </p>
                  </div>
                `)}
      </div>`;
  }

  private renderSearch() {
    return html`
      <btrix-combobox
        ?open=${this.searchResultsOpen}
        @request-close=${() => {
          this.searchResultsOpen = false;
          this.searchByValue = "";
        }}
        @sl-select=${async (e: CustomEvent) => {
          this.searchResultsOpen = false;
          const item = e.detail.item as SlMenuItem;
          const collId = item.dataset["key"];
          if (collId && this.collectionIds.indexOf(collId) === -1) {
            const coll = this.searchResults.find(collection => collection.id === collId);
            if (coll) {
              this.collections.push(coll);
              this.collectionIds.push(coll.id);
              await this.dispatchChange();
            }
          }
          await this.updateComplete;
        }}
      >
        <sl-input
          size="small"
          placeholder=${msg("Search by Collection name")}
          clearable
          value=${this.searchByValue}
          @sl-clear=${() => {
            this.searchResultsOpen = false;
            this.onSearchInput.cancel();
          }}
          @sl-input=${this.onSearchInput}
        >
          <sl-icon name="search" slot="prefix"></sl-icon>
        </sl-input>
        ${this.renderSearchResults()}
      </btrix-combobox>
    `;
  }

  private renderSearchResults() {
    if (!this.hasSearchStr) {
      return html`
        <sl-menu-item slot="menu-item" disabled
          >${msg("Start typing to search Collections.")}</sl-menu-item
        >
      `;
    }
    
    if (!this.searchResults.length) {
      return html`
        <sl-menu-item slot="menu-item" disabled
          >${msg("No matching Collections found.")}</sl-menu-item
        >
      `;
    }

    return html`
      ${this.searchResults.map(
        (item: Collection) => {
          return html`
            <sl-menu-item
              slot="menu-item"
              data-key=${item.id}
            >
              ${item.name}
              <span class="float-right font-monostyle text-xs">
                ${msg(str`${item.crawlCount} Crawls`)}
              </span>
            </sl-menu-item>
          `;
        }
      )}
    `;
  }

  private renderCollectionItem(collection: Collection) {
    // TODO: Make X icon functional
    const crawlCountMessage = msg(str`${collection.crawlCount} Crawls`);
    return html`<li class="mt-1 p-2 pl-5 pr-5 border rounded-sm">
        ${collection.name}
        <span class="float-right">
          <span class="text-neutral-500 text-xs font-monostyle">${crawlCountMessage}</span>
          <sl-icon
            class="ml-3"
            name="x-lg"
            @click=${() => {
              // TODO: Implement removal from this.collections and this.collectionIds
              console.log(`Will remove ${collection.id}`);
            }}></sl-icon>
        </span>
      </li>`;
  }

  private onSearchInput = debounce(200)(async (e: any) => {
    this.searchByValue = e.target.value.trim();

    if (this.searchResultsOpen === false && this.hasSearchStr) {
      this.searchResultsOpen = true;
    }

    const data: CollectionSearchResults | undefined = await this.fetchCollectionsByPrefix(this.searchByValue);
    let searchResults: CollectionList = [];
    if (data && data.items.length) {
      searchResults = data.items;
    }
    this.searchResults = searchResults;
  }) as any;

  private async fetchCollectionsByPrefix(namePrefix: string) {
    try {
      const results: CollectionSearchResults = await this.getCollections({
        oid: this.orgId,
        namePrefix: namePrefix,
        sortBy: "name",
        pageSize: INITIAL_PAGE_SIZE,
      });
      return results
    } catch {
      this.notify({
        message: msg(
          "Sorry, couldn't retrieve Collections at this time."
        ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCollections(
    params: Partial<{
      oid?: string;
      namePrefix?: string;
    }> &
      APIPaginationQuery &
      APISortQuery
  ): Promise<APIPaginatedList> {
    const query = queryString.stringify(params || {}, {
      arrayFormat: "comma",
    });
    const data: APIPaginatedList = await this.apiFetch(
      `/orgs/${this.orgId}/collections?${query}`,
      this.authState!
    );

    return data;
  }

  private async initializeCollectionsFromIds() {
    for (let i = 0; i < this.collectionIds?.length; i++) {
      const collId = this.collectionIds[i];
      const data: Collection = await this.apiFetch(
        `/orgs/${this.orgId}/collections/${collId}`,
        this.authState!
      );
      if (data) {
        this.collections.push(data);
      }
    }
  }

  private async dispatchChange() {
    await this.updateComplete;
    this.dispatchEvent(
      <CollectionsChangeEvent>new CustomEvent("collections-change", {
        detail: { collections: this.collectionIds },
      })
    );
  }
}
customElements.define("btrix-collections-add", CollectionsAdd);
