import { localized, msg, str } from "@lit/localize";
import type { SlInput, SlMenuItem } from "@shoelace-style/shoelace";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";
import queryString from "query-string";

import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import type { Collection } from "@/types/collection";
import type { UnderlyingFunction } from "@/types/utils";
import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";

const INITIAL_PAGE_SIZE = 10;
const MIN_SEARCH_LENGTH = 2;

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
@customElement("btrix-collections-add")
export class CollectionsAdd extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: Array })
  initialCollections?: string[];

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  configId?: string;

  @property({ type: String })
  label?: string;

  /* Text to show on collection empty state */
  @property({ type: String })
  emptyText?: string;

  @state()
  private collectionsData: { [id: string]: Collection } = {};

  @state()
  private collectionIds: string[] = [];

  @state()
  private searchByValue = "";

  @state()
  private searchResults: Collection[] = [];

  private get hasSearchStr() {
    return this.searchByValue.length >= MIN_SEARCH_LENGTH;
  }

  @state()
  private searchResultsOpen = false;

  connectedCallback() {
    if (this.initialCollections) {
      this.collectionIds = this.initialCollections;
    }
    super.connectedCallback();
    void this.initializeCollectionsFromIds();
  }

  disconnectedCallback() {
    this.onSearchInput.cancel();
    super.disconnectedCallback();
  }

  render() {
    return html`<div>
      <label class="form-label">
        ${this.label || msg("Collection Auto-Add")}
      </label>
      <div class="mb-2 rounded-lg border bg-neutral-50 p-2">
        ${this.renderSearch()}
      </div>

      ${when(this.collectionIds, () =>
        this.collectionIds.length
          ? html`
              <div class="mb-2">
                <ul class="contents">
                  ${this.collectionIds.map(this.renderCollectionItem, this)}
                </ul>
              </div>
            `
          : this.emptyText
            ? html`
                <div class="mb-2">
                  <p class="text-center text-0-500">${this.emptyText}</p>
                </div>
              `
            : "",
      )}
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
        @sl-select=${async (e: CustomEvent<{ item: SlMenuItem }>) => {
          this.searchResultsOpen = false;
          const item = e.detail.item;
          const collId = item.dataset["key"];
          if (collId && this.collectionIds.indexOf(collId) === -1) {
            const coll = this.searchResults.find(
              (collection) => collection.id === collId,
            );
            if (coll) {
              const { id } = coll;
              if (!(this.collectionsData[id] as Collection | undefined)) {
                this.collectionsData = {
                  ...this.collectionsData,
                  [id]: (await this.getCollection(id))!,
                };
              }
              this.collectionIds = [...this.collectionIds, id];
              void this.dispatchChange();
            }
          }
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
          @sl-input=${this.onSearchInput as UnderlyingFunction<
            typeof this.onSearchInput
          >}
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

    // Filter out stale search results from last debounce invocation
    const searchResults = this.searchResults.filter((res) =>
      new RegExp(`^${this.searchByValue}`, "i").test(res.name),
    );

    if (!searchResults.length) {
      return html`
        <sl-menu-item slot="menu-item" disabled
          >${msg("No matching Collections found.")}</sl-menu-item
        >
      `;
    }

    return html`
      ${searchResults.map((item: Collection) => {
        return html`
          <sl-menu-item class="w-full" slot="menu-item" data-key=${item.id}>
            <div class="flex w-full items-center gap-2">
              <div class="grow justify-self-stretch truncate">${item.name}</div>
              <div
                class="font-monostyle flex-auto text-right text-xs text-neutral-500"
              >
                ${msg(str`${item.crawlCount} items`)}
              </div>
            </div>
          </sl-menu-item>
        `;
      })}
    `;
  }

  private renderCollectionItem(id: string) {
    const collection = this.collectionsData[id] as Collection | undefined;
    return html`<li class="mt-1 rounded-sm border p-1 pl-3">
      <div
        class="${collection
          ? "opacity-100"
          : "opacity-0"} flex flex-row items-center justify-between gap-2 transition-opacity delay-75"
      >
        <div class="grow justify-self-stretch truncate">
          ${collection?.name}
        </div>
        <div class="font-monostyle text-right text-xs text-neutral-500">
          ${msg(str`${collection?.crawlCount || 0} items`)}
        </div>
        <sl-icon-button
          name="x-lg"
          data-key=${id}
          ?disabled=${!collection}
          @click=${this.removeCollection}
        >
        </sl-icon-button>
      </div>
    </li>`;
  }

  private removeCollection(event: Event) {
    const target = event.currentTarget as HTMLElement;
    const collectionId = target.getAttribute("data-key");
    if (collectionId) {
      const collIdIndex = this.collectionIds.indexOf(collectionId);
      if (collIdIndex > -1) {
        this.collectionIds = [
          ...this.collectionIds.slice(0, collIdIndex),
          ...this.collectionIds.slice(collIdIndex + 1),
        ];
        void this.dispatchChange();
      }
    }
  }

  private readonly onSearchInput = debounce(200)(async (e: Event) => {
    this.searchByValue = (e.target as SlInput).value.trim();

    if (!this.searchResultsOpen && this.hasSearchStr) {
      this.searchResultsOpen = true;
    }

    const data = await this.fetchCollectionsByPrefix(this.searchByValue);
    let searchResults: Collection[] = [];
    if (data?.items.length) {
      searchResults = this.filterOutSelectedCollections(data.items);
    }
    this.searchResults = searchResults;
  });

  private filterOutSelectedCollections(results: Collection[]) {
    return results.filter((result) => {
      return !this.collectionIds.some((id) => id === result.id);
    });
  }

  private async fetchCollectionsByPrefix(namePrefix: string) {
    try {
      const results = await this.getCollections({
        oid: this.orgId,
        namePrefix: namePrefix,
        sortBy: "name",
        pageSize: INITIAL_PAGE_SIZE,
      });
      return results;
    } catch {
      this.notify({
        message: msg("Sorry, couldn't retrieve Collections at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCollections(
    params?: Partial<{
      oid?: string;
      namePrefix?: string;
    }> &
      APIPaginationQuery &
      APISortQuery,
  ) {
    const query = queryString.stringify(params || {}, {
      arrayFormat: "comma",
    });
    const data = await this.apiFetch<APIPaginatedList<Collection>>(
      `/orgs/${this.orgId}/collections?${query}`,
      this.authState!,
    );

    return data;
  }

  private async initializeCollectionsFromIds() {
    this.collectionIds.forEach(async (id) => {
      const data = await this.getCollection(id);
      if (data) {
        this.collectionsData = {
          ...this.collectionsData,
          [id]: data,
        };
      }
    });
  }

  private readonly getCollection = async (
    collId: string,
  ): Promise<Collection | undefined> => {
    return this.apiFetch(
      `/orgs/${this.orgId}/collections/${collId}`,
      this.authState!,
    );
  };

  private async dispatchChange() {
    await this.updateComplete;
    this.dispatchEvent(
      new CustomEvent("collections-change", {
        detail: { collections: this.collectionIds },
      }) as CollectionsChangeEvent,
    );
  }
}
