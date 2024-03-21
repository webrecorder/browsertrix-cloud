import { localized, msg, str } from "@lit/localize";
import type { SlCheckbox, SlSelect } from "@shoelace-style/shoelace";
import { nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import type { ArchivedItem, Crawl, CrawlState, Workflow } from "./types";

import { CopyButton } from "@/components/ui/copy-button";
import type { PageChangeEvent } from "@/components/ui/pagination";
import { CrawlStatus } from "@/features/archived-items/crawl-status";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import { isApiError } from "@/utils/api";
import type { AuthState } from "@/utils/AuthService";
import { finishedCrawlStates, isActive } from "@/utils/crawler";
import LiteElement, { html } from "@/utils/LiteElement";

type ArchivedItems = APIPaginatedList<ArchivedItem>;
type SearchFields = "name" | "firstSeed";
type SortField = "finished" | "fileSize";
type SortDirection = "asc" | "desc";

const ABORT_REASON_THROTTLE = "throttled";
const INITIAL_PAGE_SIZE = 20;
const FILTER_BY_CURRENT_USER_STORAGE_KEY = "btrix.filterByCurrentUser.crawls";
const sortableFields: Record<
  SortField,
  { label: string; defaultDirection?: SortDirection }
> = {
  finished: {
    label: msg("Date Created"),
    defaultDirection: "desc",
  },
  fileSize: {
    label: msg("Size"),
    defaultDirection: "desc",
  },
};

/**
 * Usage:
 * ```ts
 * <btrix-archived-items></btrix-archived-items>
 * ```
 */
@localized()
@customElement("btrix-archived-items")
export class CrawlsList extends LiteElement {
  static FieldLabels: Record<SearchFields, string> = {
    name: msg("Name"),
    firstSeed: msg("Crawl Start URL"),
  };

  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  userId!: string;

  @property({ type: String })
  orgId?: string;

  @property({ type: Boolean })
  orgStorageQuotaReached = false;

  @property({ type: Boolean })
  isCrawler!: boolean;

  @property({ type: String })
  itemType: ArchivedItem["type"] | null = null;

  @state()
  private archivedItems?: ArchivedItems;

  @state()
  private searchOptions: Record<string, string>[] = [];

  @state()
  private orderBy: {
    field: SortField;
    direction: SortDirection;
  } = {
    field: "finished",
    direction: sortableFields["finished"].defaultDirection!,
  };

  @state()
  private filterByCurrentUser = false;

  @state()
  private filterBy: Partial<Record<keyof ArchivedItem, string | CrawlState[]>> =
    {};

  @state()
  private itemToEdit: ArchivedItem | null = null;

  @state()
  private isEditingItem = false;

  @state()
  private itemToDelete: ArchivedItem | null = null;

  @state()
  private isDeletingItem = false;

  @state()
  private isUploadingArchive = false;

  @query("#stateSelect")
  stateSelect?: SlSelect;

  // For fuzzy search:
  private readonly searchKeys = ["name", "firstSeed"];

  // Use to cancel requests
  private getArchivedItemsController: AbortController | null = null;

  private get selectedSearchFilterKey() {
    return Object.keys(CrawlsList.FieldLabels).find((key) =>
      Boolean((this.filterBy as Record<string, unknown>)[key]),
    );
  }

  constructor() {
    super();
    this.filterByCurrentUser =
      window.sessionStorage.getItem(FILTER_BY_CURRENT_USER_STORAGE_KEY) ===
      "true";
  }

  protected willUpdate(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ) {
    if (
      changedProperties.has("filterByCurrentUser") ||
      changedProperties.has("filterBy") ||
      changedProperties.has("orderBy") ||
      changedProperties.has("itemType")
    ) {
      if (changedProperties.has("itemType")) {
        this.filterBy = {};
        this.orderBy = {
          field: "finished",
          direction: sortableFields["finished"].defaultDirection!,
        };
        this.archivedItems = undefined;
      }

      void this.fetchArchivedItems({
        page: 1,
        pageSize: INITIAL_PAGE_SIZE,
      });

      if (changedProperties.has("filterByCurrentUser")) {
        window.sessionStorage.setItem(
          FILTER_BY_CURRENT_USER_STORAGE_KEY,
          this.filterByCurrentUser.toString(),
        );
      }
    }

    if (changedProperties.has("itemType")) {
      void this.fetchConfigSearchValues();
    }
  }

  disconnectedCallback(): void {
    this.cancelInProgressGetArchivedItems();
    super.disconnectedCallback();
  }

  render() {
    const listTypes: {
      itemType: ArchivedItem["type"] | null;
      label: string;
      icon?: string;
    }[] = [
      {
        itemType: null,
        label: msg("All"),
      },
      {
        itemType: "crawl",
        icon: "gear-wide-connected",
        label: msg("Crawls"),
      },
      {
        itemType: "upload",
        icon: "upload",
        label: msg("Uploads"),
      },
    ];

    return html`
      <main>
        <header class="contents">
          <div class="mb-3 flex flex-wrap justify-between gap-2 border-b pb-3">
            <h1 class="mb-2 text-xl font-semibold leading-8 md:mb-0">
              ${msg("Archived Items")}
            </h1>
            ${when(
              this.isCrawler,
              () => html`
                <sl-tooltip
                  content=${msg("Org Storage Full")}
                  ?disabled=${!this.orgStorageQuotaReached}
                >
                  <sl-button
                    size="small"
                    variant="primary"
                    @click=${() => (this.isUploadingArchive = true)}
                    ?disabled=${this.orgStorageQuotaReached}
                  >
                    <sl-icon slot="prefix" name="upload"></sl-icon>
                    ${msg("Upload WACZ")}
                  </sl-button>
                </sl-tooltip>
              `,
            )}
          </div>
          <div class="mb-3 flex gap-2">
            ${listTypes.map(({ label, itemType, icon }) => {
              const isSelected = itemType === this.itemType;
              return html` <btrix-navigation-button
                .active=${isSelected}
                aria-selected="${isSelected}"
                href=${`${this.orgBasePath}/items${
                  itemType ? `/${itemType}` : ""
                }`}
                @click=${this.navLink}
                size="small"
              >
                ${icon ? html`<sl-icon name=${icon}></sl-icon>` : ""}
                <span>${label}</span>
              </btrix-navigation-button>`;
            })}
          </div>
          <div
            class="sticky top-2 z-10 mb-3 rounded-lg border bg-neutral-50 p-4"
          >
            ${this.renderControls()}
          </div>
        </header>

        ${when(
          this.archivedItems,
          () => {
            const { items, page, total, pageSize } = this.archivedItems!;
            return html`
              <section class="mx-2">
                ${items.length
                  ? this.renderArchivedItemList()
                  : this.renderEmptyState()}
              </section>
              ${when(
                total > pageSize,
                () => html`
                  <footer class="mt-6 flex justify-center">
                    <btrix-pagination
                      page=${page}
                      totalCount=${total}
                      size=${pageSize}
                      @page-change=${async (e: PageChangeEvent) => {
                        await this.fetchArchivedItems({
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
          },
          () => html`
            <div class="my-12 flex w-full items-center justify-center text-2xl">
              <sl-spinner></sl-spinner>
            </div>
          `,
        )}
      </main>
      ${when(
        this.isCrawler && this.orgId,
        () => html`
          <btrix-file-uploader
            orgId=${this.orgId!}
            .authState=${this.authState}
            ?open=${this.isUploadingArchive}
            @request-close=${() => (this.isUploadingArchive = false)}
            @uploaded=${() => {
              if (this.itemType !== "crawl") {
                void this.fetchArchivedItems({
                  page: 1,
                });
              }
            }}
          ></btrix-file-uploader>
        `,
      )}
    `;
  }

  private renderControls() {
    const viewPlaceholder = msg("Any");
    const viewOptions = finishedCrawlStates;

    return html`
      <div
        class="grid grid-cols-1 items-center gap-x-2 gap-y-2 md:grid-cols-2 lg:grid-cols-[minmax(0,100%)_fit-content(100%)_fit-content(100%)]"
      >
        <div class="col-span-1 md:col-span-2 lg:col-span-1">
          ${this.renderSearch()}
        </div>
        <div class="flex items-center">
          <div class="mx-2 text-neutral-500">${msg("Status:")}</div>
          <sl-select
            id="stateSelect"
            class="flex-1 md:w-[14.5rem]"
            size="small"
            pill
            multiple
            max-options-visible="1"
            placeholder=${viewPlaceholder}
            @sl-change=${async (e: CustomEvent) => {
              const value = (e.target as SlSelect).value as CrawlState[];
              await this.updateComplete;
              this.filterBy = {
                ...this.filterBy,
                state: value,
              };
            }}
          >
            ${viewOptions.map(this.renderStatusMenuItem)}
          </sl-select>
        </div>

        <div class="flex items-center">
          <div class="mx-2 whitespace-nowrap text-neutral-500">
            ${msg("Sort by:")}
          </div>
          <div class="flex grow">${this.renderSortControl()}</div>
        </div>
      </div>

      ${this.userId
        ? html` <div class="mt-2 flex h-6 justify-end">
            <label>
              <span class="mr-1 text-xs text-neutral-500"
                >${msg("Show Only Mine")}</span
              >
              <sl-switch
                @sl-change=${(e: CustomEvent) =>
                  (this.filterByCurrentUser = (e.target as SlCheckbox).checked)}
                ?checked=${this.filterByCurrentUser}
              ></sl-switch>
            </label>
          </div>`
        : ""}
    `;
  }

  private renderSortControl() {
    const options = Object.entries(sortableFields).map(
      ([value, { label }]) => html`
        <sl-option value=${value}>${label}</sl-option>
      `,
    );
    return html`
      <sl-select
        class="flex-1 md:w-[10rem]"
        size="small"
        pill
        value=${this.orderBy.field}
        @sl-change=${(e: Event) => {
          const field = (e.target as HTMLSelectElement).value as SortField;
          this.orderBy = {
            field: field,
            direction:
              sortableFields[field].defaultDirection || this.orderBy.direction,
          };
        }}
      >
        ${options}
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
    `;
  }

  private renderSearch() {
    return html`
      <btrix-search-combobox
        .searchKeys=${this.searchKeys}
        .searchOptions=${this.searchOptions}
        .keyLabels=${CrawlsList.FieldLabels}
        selectedKey=${ifDefined(this.selectedSearchFilterKey)}
        placeholder=${this.itemType === "upload"
          ? msg("Search all uploads by name")
          : this.itemType === "crawl"
            ? msg("Search all crawls by name or Crawl Start URL")
            : msg("Search all items by name or Crawl Start URL")}
        @on-select=${(e: CustomEvent) => {
          const { key, value } = e.detail;
          this.filterBy = {
            ...this.filterBy,
            [key]: value,
          };
        }}
        @on-clear=${() => {
          const {
            name: _name,
            firstSeed: _firstSeed,
            ...otherFilters
          } = this.filterBy;
          this.filterBy = otherFilters;
        }}
      >
      </btrix-search-combobox>
    `;
  }

  private renderArchivedItemList() {
    if (!this.archivedItems) return;

    return html`
      <btrix-archived-item-list>
        <btrix-table-header-cell slot="actionCell" class="px-1">
          <span class="sr-only">${msg("Row actions")}</span>
        </btrix-table-header-cell>
        ${this.archivedItems.items.map(this.renderArchivedItem)}
      </btrix-archived-item-list>

      ${this.itemToEdit
        ? html`
            <btrix-item-metadata-editor
              .authState=${this.authState}
              .crawl=${this.itemToEdit}
              ?open=${this.isEditingItem}
              @request-close=${() => (this.isEditingItem = false)}
              @updated=${
                /* TODO fetch current page or single crawl */ this
                  .fetchArchivedItems
              }
            ></btrix-item-metadata-editor>
          `
        : nothing}

      <btrix-dialog
        .label=${msg("Delete Archived Item?")}
        .open=${this.isDeletingItem}
        @sl-after-hide=${() => (this.isDeletingItem = false)}
      >
        ${msg("This item will be removed from any Collection it is a part of.")}
        ${when(this.itemToDelete?.type === "crawl", () =>
          msg(
            "All files and logs associated with this item will also be deleted, and the crawl will no longer be visible in its associated Workflow.",
          ),
        )}
        <div slot="footer" class="flex justify-between">
          <sl-button size="small" .autofocus=${true}
            >${msg("Cancel")}</sl-button
          >
          <sl-button
            size="small"
            variant="danger"
            @click=${async () => {
              this.isDeletingItem = false;
              if (this.itemToDelete) {
                await this.deleteItem(this.itemToDelete);
              }
            }}
            >${msg(
              str`Delete ${
                this.itemToDelete?.type === "upload"
                  ? msg("Upload")
                  : msg("Crawl")
              }`,
            )}</sl-button
          >
        </div>
      </btrix-dialog>
    `;
  }

  private readonly renderArchivedItem = (item: ArchivedItem) => html`
    <btrix-archived-item-list-item
      href=${`/orgs/${this.appState.orgSlug}/items/${item.type}/${item.id}`}
      .item=${item}
    >
      <btrix-crawl-status
        slot="namePrefix"
        state=${item.state}
        hideLabel
        ?isUpload=${item.type === "upload"}
      ></btrix-crawl-status>
      <btrix-table-cell slot="actionCell" class="px-1">
        <btrix-overflow-dropdown
          @click=${(e: MouseEvent) => {
            // Prevent navigation to detail view
            e.preventDefault();
            e.stopImmediatePropagation();
          }}
        >
          <sl-menu>${this.renderMenuItems(item)}</sl-menu>
        </btrix-overflow-dropdown>
      </btrix-table-cell>
    </btrix-archived-item-list-item>
  `;

  private readonly renderMenuItems = (item: ArchivedItem) =>
    // HACK shoelace doesn't current have a way to override non-hover
    // color without resetting the --sl-color-neutral-700 variable
    html`
      ${when(
        this.isCrawler,
        () => html`
          <sl-menu-item
            @click=${async () => {
              this.itemToEdit = item;
              await this.updateComplete;
              this.isEditingItem = true;
            }}
          >
            <sl-icon name="pencil" slot="prefix"></sl-icon>
            ${msg("Edit Metadata")}
          </sl-menu-item>
          <sl-divider></sl-divider>
        `,
      )}
      ${item.type === "crawl"
        ? html`
            <sl-menu-item
              @click=${() =>
                this.navTo(`${this.orgBasePath}/workflows/crawl/${item.cid}`)}
            >
              <sl-icon name="arrow-return-right" slot="prefix"></sl-icon>
              ${msg("Go to Workflow")}
            </sl-menu-item>
            <sl-menu-item @click=${() => CopyButton.copyToClipboard(item.cid)}>
              <sl-icon name="copy" slot="prefix"></sl-icon>
              ${msg("Copy Workflow ID")}
            </sl-menu-item>
            <sl-menu-item @click=${() => CopyButton.copyToClipboard(item.id)}>
              <sl-icon name="copy" slot="prefix"></sl-icon>
              ${msg("Copy Crawl ID")}
            </sl-menu-item>
          `
        : nothing}
      <sl-menu-item
        @click=${() => CopyButton.copyToClipboard(item.tags.join(", "))}
        ?disabled=${!item.tags.length}
      >
        <sl-icon name="tags" slot="prefix"></sl-icon>
        ${msg("Copy Tags")}
      </sl-menu-item>
      ${when(
        this.isCrawler && !isActive(item.state),
        () => html`
          <sl-divider></sl-divider>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${() => this.confirmDeleteItem(item)}
          >
            <sl-icon name="trash3" slot="prefix"></sl-icon>
            ${msg("Delete Item")}
          </sl-menu-item>
        `,
      )}
    `;

  private readonly renderStatusMenuItem = (state: CrawlState) => {
    const { icon, label } = CrawlStatus.getContent(state);

    return html`<sl-option value=${state}>${icon}${label}</sl-option>`;
  };

  private renderEmptyState() {
    if (Object.keys(this.filterBy).length) {
      return html`
        <div class="rounded-lg border bg-neutral-50 p-4">
          <p class="text-center">
            <span class="text-neutral-400"
              >${msg("No matching items found.")}</span
            >
            <button
              class="font-medium text-neutral-500 underline hover:no-underline"
              @click=${() => {
                this.filterBy = {};
                if (this.stateSelect) {
                  // TODO pass in value to sl-select after upgrading
                  // shoelace to >=2.0.0-beta.88. Passing an array value
                  // using beta.85 is currently buggy.
                  this.stateSelect.value = [];
                }
              }}
            >
              ${msg("Clear search and filters")}
            </button>
          </p>
        </div>
      `;
    }

    if (this.archivedItems?.page && this.archivedItems.page > 1) {
      return html`
        <div class="border-b border-t py-5">
          <p class="text-center text-neutral-500">
            ${msg("Could not find page.")}
          </p>
        </div>
      `;
    }

    return html`
      <div class="border-b border-t py-5">
        <p class="text-center text-neutral-500">
          ${msg("No archived items yet.")}
        </p>
      </div>
    `;
  }

  /**
   * Fetch archived items and update internal state
   */
  private async fetchArchivedItems(params?: APIPaginationQuery): Promise<void> {
    this.cancelInProgressGetArchivedItems();
    try {
      this.archivedItems = await this.getArchivedItems(params);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        console.debug("Fetch archived items aborted to throttle");
      } else {
        this.notify({
          message: msg("Sorry, couldn't retrieve archived items at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private cancelInProgressGetArchivedItems() {
    if (this.getArchivedItemsController) {
      this.getArchivedItemsController.abort(ABORT_REASON_THROTTLE);
      this.getArchivedItemsController = null;
    }
  }

  private async getArchivedItems(
    queryParams?: APIPaginationQuery & { state?: CrawlState[] },
  ): Promise<ArchivedItems> {
    const query = queryString.stringify(
      {
        ...this.filterBy,
        state: this.filterBy.state?.length
          ? this.filterBy.state
          : finishedCrawlStates,
        page: queryParams?.page || this.archivedItems?.page || 1,
        pageSize:
          queryParams?.pageSize ||
          this.archivedItems?.pageSize ||
          INITIAL_PAGE_SIZE,
        userid: this.filterByCurrentUser ? this.userId : undefined,
        sortBy: this.orderBy.field,
        sortDirection: this.orderBy.direction === "desc" ? -1 : 1,
        crawlType: this.itemType,
      },
      {
        arrayFormat: "comma",
      },
    );

    this.getArchivedItemsController = new AbortController();
    const data = await this.apiFetch<ArchivedItems>(
      `/orgs/${this.orgId}/all-crawls?${query}`,
      this.authState!,
      {
        signal: this.getArchivedItemsController.signal,
      },
    );

    this.getArchivedItemsController = null;

    return data;
  }

  private async fetchConfigSearchValues() {
    try {
      const query = queryString.stringify({
        crawlType: this.itemType,
      });
      const data: {
        crawlIds: string[];
        names: string[];
        descriptions: string[];
        firstSeeds: string[];
      } = await this.apiFetch(
        `/orgs/${this.orgId}/all-crawls/search-values?${query}`,
        this.authState!,
      );

      // Update search/filter collection
      const toSearchItem = (key: SearchFields) => (value: string) => ({
        [key]: value,
      });
      this.searchOptions = [
        ...data.names.map(toSearchItem("name")),
        ...data.firstSeeds.map(toSearchItem("firstSeed")),
      ];
    } catch (e) {
      console.debug(e);
    }
  }

  private readonly confirmDeleteItem = (item: ArchivedItem) => {
    this.itemToDelete = item;
    this.isDeletingItem = true;
  };

  private async deleteItem(item: ArchivedItem) {
    let apiPath;

    switch (this.itemType) {
      case "crawl":
        apiPath = "crawls";
        break;
      case "upload":
        apiPath = "uploads";
        break;
      default:
        apiPath = "all-crawls";
        break;
    }

    try {
      const _data = await this.apiFetch(
        `/orgs/${item.oid}/${apiPath}/delete`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify({
            crawl_ids: [item.id],
          }),
        },
      );
      const { items, ...crawlsData } = this.archivedItems!;
      this.itemToDelete = null;
      this.archivedItems = {
        ...crawlsData,
        items: items.filter((c) => c.id !== item.id),
      };
      this.notify({
        message: msg(str`Successfully deleted archived item.`),
        variant: "success",
        icon: "check2-circle",
      });
      void this.fetchArchivedItems();
    } catch (e) {
      if (this.itemToDelete) {
        this.confirmDeleteItem(this.itemToDelete);
      }
      let message = msg(
        str`Sorry, couldn't delete archived item at this time.`,
      );
      if (isApiError(e)) {
        if (e.details == "not_allowed") {
          message = msg(
            str`Only org owners can delete other users' archived items.`,
          );
        } else if (e.message) {
          message = e.message;
        }
      }
      this.notify({
        message: message,
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  async getWorkflow(crawl: Crawl): Promise<Workflow> {
    const data: Workflow = await this.apiFetch(
      `/orgs/${crawl.oid}/crawlconfigs/${crawl.cid}`,
      this.authState!,
    );

    return data;
  }
}
