import { localized, msg, str } from "@lit/localize";
import { merge } from "immutable";
import { css, html, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { cache } from "lit/directives/cache.js";
import { repeat } from "lit/directives/repeat.js";
import { when } from "lit/directives/when.js";
import difference from "lodash/fp/difference";
import union from "lodash/fp/union";
import without from "lodash/fp/without";
import queryString from "query-string";

import type {
  AutoAddChangeDetail,
  SelectionChangeDetail,
} from "./collection-workflow-list";

import { TailwindElement } from "@/classes/TailwindElement";
import type { Dialog } from "@/components/ui/dialog";
import type { PageChangeEvent } from "@/components/ui/pagination";
import { APIController } from "@/controllers/api";
import { NotifyController } from "@/controllers/notify";
import { type CheckboxChangeEventDetail } from "@/features/archived-items/archived-item-list";
import type {
  FilterBy,
  FilterChangeEventDetail,
  SearchValues,
  SortBy,
  SortChangeEventDetail,
  SortOptions,
} from "@/features/archived-items/item-list-controls";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import type { ArchivedItem, Crawl, Upload, Workflow } from "@/types/crawler";
import { isApiError } from "@/utils/api";
import type { AuthState } from "@/utils/AuthService";
import { finishedCrawlStates } from "@/utils/crawler";

const TABS = ["crawl", "upload"] as const;
type Tab = (typeof TABS)[number];
const searchKeys = ["name", "firstSeed"];
const crawlSortOptions: SortOptions = [
  {
    // NOTE "finished" field doesn't exist in crawlconfigs,
    // `lastRun` is used instead
    field: "finished",
    label: msg("Crawl Finished"),
    defaultDirection: -1,
  },
  {
    field: "firstSeed",
    label: msg("Crawl Start URL"),
    defaultDirection: 1,
  },
];
const uploadSortOptions: SortOptions = [
  {
    field: "finished",
    label: msg("Date Created"),
    defaultDirection: -1,
  },
  {
    field: "fileSize",
    label: msg("File Size"),
    defaultDirection: -1,
  },
];
const COLLECTION_ITEMS_MAX = 1000;
const DEFAULT_PAGE_SIZE = 10;

@localized()
@customElement("btrix-collection-items-dialog")
export class CollectionItemsDialog extends TailwindElement {
  static styles = css`
    btrix-dialog {
      --width: var(--btrix-screen-lg);
      --body-spacing: 0;
    }

    .dialogContent {
      /**
       * Fill height of viewport
       * FIXME dynamically calculate height of dialog controls?
       */
      min-height: calc(100vh - 8.6rem);
    }
  `;

  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  userId!: string;

  @property({ type: Boolean })
  isCrawler?: boolean;

  @property({ type: String })
  collectionId!: string;

  @property({ type: String })
  collectionName = "";

  @property({ type: Boolean })
  open = false;

  @state()
  private isSubmitting = false;

  @state()
  private activeTab: Tab = TABS[0];

  @state()
  private crawls?: APIPaginatedList<Crawl>;

  @state()
  private uploads?: APIPaginatedList<Upload>;

  @state()
  private workflows?: APIPaginatedList<Workflow>;

  @state()
  showOnlyInCollection = false;

  @state()
  showOnlyMine = false;

  @state()
  sortCrawlsBy: SortBy = {
    field: "finished",
    direction: -1,
  };

  @state()
  sortUploadsBy: SortBy = {
    field: "finished",
    direction: -1,
  };

  @state()
  filterCrawlsBy: FilterBy = {};

  @state()
  filterUploadsBy: FilterBy = {};

  @state()
  private crawlSearchValues?: SearchValues;

  @state()
  private uploadSearchValues?: SearchValues;

  /**
   * Whether item is selected or not, keyed by ID
   */
  @state()
  private selection: { [itemID: string]: boolean } = {};

  @state()
  private isReady = false;

  @query("btrix-dialog")
  private readonly dialog!: Dialog;

  private savedCollectionItemIDs: string[] = [];

  private readonly api = new APIController(this);
  private readonly notify = new NotifyController(this);

  private readonly tabLabels: Record<Tab, { icon: string; label: string }> = {
    crawl: {
      icon: "gear-wide-connected",
      label: msg("Crawls"),
    },
    upload: {
      icon: "upload",
      label: msg("Uploads"),
    },
  };

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (!this.open) {
      // Don't perform any updates if dialog isn't open
      return;
    }
    if (changedProperties.has("open")) {
      void this.initSelection();
    } else if (
      changedProperties.has("showOnlyMine") ||
      changedProperties.has("showOnlyInCollection")
    ) {
      void this.fetchCrawls();
      void this.fetchUploads();
    } else {
      if (changedProperties.has("sortCrawlsBy")) {
        void this.fetchCrawls();
      } else if (changedProperties.has("filterCrawlsBy")) {
        void this.fetchCrawls({ page: 1 });
      }

      if (changedProperties.has("sortUploadsBy")) {
        void this.fetchUploads();
      } else if (changedProperties.has("filterUploadsBy")) {
        void this.fetchUploads({ page: 1 });
      }
    }
  }

  render() {
    return html` <btrix-dialog
      ?open=${this.open}
      style="--width: var(--btrix-screen-desktop); --body-spacing: 0;"
      @sl-show=${() => (this.isReady = true)}
      @sl-after-hide=${() => this.reset()}
    >
      <span slot="label">
        ${msg("Select Archived Items")}
        <span class="font-normal text-neutral-500"
          >${msg(str`in ${this.collectionName}`)}</span
        >
      </span>
      <div class="dialogContent flex flex-col">
        ${when(this.isReady, this.renderContent)}
      </div>
      <div slot="footer" class="flex items-center justify-end gap-3">
        <sl-button class="mr-auto" size="small" @click=${() => this.close()}
          >${msg("Cancel")}</sl-button
        >
        ${this.renderSave()}
      </div>
    </btrix-dialog>`;
  }

  private readonly renderContent = () => {
    return html`
      <div class="flex flex-wrap items-center justify-between">
        <div class="flex gap-3 px-4 py-3" role="tablist">
          ${TABS.map(this.renderTab)}
        </div>
        <div class="flex gap-3 px-4 py-3">
          ${this.renderCollectionToggle()} ${this.renderMineToggle()}
        </div>
      </div>
      <div
        id="tabPanel-crawls"
        class="flex-1${this.activeTab === "crawl" ? " flex flex-col" : ""}"
        role="tabpanel"
        tabindex="0"
        aria-labelledby="tab-crawls"
        ?hidden=${this.activeTab !== "crawl"}
      >
        ${this.renderCrawls()}
      </div>

      <div
        id="tabPanel-uploads"
        class="flex-1${this.activeTab === "upload" ? " flex flex-col" : ""}"
        role="tabpanel"
        tabindex="0"
        aria-labelledby="tab-uploads"
        ?hidden=${this.activeTab !== "upload"}
      >
        ${this.renderUploads()}
      </div>
    `;
  };

  private readonly renderTab = (tab: Tab) => {
    const isSelected = tab === this.activeTab;
    const { icon, label } = this.tabLabels[tab];

    return html`
      <btrix-navigation-button
        @click=${() => (this.activeTab = tab)}
        .active=${isSelected}
        size="small"
        aria-selected="${isSelected}"
        role="tab"
        aria-controls="tabPanel-${tab}"
        id="tab-${tab}"
        tabindex="-1"
      >
        <sl-icon name=${icon}></sl-icon>
        <span>${label}</span>
      </btrix-navigation-button>
    `;
  };

  private readonly renderCrawls = () => {
    const data = this.showOnlyInCollection ? this.crawls : this.workflows;
    return html`
      <header class="sticky top-0 z-20 bg-white">
        <div class="border-y bg-neutral-50 p-3">
          <btrix-item-list-controls
            .searchKeys=${searchKeys}
            .searchValues=${this.crawlSearchValues}
            .sortOptions=${crawlSortOptions}
            .sortBy=${this.sortCrawlsBy}
            @btrix-filter-change=${(
              e: CustomEvent<FilterChangeEventDetail>,
            ) => {
              this.filterCrawlsBy = e.detail;
            }}
            @btrix-sort-change=${(e: CustomEvent<SortChangeEventDetail>) => {
              this.sortCrawlsBy = {
                ...this.sortCrawlsBy,
                ...e.detail,
              };
            }}
          ></btrix-item-list-controls>
        </div>
        <btrix-section-heading>
          <div class="px-3">
            ${when(
              data,
              () =>
                this.showOnlyInCollection
                  ? msg(
                      str`Crawls in Collection (${data!.total.toLocaleString()})`,
                    )
                  : msg(str`All Workflows (${data!.total.toLocaleString()})`),
              () => msg("Loading..."),
            )}
          </div>
        </btrix-section-heading>
      </header>
      ${cache(
        this.showOnlyInCollection
          ? this.renderCollectionCrawls()
          : this.renderOrgWorkflows(),
      )}
    `;
  };

  private readonly renderUploads = () => {
    if (!this.uploads) {
      return this.renderLoading();
    }

    return html`
      <header class="sticky top-0 z-20 bg-white">
        <div class="border-y bg-neutral-50 p-3">
          <btrix-item-list-controls
            .searchKeys=${searchKeys}
            .searchValues=${this.uploadSearchValues}
            .sortOptions=${uploadSortOptions}
            .sortBy=${this.sortUploadsBy}
            @btrix-filter-change=${(
              e: CustomEvent<FilterChangeEventDetail>,
            ) => {
              this.filterUploadsBy = e.detail;
            }}
            @btrix-sort-change=${(e: CustomEvent<SortChangeEventDetail>) => {
              this.sortUploadsBy = {
                ...this.sortUploadsBy,
                ...e.detail,
              };
            }}
          ></btrix-item-list-controls>
        </div>
        <btrix-section-heading>
          <div class="px-3">
            ${when(
              this.uploads,
              () =>
                this.showOnlyInCollection
                  ? msg(
                      str`Uploads in Collection (${this.uploads!.total.toLocaleString()})`,
                    )
                  : msg(
                      str`All Uploads (${this.uploads!.total.toLocaleString()})`,
                    ),
              () => msg("Loading..."),
            )}
          </div>
        </btrix-section-heading>
      </header>
      <section class="flex-1 px-3 pb-3 pt-2">
        <btrix-archived-item-list>
          <btrix-table-header-cell slot="checkboxCell" class="pr-0">
            <span class="sr-only">${msg("In Collection?")}</span>
          </btrix-table-header-cell>
          ${repeat(this.uploads.items, ({ id }) => id, this.renderArchivedItem)}
        </btrix-archived-item-list>
        ${when(
          !this.uploads.total,
          () =>
            html`<p class="p-5 text-center text-neutral-500">
              ${msg("No matching uploads found.")}
            </p>`,
        )}
      </section>
      <footer class="flex justify-center pb-3">
        ${when(
          this.uploads.total > this.uploads.pageSize,
          () => html`
            <btrix-pagination
              page=${this.uploads!.page}
              size=${this.uploads!.pageSize}
              totalCount=${this.uploads!.total}
              @page-change=${(e: PageChangeEvent) => {
                void this.fetchUploads({
                  page: e.detail.page,
                });
              }}
            >
            </btrix-pagination>
          `,
        )}
      </footer>
    `;
  };

  private readonly renderCollectionCrawls = () => {
    if (!this.crawls) {
      return this.renderLoading();
    }

    return html`
      <section class="flex-1 px-3 pb-3 pt-2">
        <btrix-archived-item-list>
          <btrix-table-header-cell slot="checkboxCell" class="pr-0">
            <span class="sr-only">${msg("In Collection?")}</span>
          </btrix-table-header-cell>
          ${repeat(this.crawls.items, ({ id }) => id, this.renderArchivedItem)}
        </btrix-archived-item-list>

        ${when(
          !this.crawls.total,
          () =>
            html`<p class="p-5 text-center text-neutral-500">
              ${msg("No matching crawls found.")}
            </p>`,
        )}
      </section>

      <footer class="flex justify-center pb-3">
        ${when(
          this.crawls.total > this.crawls.pageSize,
          () => html`
            <btrix-pagination
              page=${this.crawls!.page}
              size=${this.crawls!.pageSize}
              totalCount=${this.crawls!.total}
              @page-change=${(e: PageChangeEvent) => {
                void this.fetchCrawls({
                  page: e.detail.page,
                });
              }}
            >
            </btrix-pagination>
          `,
        )}
      </footer>
    `;
  };

  private readonly renderOrgWorkflows = () => {
    if (!this.workflows) {
      return this.renderLoading();
    }

    return html`<section class="flex-1 p-3">
        <btrix-collection-workflow-list
          .authState=${this.authState}
          orgId=${this.orgId}
          collectionId=${this.collectionId}
          .workflows=${this.workflows.items}
          .selection=${this.selection}
          @btrix-selection-change=${(e: CustomEvent<SelectionChangeDetail>) => {
            this.selection = {
              ...this.selection,
              ...e.detail.selection,
            };
          }}
          @btrix-auto-add-change=${(e: CustomEvent<AutoAddChangeDetail>) => {
            const { id, checked } = e.detail;
            const workflow = this.workflows?.items.find(
              (workflow) => workflow.id === id,
            );
            if (workflow) {
              void this.saveAutoAdd({
                id,
                autoAddCollections: checked
                  ? union([this.collectionId], workflow.autoAddCollections)
                  : without([this.collectionId], workflow.autoAddCollections),
              });
            }
          }}
        >
        </btrix-collection-workflow-list>
      </section>
      <footer class="flex justify-center pb-3">
        ${when(
          this.workflows.total > this.workflows.pageSize,
          () => html`
            <btrix-pagination
              page=${this.workflows!.page}
              size=${this.workflows!.pageSize}
              totalCount=${this.workflows!.total}
              @page-change=${(e: PageChangeEvent) => {
                void this.fetchCrawls({
                  page: e.detail.page,
                });
              }}
            >
            </btrix-pagination>
          `,
        )}
      </footer> `;
  };

  private renderCollectionToggle() {
    return html`
      <sl-switch
        size="small"
        ?checked=${this.showOnlyInCollection}
        @sl-change=${() =>
          (this.showOnlyInCollection = !this.showOnlyInCollection)}
      >
        ${msg("Only items in Collection")}
      </sl-switch>
    `;
  }

  private renderMineToggle() {
    return html`
      <sl-switch
        size="small"
        ?checked=${this.showOnlyMine}
        @sl-change=${() => (this.showOnlyMine = !this.showOnlyMine)}
      >
        ${msg("Only mine")}
      </sl-switch>
    `;
  }

  renderArchivedItem = (item: ArchivedItem) => {
    const isInCollection = item.collectionIds.includes(this.collectionId);
    return html`
      <btrix-archived-item-list-item
        .item=${item}
        checkbox
        ?checked=${isInCollection}
        @btrix-checkbox-change=${(
          e: CustomEvent<CheckboxChangeEventDetail>,
        ) => {
          this.selection = {
            ...this.selection,
            [item.id]: e.detail.checked,
          };
        }}
      >
      </btrix-archived-item-list-item>
    `;
  };

  private readonly renderSave = () => {
    const { add, remove } = this.difference;
    const addCount = add.length;
    const removeCount = remove.length;
    const hasChange = addCount || removeCount;
    let selectionMessage = msg("No changes to save");

    if (hasChange) {
      const messages = [];
      if (addCount) {
        messages.push(
          addCount === 1
            ? msg(str`Adding 1 item`)
            : msg(str`Adding ${addCount.toLocaleString()} items`),
        );
      }
      if (removeCount) {
        messages.push(
          removeCount === 1
            ? msg(str`Removing 1 item`)
            : msg(str`Removing ${removeCount.toLocaleString()} items`),
        );
      }

      selectionMessage = messages.join(" / ");
    }

    return html`
      <span class="text-neutral-500">${selectionMessage}</span>
      <sl-button
        variant="primary"
        size="small"
        ?disabled=${this.isSubmitting || !hasChange}
        ?loading=${this.isSubmitting}
        @click=${() => void this.save()}
      >
        ${msg("Save Selection")}
      </sl-button>
    `;
  };

  private readonly renderLoading = () => html`
    <div class="my-24 flex w-full items-center justify-center text-3xl">
      <sl-spinner></sl-spinner>
    </div>
  `;

  private close() {
    void this.dialog.hide();
  }

  private reset() {
    this.isReady = false;
    // Reset selection and filters
    this.activeTab = TABS[0];
    this.crawls = undefined;
    this.workflows = undefined;
    this.uploads = undefined;
    this.showOnlyInCollection = false;
    this.showOnlyMine = false;
    this.sortCrawlsBy = {
      field: "finished",
      direction: -1,
    };
    this.sortUploadsBy = {
      field: "finished",
      direction: -1,
    };
    this.filterCrawlsBy = {};
    this.filterUploadsBy = {};
    this.selection = {};
  }

  private selectAllItems(items: ArchivedItem[]) {
    const selection = { ...this.selection };
    items.forEach((item) => {
      if (!Object.prototype.hasOwnProperty.call(selection, item.id)) {
        selection[item.id] = true;
      }
    });
    this.selection = selection;
  }

  private get difference() {
    const itemIds = Object.entries(this.selection)
      .filter(([, isSelected]) => isSelected)
      .map(([id]) => id);
    const add = difference(itemIds)(this.savedCollectionItemIDs);
    const remove = difference(this.savedCollectionItemIDs)(itemIds);
    return { add, remove };
  }

  private async save() {
    await this.updateComplete;
    const { add, remove } = this.difference;
    const requests = [];
    if (add.length) {
      requests.push(
        this.api.fetch(
          `/orgs/${this.orgId}/collections/${this.collectionId}/add`,
          this.authState!,
          {
            method: "POST",
            body: JSON.stringify({ crawlIds: add }),
          },
        ),
      );
    }
    if (remove.length) {
      requests.push(
        this.api.fetch(
          `/orgs/${this.orgId}/collections/${this.collectionId}/remove`,
          this.authState!,
          {
            method: "POST",
            body: JSON.stringify({ crawlIds: remove }),
          },
        ),
      );
    }

    this.isSubmitting = true;

    try {
      await Promise.all(requests);

      this.close();
      this.dispatchEvent(new CustomEvent("btrix-collection-saved"));
      this.notify.toast({
        message: msg(str`Successfully saved archived item selection.`),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e) {
      this.notify.toast({
        message: isApiError(e)
          ? e.message
          : msg("Something unexpected went wrong"),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmitting = false;
  }

  private async initSelection() {
    void this.fetchCrawls({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
    void this.fetchUploads({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
    void this.fetchSearchValues();

    const [crawls, uploads] = await Promise.all([
      this.getCrawls({
        page: 1,
        pageSize: COLLECTION_ITEMS_MAX,
        collectionId: this.collectionId,
      }).then(({ items }) => items),
      this.getUploads({
        page: 1,
        pageSize: COLLECTION_ITEMS_MAX,
        collectionId: this.collectionId,
      }).then(({ items }) => items),
    ]);

    const items = [...crawls, ...uploads];
    this.selectAllItems(items);
    // Cache collection items to compare when saving
    this.savedCollectionItemIDs = items.map(({ id }) => id);
  }

  private async fetchCrawls(pageParams: APIPaginationQuery = {}) {
    try {
      this.crawls = await this.getCrawls({
        userid: this.showOnlyMine ? this.userId : undefined,
        collectionId: this.collectionId,
        sortBy: this.sortCrawlsBy.field,
        sortDirection: this.sortCrawlsBy.direction,
        page: this.crawls?.page,
        pageSize: this.crawls?.pageSize,
        ...pageParams,
        ...this.filterCrawlsBy,
      });
      if (!this.showOnlyInCollection) {
        this.workflows = await this.getWorkflows({
          userid: this.showOnlyMine ? this.userId : undefined,
          sortBy:
            // NOTE "finished" field doesn't exist in crawlconfigs,
            // `lastRun` is used instead
            this.sortCrawlsBy.field === "finished"
              ? "lastRun"
              : this.sortCrawlsBy.field,
          sortDirection: this.sortCrawlsBy.direction,
          page: this.workflows?.page,
          pageSize: this.workflows?.pageSize,
          ...pageParams,
          ...this.filterCrawlsBy,
        });
      }
    } catch (e: unknown) {
      console.debug(e);
    }
  }

  private async fetchUploads(pageParams: APIPaginationQuery = {}) {
    try {
      this.uploads = await this.getUploads({
        userid: this.showOnlyMine ? this.userId : undefined,
        collectionId: this.showOnlyInCollection ? this.collectionId : undefined,
        sortBy: this.sortUploadsBy.field,
        sortDirection: this.sortUploadsBy.direction,
        page: this.uploads?.page,
        pageSize: this.uploads?.pageSize,
        ...pageParams,
        ...this.filterUploadsBy,
      });
    } catch (e: unknown) {
      console.debug(e);
    }
  }

  private async fetchSearchValues() {
    try {
      const [crawlValues, workflowValues, uploadValues] = await Promise.all([
        this.getSearchValues("crawl"),
        this.getSearchValues("workflow"),
        this.getSearchValues("upload"),
      ]);
      this.crawlSearchValues = merge(crawlValues, workflowValues);
      this.uploadSearchValues = uploadValues;
    } catch (e: unknown) {
      console.debug(e);
    }
  }

  private async getCrawls(
    params: {
      userid?: string;
      collectionId?: string;
      firstSeed?: string;
    } & APIPaginationQuery &
      APISortQuery = {},
  ) {
    const query = queryString.stringify(
      {
        state: finishedCrawlStates,
        ...params,
      },
      {
        arrayFormat: "comma",
      },
    );
    const data = await this.api.fetch<APIPaginatedList<Crawl>>(
      `/orgs/${this.orgId}/crawls?${query}`,
      this.authState!,
    );

    return data;
  }

  private async getWorkflows(
    params: {
      userid?: string;
      name?: string;
      firstSeed?: string;
    } & APIPaginationQuery &
      APISortQuery = {},
  ) {
    const query = queryString.stringify({
      ...params,
    });
    const data = await this.api.fetch<APIPaginatedList<Workflow>>(
      `/orgs/${this.orgId}/crawlconfigs?${query}`,
      this.authState!,
    );

    return data;
  }

  private async getUploads(
    params: {
      userid?: string;
      collectionId?: string;
      name?: string;
    } & APIPaginationQuery &
      APISortQuery = {},
  ) {
    const query = queryString.stringify({
      state: "complete",
      ...params,
    });
    const data = await this.api.fetch<APIPaginatedList<Upload>>(
      `/orgs/${this.orgId}/uploads?${query}`,
      this.authState!,
    );

    return data;
  }

  private async getSearchValues(searchType: "crawl" | "upload" | "workflow") {
    if (searchType === "workflow") {
      return this.api.fetch<SearchValues>(
        `/orgs/${this.orgId}/crawlconfigs/search-values`,
        this.authState!,
      );
    }
    return this.api.fetch<SearchValues>(
      `/orgs/${this.orgId}/all-crawls/search-values?crawlType=${searchType}`,
      this.authState!,
    );
  }

  private async saveAutoAdd({
    id,
    autoAddCollections,
  }: Pick<Workflow, "id" | "autoAddCollections">) {
    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/crawlconfigs/${id}`,
        this.authState!,
        {
          method: "PATCH",
          body: JSON.stringify({
            autoAddCollections: autoAddCollections,
          }),
        },
      );
      this.notify.toast({
        message: msg(str`Updated.`),
        variant: "success",
        icon: "check2-circle",
        duration: 1000,
      });
    } catch (e: unknown) {
      console.debug(e);
      this.notify.toast({
        message: msg(
          "Something unexpected went wrong, couldn't save auto-add setting.",
        ),
        variant: "warning",
        icon: "exclamation-circle",
      });
    }
  }
}
