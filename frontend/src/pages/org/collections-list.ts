import { localized, msg, str } from "@lit/localize";
import type { SlInput, SlMenuItem } from "@shoelace-style/shoelace";
import Fuse from "fuse.js";
import { type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { guard } from "lit/directives/guard.js";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";
import queryString from "query-string";

import type { SelectNewDialogEvent } from ".";

import type { OverflowDropdown } from "@/components/ui/overflow-dropdown";
import type { PageChangeEvent } from "@/components/ui/pagination";
import type { CollectionSavedEvent } from "@/features/collections/collection-metadata-dialog";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { Collection, CollectionSearchValues } from "@/types/collection";
import type { UnderlyingFunction } from "@/types/utils";
import { isApiError } from "@/utils/api";
import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";
import noCollectionsImg from "~assets/images/no-collections-found.webp";

type Collections = APIPaginatedList<Collection>;
type SearchFields = "name";
type SearchResult = {
  item: {
    key: SearchFields;
    value: string;
  };
};
type SortField = "modified" | "name" | "totalSize";
type SortDirection = "asc" | "desc";
const INITIAL_PAGE_SIZE = 20;
const sortableFields: Record<
  SortField,
  { label: string; defaultDirection?: SortDirection }
> = {
  modified: {
    label: msg("Last Updated"),
    defaultDirection: "desc",
  },
  name: {
    label: msg("Name"),
    defaultDirection: "asc",
  },
  totalSize: {
    label: msg("Size"),
    defaultDirection: "desc",
  },
};
const MIN_SEARCH_LENGTH = 2;

@localized()
@customElement("btrix-collections-list")
export class CollectionsList extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: Boolean })
  isCrawler?: boolean;

  @state()
  private collections?: Collections;

  @state()
  private orderBy: {
    field: SortField;
    direction: SortDirection;
  } = {
    field: "modified",
    direction: sortableFields["modified"].defaultDirection!,
  };

  @state()
  private filterBy: Partial<Record<keyof Collection, unknown>> = {};

  @state()
  private searchByValue = "";

  @state()
  private searchResultsOpen = false;

  @state()
  private openDialogName?: "create" | "delete" | "editMetadata";

  @state()
  private isDialogVisible = false;

  @state()
  private selectedCollection?: Collection;

  @state()
  private fetchErrorStatusCode?: number;

  // For fuzzy search:
  private readonly fuse = new Fuse<{ key: "name"; value: string }>([], {
    keys: ["value"],
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
  });

  private get hasSearchStr() {
    return this.searchByValue.length >= MIN_SEARCH_LENGTH;
  }

  // TODO localize
  private readonly numberFormatter = new Intl.NumberFormat(undefined, {
    notation: "compact",
  });

  protected async willUpdate(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ) {
    if (changedProperties.has("orgId")) {
      this.collections = undefined;
      void this.fetchSearchValues();
    }
    if (
      changedProperties.has("orgId") ||
      changedProperties.has("filterBy") ||
      changedProperties.has("orderBy")
    ) {
      void this.fetchCollections();
    }
  }

  render() {
    return html`
      <header class="contents">
        <div class="mb-4 flex w-full justify-between">
          <h1 class="text-xl font-semibold leading-8">${msg("Collections")}</h1>
          ${when(
            this.isCrawler,
            () => html`
              <sl-button
                variant="primary"
                size="small"
                @click=${() => (this.openDialogName = "create")}
              >
                <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                ${msg("New Collection")}
              </sl-button>
            `,
          )}
        </div>
      </header>

      <link rel="preload" as="image" href=${noCollectionsImg} />
      ${when(this.fetchErrorStatusCode, this.renderFetchError, () =>
        this.collections
          ? html`
              <div
                class="sticky top-2 z-10 mb-3 rounded-lg border bg-neutral-50 p-4"
              >
                ${this.renderControls()}
              </div>
              <div class="overflow-auto px-2 pb-1">
                ${guard([this.collections], this.renderList)}
              </div>
            `
          : this.renderLoading(),
      )}

      <btrix-dialog
        .label=${msg("Delete Collection?")}
        .open=${this.openDialogName === "delete"}
        @sl-hide=${() => (this.openDialogName = undefined)}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
      >
        ${msg(
          html`Are you sure you want to delete
            <strong>${this.selectedCollection?.name}</strong>?`,
        )}
        <div slot="footer" class="flex justify-between">
          <sl-button
            size="small"
            @click=${() => (this.openDialogName = undefined)}
            >${msg("Cancel")}</sl-button
          >
          <sl-button
            size="small"
            variant="primary"
            @click=${async () => {
              await this.deleteCollection(this.selectedCollection!);
              this.openDialogName = undefined;
            }}
            >${msg("Delete Collection")}</sl-button
          >
        </div>
      </btrix-dialog>
      <btrix-collection-metadata-dialog
        orgId=${this.orgId}
        .authState=${this.authState}
        .collection=${this.openDialogName === "create"
          ? undefined
          : this.selectedCollection}
        ?open=${this.openDialogName === "create" ||
        this.openDialogName === "editMetadata"}
        @sl-hide=${() => (this.openDialogName = undefined)}
        @sl-after-hide=${() => (this.selectedCollection = undefined)}
        @btrix-collection-saved=${(e: CollectionSavedEvent) => {
          if (this.openDialogName === "create") {
            this.navTo(
              `${this.orgBasePath}/collections/view/${e.detail.id}/items`,
            );
          } else {
            void this.fetchCollections();
          }
        }}
      >
      </btrix-collection-metadata-dialog>
    `;
  }

  private readonly renderLoading = () =>
    html`<div class="my-24 flex w-full items-center justify-center text-3xl">
      <sl-spinner></sl-spinner>
    </div>`;

  private readonly renderEmpty = () => html`
    <div
      class="grid grid-cols-[max-content] justify-center justify-items-center gap-3 text-center"
    >
      <figure>
        <div class="aspect-square w-[27rem] max-w-[100vw]">
          <img src=${noCollectionsImg} />
        </div>
        <figcaption class="text-lg font-semibold text-primary">
          ${this.isCrawler
            ? msg("Start building your Collection.")
            : msg("No Collections Found")}
        </figcaption>
      </figure>
      ${when(
        this.isCrawler,
        () => html`
          <p class="max-w-[18em]">
            ${msg(
              "Organize your crawls into a Collection to easily replay them together.",
            )}
          </p>
          <div>
            <sl-button
              variant="primary"
              @click=${() => {
                this.dispatchEvent(
                  new CustomEvent("select-new-dialog", {
                    detail: "collection",
                  }) as SelectNewDialogEvent,
                );
              }}
            >
              <sl-icon slot="prefix" name="plus-lg"></sl-icon>
              ${msg("Create a New Collection")}
            </sl-button>
          </div>
        `,
        () => html`
          <p class="max-w-[18em]">
            ${msg("Your organization doesn't have any Collections, yet.")}
          </p>
        `,
      )}
    </div>
  `;

  private renderControls() {
    return html`
      <div
        class="grid grid-cols-1 items-center gap-x-2 gap-y-2 lg:grid-cols-[minmax(0,100%)_fit-content(100%)]"
      >
        <div class="col-span-1">${this.renderSearch()}</div>
        <div class="col-span-1 flex items-center">
          <div class="mx-2 whitespace-nowrap text-neutral-500">
            ${msg("Sort by:")}
          </div>
          <div class="flex grow">
            <sl-select
              class="flex-1 md:min-w-[9.2rem]"
              size="small"
              pill
              value=${this.orderBy.field}
              @sl-change=${(e: Event) => {
                const field = (e.target as HTMLSelectElement)
                  .value as SortField;
                this.orderBy = {
                  field: field,
                  direction:
                    sortableFields[field].defaultDirection ||
                    this.orderBy.direction,
                };
              }}
            >
              ${Object.entries(sortableFields).map(
                ([value, { label }]) => html`
                  <sl-option value=${value}>${label}</sl-option>
                `,
              )}
            </sl-select>
            <sl-icon-button
              name="arrow-down-up"
              label=${msg("Reverse sort")}
              @click=${() => {
                this.orderBy = {
                  ...this.orderBy,
                  direction: this.orderBy.direction === "asc" ? "desc" : "asc",
                };
              }}
            ></sl-icon-button>
          </div>
        </div>
      </div>
    `;
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
          const key = item.dataset["key"] as SearchFields;
          this.searchByValue = item.value;
          await this.updateComplete;
          this.filterBy = {
            ...this.filterBy,
            [key]: item.value,
          };
        }}
      >
        <sl-input
          size="small"
          placeholder=${msg("Search by Name")}
          clearable
          value=${this.searchByValue}
          @sl-clear=${() => {
            this.searchResultsOpen = false;
            this.onSearchInput.cancel();
            const { name: _, ...otherFilters } = this.filterBy;
            this.filterBy = otherFilters;
          }}
          @sl-input=${this.onSearchInput as UnderlyingFunction<
            typeof this.onSearchInput
          >}
        >
          <sl-icon
            name="search"
            slot="prefix"
            aria-hidden="true"
            library="default"
          ></sl-icon>
        </sl-input>
        ${this.renderSearchResults()}
      </btrix-combobox>
    `;
  }

  private renderSearchResults() {
    if (!this.hasSearchStr) {
      return html`
        <sl-menu-item slot="menu-item" disabled
          >${msg("Start typing to view collection filters.")}</sl-menu-item
        >
      `;
    }

    const searchResults = this.fuse.search(this.searchByValue).slice(0, 10);
    if (!searchResults.length) {
      return html`
        <sl-menu-item slot="menu-item" disabled
          >${msg("No matching collections found.")}</sl-menu-item
        >
      `;
    }

    return html`
      ${searchResults.map(
        ({ item }: SearchResult) => html`
          <sl-menu-item
            slot="menu-item"
            data-key=${item.key}
            value=${item.value}
          >
            ${item.value}
          </sl-menu-item>
        `,
      )}
    `;
  }

  private readonly renderList = () => {
    if (this.collections?.items.length) {
      return html`
        <btrix-table
          style="grid-template-columns: min-content [clickable-start] 60ch repeat(3, 1fr) 12rem [clickable-end] min-content"
        >
          <btrix-table-head class="mb-2">
            <btrix-table-header-cell>
              <span class="sr-only">${msg("Collection Access")}</span>
            </btrix-table-header-cell>
            <btrix-table-header-cell>${msg("Name")}</btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Archived Items")}
            </btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Total Size")}
            </btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Total Pages")}
            </btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Last Updated")}
            </btrix-table-header-cell>
            <btrix-table-header-cell>
              <span class="sr-only">${msg("Row Actions")}</span>
            </btrix-table-header-cell>
          </btrix-table-head>
          <btrix-table-body style="--btrix-row-gap: var(--sl-spacing-x-small)">
            ${this.collections.items.map(this.renderItem)}
          </btrix-table-body>
        </btrix-table>

        ${when(
          this.collections.total > this.collections.pageSize ||
            this.collections.page > 1,
          () => html`
            <footer class="mt-6 flex justify-center">
              <btrix-pagination
                page=${this.collections!.page}
                totalCount=${this.collections!.total}
                size=${this.collections!.pageSize}
                @page-change=${async (e: PageChangeEvent) => {
                  await this.fetchCollections({
                    page: e.detail.page,
                  });

                  // Scroll to top of list
                  // TODO once deep-linking is implemented, scroll to top of pushstate
                  this.scrollIntoView({ behavior: "smooth" });
                }}
              ></btrix-pagination>
            </footer>
          `,
        )}
      `;
    }

    return html`
      <div class="rounded-lg border bg-neutral-50 p-4 text-center">
        <p class="text-center">
          <span class="text-neutral-400">${msg("No Collections Yet.")}</span>
        </p>
        ${when(
          this.isCrawler,
          () => html`
            <p class="p-4 text-center">
              ${msg(
                "Organize your crawls into a Collection to easily replay them together.",
              )}
            </p>
            <div>
              <sl-button
                variant="primary"
                @click=${() => {
                  this.dispatchEvent(
                    new CustomEvent("select-new-dialog", {
                      detail: "collection",
                    }) as SelectNewDialogEvent,
                  );
                }}
              >
                <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                ${msg("Create a New Collection")}
              </sl-button>
            </div>
          `,
          () => html`
            <p class="max-w-[18em] text-center">
              ${msg("Your organization doesn't have any Collections, yet.")}
            </p>
          `,
        )}
      </div>
    `;
  };

  private readonly renderItem = (col: Collection) => html`
    <btrix-table-row
      class="cursor-pointer select-none rounded border shadow transition-all focus-within:bg-neutral-50 hover:bg-neutral-50 hover:shadow-none"
    >
      <btrix-table-cell class="p-3">
        ${col.isPublic
          ? html`
              <sl-tooltip content=${msg("Shareable")}>
                <sl-icon
                  class="inline-block align-middle text-success-600"
                  name="people-fill"
                  label=${msg("Shareable Collection")}
                ></sl-icon>
              </sl-tooltip>
            `
          : html`
              <sl-tooltip content=${msg("Private")}>
                <sl-icon
                  class="inline-block align-middle"
                  name="eye-slash-fill"
                  label=${msg("Private Collection")}
                ></sl-icon>
              </sl-tooltip>
            `}
      </btrix-table-cell>
      <btrix-table-cell rowClickTarget="a">
        <a
          class="block truncate py-2"
          href=${`${this.orgBasePath}/collections/view/${col.id}`}
          @click=${this.navLink}
        >
          ${col.name}
        </a>
      </btrix-table-cell>
      <btrix-table-cell>
        ${col.crawlCount === 1
          ? msg("1 item")
          : msg(str`${this.numberFormatter.format(col.crawlCount)} items`)}
      </btrix-table-cell>
      <btrix-table-cell>
        <sl-format-bytes
          value=${col.totalSize || 0}
          display="narrow"
        ></sl-format-bytes>
      </btrix-table-cell>
      <btrix-table-cell>
        ${col.pageCount === 1
          ? msg("1 page")
          : msg(str`${this.numberFormatter.format(col.pageCount)} pages`)}
      </btrix-table-cell>
      <btrix-table-cell>
        <sl-format-date
          date=${`${col.modified}Z`}
          month="2-digit"
          day="2-digit"
          year="2-digit"
          hour="2-digit"
          minute="2-digit"
        ></sl-format-date>
      </btrix-table-cell>
      <btrix-table-cell class="px-1">
        ${this.isCrawler ? this.renderActions(col) : ""}
      </btrix-table-cell>
    </btrix-table-row>
  `;

  private readonly renderActions = (col: Collection) => {
    const authToken = this.authState!.headers.Authorization.split(" ")[1];

    return html`
      <btrix-overflow-dropdown>
        <sl-menu>
          <sl-menu-item
            @click=${() => void this.manageCollection(col, "editMetadata")}
          >
            <sl-icon name="pencil" slot="prefix"></sl-icon>
            ${msg("Edit Metadata")}
          </sl-menu-item>
          <sl-divider></sl-divider>
          ${!col.isPublic
            ? html`
                <sl-menu-item
                  style="--sl-color-neutral-700: var(--success)"
                  @click=${() => void this.onTogglePublic(col, true)}
                >
                  <sl-icon name="people-fill" slot="prefix"></sl-icon>
                  ${msg("Make Shareable")}
                </sl-menu-item>
              `
            : html`
                <sl-menu-item style="--sl-color-neutral-700: var(--success)">
                  <sl-icon name="box-arrow-up-right" slot="prefix"></sl-icon>
                  <a
                    target="_blank"
                    slot="prefix"
                    href="https://replayweb.page?source=${this.getPublicReplayURL(
                      col,
                    )}"
                  >
                    Visit Shareable URL
                  </a>
                </sl-menu-item>
                <sl-menu-item
                  style="--sl-color-neutral-700: var(--warning)"
                  @click=${() => void this.onTogglePublic(col, false)}
                >
                  <sl-icon name="eye-slash" slot="prefix"></sl-icon>
                  ${msg("Make Private")}
                </sl-menu-item>
              `}
          <!-- Shoelace doesn't allow "href" on menu items,
              see https://github.com/shoelace-style/shoelace/issues/1351 -->
          <a
            href=${`/api/orgs/${this.orgId}/collections/${col.id}/download?auth_bearer=${authToken}`}
            class="flex items-center gap-2 whitespace-nowrap px-6 py-[0.6rem] hover:bg-neutral-100"
            download
            @click=${(e: MouseEvent) => {
              (e.target as HTMLAnchorElement)
                .closest<OverflowDropdown>("btrix-overflow-dropdown")
                ?.hide();
            }}
          >
            <sl-icon name="cloud-download" slot="prefix"></sl-icon>
            ${msg("Download Collection")}
          </a>
          <sl-divider></sl-divider>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${() => void this.manageCollection(col, "delete")}
          >
            <sl-icon name="trash3" slot="prefix"></sl-icon>
            ${msg("Delete Collection")}
          </sl-menu-item>
        </sl-menu>
      </btrix-overflow-dropdown>
    `;
  };

  private readonly renderFetchError = () => html`
    <div>
      <btrix-alert variant="danger">
        ${msg(`Something unexpected went wrong while retrieving Collections.`)}
      </btrix-alert>
    </div>
  `;

  private readonly onSearchInput = debounce(150)((e: Event) => {
    this.searchByValue = (e.target as SlInput).value.trim();

    if (!this.searchResultsOpen && this.hasSearchStr) {
      this.searchResultsOpen = true;
    }

    if (!this.searchByValue) {
      const { name: _, ...otherFilters } = this.filterBy;
      this.filterBy = {
        ...otherFilters,
      };
    }
  });

  private async onTogglePublic(coll: Collection, isPublic: boolean) {
    await this.apiFetch(
      `/orgs/${this.orgId}/collections/${coll.id}`,
      this.authState!,
      {
        method: "PATCH",
        body: JSON.stringify({ isPublic }),
      },
    );

    void this.fetchCollections();
  }

  private getPublicReplayURL(col: Collection) {
    return new URL(
      `/api/orgs/${this.orgId}/collections/${col.id}/public/replay.json`,
      window.location.href,
    ).href;
  }

  private readonly manageCollection = async (
    collection: Collection,
    dialogName: CollectionsList["openDialogName"],
  ) => {
    this.selectedCollection = collection;
    await this.updateComplete;
    this.openDialogName = dialogName;
  };

  private async deleteCollection(collection: Collection): Promise<void> {
    try {
      const name = collection.name;
      await this.apiFetch(
        `/orgs/${this.orgId}/collections/${collection.id}`,
        this.authState!,
        // FIXME API method is GET right now
        {
          method: "DELETE",
        },
      );

      this.selectedCollection = undefined;
      void this.fetchCollections();

      this.notify({
        message: msg(html`Deleted <strong>${name}</strong> Collection.`),
        variant: "success",
        icon: "check2-circle",
      });
    } catch {
      this.notify({
        message: msg("Sorry, couldn't delete Collection at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async fetchSearchValues() {
    try {
      const searchValues: CollectionSearchValues = await this.apiFetch(
        `/orgs/${this.orgId}/collections/search-values`,
        this.authState!,
      );
      const names = searchValues.names;

      // Update search/filter collection
      const toSearchItem =
        (key: SearchFields) =>
        (value: string): SearchResult["item"] => ({
          key,
          value,
        });
      this.fuse.setCollection([...names.map(toSearchItem("name"))]);
    } catch (e) {
      console.debug(e);
    }
  }

  private async fetchCollections(params?: APIPaginationQuery) {
    this.fetchErrorStatusCode = undefined;

    try {
      this.collections = await this.getCollections(params);
    } catch (e) {
      if (isApiError(e)) {
        this.fetchErrorStatusCode = e.statusCode;
      } else {
        this.notify({
          message: msg("Sorry, couldn't retrieve Collections at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async getCollections(queryParams?: APIPaginationQuery) {
    const query = queryString.stringify(
      {
        ...this.filterBy,
        page: queryParams?.page || this.collections?.page || 1,
        pageSize:
          queryParams?.pageSize ||
          this.collections?.pageSize ||
          INITIAL_PAGE_SIZE,
        sortBy: this.orderBy.field,
        sortDirection: this.orderBy.direction === "desc" ? -1 : 1,
      },
      {
        arrayFormat: "comma",
      },
    );

    const data = await this.apiFetch<APIPaginatedList<Collection>>(
      `/orgs/${this.orgId}/collections?${query}`,
      this.authState!,
    );

    return data;
  }
}
