import { localized, msg, str } from "@lit/localize";
import type { SlCheckbox } from "@shoelace-style/shoelace";
import { type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import type { ListWorkflow, Seed, Workflow, WorkflowParams } from "./types";

import type { SelectNewDialogEvent } from ".";

import { CopyButton } from "@/components/ui/copy-button";
import type { PageChangeEvent } from "@/components/ui/pagination";
import { type SelectEvent } from "@/components/ui/search-combobox";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import { isApiError } from "@/utils/api";
import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";

type SearchFields = "name" | "firstSeed";
type SortField = "lastRun" | "name" | "firstSeed" | "created" | "modified";
type SortDirection = "asc" | "desc";

const FILTER_BY_CURRENT_USER_STORAGE_KEY =
  "btrix.filterByCurrentUser.crawlConfigs";
const INITIAL_PAGE_SIZE = 10;
const POLL_INTERVAL_SECONDS = 10;
const ABORT_REASON_THROTTLE = "throttled";
// NOTE Backend pagination max is 1000
const SEEDS_MAX = 1000;

const sortableFields: Record<
  SortField,
  { label: string; defaultDirection?: SortDirection }
> = {
  lastRun: {
    label: msg("Latest Crawl"),
    defaultDirection: "desc",
  },
  modified: {
    label: msg("Last Modified"),
    defaultDirection: "desc",
  },
  name: {
    label: msg("Name"),
    defaultDirection: "asc",
  },
  firstSeed: {
    label: msg("Crawl Start URL"),
    defaultDirection: "asc",
  },
  created: {
    label: msg("Created"),
    defaultDirection: "desc",
  },
};

/**
 * Usage:
 * ```ts
 * <btrix-workflows-list></btrix-workflows-list>
 * ```
 */
@localized()
@customElement("btrix-workflows-list")
export class WorkflowsList extends LiteElement {
  static FieldLabels: Record<SearchFields, string> = {
    name: msg("Name"),
    firstSeed: msg("Crawl Start URL"),
  };

  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: Boolean })
  orgStorageQuotaReached = false;

  @property({ type: Boolean })
  orgExecutionMinutesQuotaReached = false;

  @property({ type: String })
  userId!: string;

  @property({ type: Boolean })
  isCrawler!: boolean;

  @state()
  private workflows?: APIPaginatedList<ListWorkflow>;

  @state()
  private searchOptions: { [x: string]: string }[] = [];

  @state()
  private isFetching = false;

  @state()
  private fetchErrorStatusCode?: number;

  @state()
  private orderBy: {
    field: SortField;
    direction: SortDirection;
  } = {
    field: "lastRun",
    direction: sortableFields["lastRun"].defaultDirection!,
  };

  @state()
  private filterBy: Partial<{ [k in keyof ListWorkflow]: boolean }> = {};

  @state()
  private filterByCurrentUser = false;

  // For fuzzy search:
  private readonly searchKeys = ["name", "firstSeed"];

  // Use to cancel requests
  private getWorkflowsController: AbortController | null = null;
  private timerId?: number;

  private get selectedSearchFilterKey() {
    return Object.keys(WorkflowsList.FieldLabels).find((key) =>
      Boolean((this.filterBy as Record<string, unknown>)[key]),
    );
  }

  constructor() {
    super();
    this.filterByCurrentUser =
      window.sessionStorage.getItem(FILTER_BY_CURRENT_USER_STORAGE_KEY) ===
      "true";
  }

  protected async willUpdate(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ) {
    if (changedProperties.has("orgId")) {
      void this.fetchConfigSearchValues();
    }
    if (
      changedProperties.has("orgId") ||
      changedProperties.has("orderBy") ||
      changedProperties.has("filterByCurrentUser") ||
      changedProperties.has("filterByScheduled") ||
      changedProperties.has("filterBy")
    ) {
      void this.fetchWorkflows({
        page: changedProperties.has("orgId") ? 1 : undefined,
      });
    }
    if (changedProperties.has("filterByCurrentUser")) {
      window.sessionStorage.setItem(
        FILTER_BY_CURRENT_USER_STORAGE_KEY,
        this.filterByCurrentUser.toString(),
      );
    }
  }

  disconnectedCallback(): void {
    this.cancelInProgressGetWorkflows();
    super.disconnectedCallback();
  }

  private async fetchWorkflows(params?: APIPaginationQuery) {
    this.fetchErrorStatusCode = undefined;

    this.cancelInProgressGetWorkflows();
    this.isFetching = true;
    try {
      const workflows = await this.getWorkflows(params);
      this.workflows = workflows;
    } catch (e) {
      if (isApiError(e)) {
        this.fetchErrorStatusCode = e.statusCode;
      } else if ((e as Error).name === "AbortError") {
        console.debug("Fetch archived items aborted to throttle");
      } else {
        this.notify({
          message: msg("Sorry, couldn't retrieve Workflows at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
    this.isFetching = false;

    // Restart timer for next poll
    this.timerId = window.setTimeout(() => {
      void this.fetchWorkflows();
    }, 1000 * POLL_INTERVAL_SECONDS);
  }

  private cancelInProgressGetWorkflows() {
    window.clearTimeout(this.timerId);
    if (this.getWorkflowsController) {
      this.getWorkflowsController.abort(ABORT_REASON_THROTTLE);
      this.getWorkflowsController = null;
    }
  }

  render() {
    return html`
      <header class="contents">
        <div class="mb-4 flex w-full justify-between">
          <h1 class="text-xl font-semibold leading-8">
            ${msg("Crawl Workflows")}
          </h1>
          ${when(
            this.isCrawler,
            () => html`
              <sl-button
                variant="primary"
                size="small"
                @click=${() => {
                  this.dispatchEvent(
                    new CustomEvent("select-new-dialog", {
                      detail: "workflow",
                    }) as SelectNewDialogEvent,
                  );
                }}
              >
                <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                ${msg("New Workflow")}
              </sl-button>
            `,
          )}
        </div>
        <div class="sticky top-2 z-10 mb-3 rounded-lg border bg-neutral-50 p-4">
          ${this.renderControls()}
        </div>
      </header>

      ${when(
        this.fetchErrorStatusCode,
        () => html`
          <div>
            <btrix-alert variant="danger">
              ${msg(
                `Something unexpected went wrong while retrieving Workflows.`,
              )}
            </btrix-alert>
          </div>
        `,
        () =>
          this.workflows
            ? this.workflows.total
              ? this.renderWorkflowList()
              : this.renderEmptyState()
            : this.renderLoading(),
      )}
    `;
  }

  private renderControls() {
    return html`
      <div class="mb-2 flex flex-wrap items-center gap-2 md:gap-4">
        <div class="grow">${this.renderSearch()}</div>

        <div class="flex w-full items-center md:w-fit">
          <div class="mr-2 whitespace-nowrap text-sm text-0-500">
            ${msg("Sort by:")}
          </div>
          <sl-select
            class="flex-1 md:min-w-[9.2rem]"
            size="small"
            pill
            value=${this.orderBy.field}
            @sl-change=${(e: Event) => {
              const field = (e.target as HTMLSelectElement).value as SortField;
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

      <div class="flex flex-wrap items-center justify-between">
        <div class="text-sm">
          <button
            class="${this.filterBy.schedule === undefined
              ? "border-b-current text-primary"
              : "text-neutral-500"} mr-3 inline-block border-b-2 border-transparent font-medium"
            aria-selected=${this.filterBy.schedule === undefined}
            @click=${() =>
              (this.filterBy = {
                ...this.filterBy,
                schedule: undefined,
              })}
          >
            ${msg("All")}
          </button>
          <button
            class="${this.filterBy.schedule === true
              ? "border-b-current text-primary"
              : "text-neutral-500"} mr-3 inline-block border-b-2 border-transparent font-medium"
            aria-selected=${this.filterBy.schedule === true}
            @click=${() =>
              (this.filterBy = {
                ...this.filterBy,
                schedule: true,
              })}
          >
            ${msg("Scheduled")}
          </button>
          <button
            class="${this.filterBy.schedule === false
              ? "border-b-current text-primary"
              : "text-neutral-500"} mr-3 inline-block border-b-2 border-transparent font-medium"
            aria-selected=${this.filterBy.schedule === false}
            @click=${() =>
              (this.filterBy = {
                ...this.filterBy,
                schedule: false,
              })}
          >
            ${msg("No schedule")}
          </button>
        </div>
        <div class="flex items-center justify-end">
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
        </div>
      </div>
    `;
  }

  private renderSearch() {
    return html`
      <btrix-search-combobox
        .searchKeys=${this.searchKeys}
        .searchOptions=${this.searchOptions}
        .keyLabels=${WorkflowsList.FieldLabels}
        selectedKey=${ifDefined(this.selectedSearchFilterKey)}
        placeholder=${msg("Search all Workflows by name or Crawl Start URL")}
        @btrix-select=${(e: SelectEvent<typeof this.searchKeys>) => {
          const { key, value } = e.detail;
          if (key == null) return;
          this.filterBy = {
            [key]: value,
          };
        }}
        @btrix-clear=${() => {
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

  private renderWorkflowList() {
    if (!this.workflows) return;
    const { page, total, pageSize } = this.workflows;
    return html`
      <btrix-workflow-list>
        ${this.workflows.items.map(this.renderWorkflowItem)}
      </btrix-workflow-list>
      ${when(
        total > pageSize,
        () => html`
          <footer class="mt-6 flex justify-center">
            <btrix-pagination
              page=${page}
              totalCount=${total}
              size=${pageSize}
              @page-change=${async (e: PageChangeEvent) => {
                await this.fetchWorkflows({
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

  private readonly renderWorkflowItem = (workflow: ListWorkflow) => html`
    <btrix-workflow-list-item
      orgSlug=${this.appState.orgSlug || ""}
      .workflow=${workflow}
    >
      <sl-menu slot="menu">${this.renderMenuItems(workflow)}</sl-menu>
    </btrix-workflow-list-item>
  `;

  private renderMenuItems(workflow: ListWorkflow) {
    return html`
      ${when(
        workflow.isCrawlRunning && this.isCrawler,
        // HACK shoelace doesn't current have a way to override non-hover
        // color without resetting the --sl-color-neutral-700 variable
        () => html`
          <sl-menu-item
            @click=${() => void this.stop(workflow.lastCrawlId)}
            ?disabled=${workflow.lastCrawlStopping}
          >
            <sl-icon name="dash-square" slot="prefix"></sl-icon>
            ${msg("Stop Crawl")}
          </sl-menu-item>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${() => void this.cancel(workflow.lastCrawlId)}
          >
            <sl-icon name="x-octagon" slot="prefix"></sl-icon>
            ${msg("Cancel & Discard Crawl")}
          </sl-menu-item>
        `,
      )}
      ${when(
        this.isCrawler && !workflow.isCrawlRunning,
        () => html`
          <sl-menu-item
            style="--sl-color-neutral-700: var(--success)"
            ?disabled=${this.orgStorageQuotaReached ||
            this.orgExecutionMinutesQuotaReached}
            @click=${() => void this.runNow(workflow)}
          >
            <sl-icon name="play" slot="prefix"></sl-icon>
            ${msg("Run Crawl")}
          </sl-menu-item>
        `,
      )}
      ${when(
        workflow.isCrawlRunning && this.isCrawler,
        // HACK shoelace doesn't current have a way to override non-hover
        // color without resetting the --sl-color-neutral-700 variable
        () => html`
          <sl-divider></sl-divider>
          <sl-menu-item
            @click=${() =>
              this.navTo(
                `${this.orgBasePath}/workflows/crawl/${workflow.id}#watch`,
                {
                  dialog: "scale",
                },
              )}
          >
            <sl-icon name="plus-slash-minus" slot="prefix"></sl-icon>
            ${msg("Edit Crawler Instances")}
          </sl-menu-item>
          <sl-menu-item
            @click=${() =>
              this.navTo(
                `${this.orgBasePath}/workflows/crawl/${workflow.id}#watch`,
                {
                  dialog: "exclusions",
                },
              )}
          >
            <sl-icon name="table" slot="prefix"></sl-icon>
            ${msg("Edit Exclusions")}
          </sl-menu-item>
          <sl-divider></sl-divider>
        `,
      )}
      ${when(
        this.isCrawler,
        () =>
          html` <sl-divider></sl-divider>
            <sl-menu-item
              @click=${() =>
                this.navTo(
                  `${this.orgBasePath}/workflows/crawl/${workflow.id}?edit`,
                )}
            >
              <sl-icon name="gear" slot="prefix"></sl-icon>
              ${msg("Edit Workflow Settings")}
            </sl-menu-item>`,
      )}
      <sl-menu-item
        @click=${() => CopyButton.copyToClipboard(workflow.tags.join(", "))}
        ?disabled=${!workflow.tags.length}
      >
        <sl-icon name="tags" slot="prefix"></sl-icon>
        ${msg("Copy Tags")}
      </sl-menu-item>
      ${when(
        this.isCrawler,
        () =>
          html` <sl-menu-item
            @click=${() => void this.duplicateConfig(workflow)}
          >
            <sl-icon name="files" slot="prefix"></sl-icon>
            ${msg("Duplicate Workflow")}
          </sl-menu-item>`,
      )}
    `;
  }

  private renderName(crawlConfig: ListWorkflow) {
    if (crawlConfig.name) return crawlConfig.name;
    const { firstSeed, seedCount } = crawlConfig;
    if (seedCount === 1) {
      return firstSeed;
    }
    const remainderCount = seedCount - 1;
    if (remainderCount === 1) {
      return msg(
        html`${firstSeed}
          <span class="text-neutral-500">+${remainderCount} URL</span>`,
      );
    }
    return msg(
      html`${firstSeed}
        <span class="text-neutral-500">+${remainderCount} URLs</span>`,
    );
  }

  private renderEmptyState() {
    if (Object.keys(this.filterBy).length) {
      return html`
        <div class="rounded-lg border bg-neutral-50 p-4">
          <p class="text-center">
            <span class="text-neutral-400"
              >${msg("No matching Workflows found.")}</span
            >
            <button
              class="font-medium text-neutral-500 underline hover:no-underline"
              @click=${() => {
                this.filterBy = {};
              }}
            >
              ${msg("Clear search and filters")}
            </button>
          </p>
        </div>
      `;
    }

    if (this.workflows?.page && this.workflows.page > 1) {
      return html`
        <div class="border-b border-t py-5">
          <p class="text-center text-neutral-500">
            ${msg("Could not find page.")}
          </p>
        </div>
      `;
    }

    if (this.isFetching) {
      return this.renderLoading();
    }

    return html`
      <div class="border-b border-t py-5">
        <p class="text-center text-neutral-500">${msg("No Workflows yet.")}</p>
      </div>
    `;
  }

  private renderLoading() {
    return html`<div
      class="my-24 flex w-full items-center justify-center text-3xl"
    >
      <sl-spinner></sl-spinner>
    </div>`;
  }

  /**
   * Fetch Workflows and update state
   **/
  private async getWorkflows(
    queryParams?: APIPaginationQuery & Record<string, unknown>,
  ) {
    const query = queryString.stringify(
      {
        ...this.filterBy,
        page: queryParams?.page || this.workflows?.page || 1,
        pageSize:
          queryParams?.pageSize ||
          this.workflows?.pageSize ||
          INITIAL_PAGE_SIZE,
        userid: this.filterByCurrentUser ? this.userId : undefined,
        sortBy: this.orderBy.field,
        sortDirection: this.orderBy.direction === "desc" ? -1 : 1,
      },
      {
        arrayFormat: "comma",
      },
    );

    this.getWorkflowsController = new AbortController();
    const data = await this.apiFetch<APIPaginatedList<Workflow>>(
      `/orgs/${this.orgId}/crawlconfigs?${query}`,
      this.authState!,
      {
        signal: this.getWorkflowsController.signal,
      },
    );
    this.getWorkflowsController = null;

    return data;
  }

  /**
   * Create a new template using existing template data
   */
  private async duplicateConfig(workflow: ListWorkflow) {
    const [fullWorkflow, seeds] = await Promise.all([
      this.getWorkflow(workflow),
      this.getSeeds(workflow),
    ]);

    const workflowParams: WorkflowParams = {
      ...fullWorkflow,
      name: workflow.name ? msg(str`${workflow.name} Copy`) : "",
    };

    this.navTo(
      `${this.orgBasePath}/workflows?new&jobType=${workflowParams.jobType}`,
      {
        workflow: workflowParams,
        seeds: seeds.items,
      },
    );

    if (seeds.total > SEEDS_MAX) {
      this.notify({
        title: msg(str`Partially copied Workflow`),
        message: msg(
          str`Only first ${SEEDS_MAX.toLocaleString()} URLs were copied.`,
        ),
        variant: "warning",
        icon: "exclamation-triangle",
      });
    } else {
      this.notify({
        message: msg(str`Copied Workflow to new template.`),
        variant: "success",
        icon: "check2-circle",
      });
    }
  }

  private async deactivate(workflow: ListWorkflow): Promise<void> {
    try {
      await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${workflow.id}`,
        this.authState!,
        {
          method: "DELETE",
        },
      );

      void this.fetchWorkflows();
      this.notify({
        message: msg(
          html`Deactivated <strong>${this.renderName(workflow)}</strong>.`,
        ),
        variant: "success",
        icon: "check2-circle",
      });
    } catch {
      this.notify({
        message: msg("Sorry, couldn't deactivate Workflow at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async delete(workflow: ListWorkflow): Promise<void> {
    try {
      await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${workflow.id}`,
        this.authState!,
        {
          method: "DELETE",
        },
      );

      void this.fetchWorkflows();
      this.notify({
        message: msg(
          html`Deleted <strong>${this.renderName(workflow)}</strong>.`,
        ),
        variant: "success",
        icon: "check2-circle",
      });
    } catch {
      this.notify({
        message: msg("Sorry, couldn't delete Workflow at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async cancel(crawlId: ListWorkflow["lastCrawlId"]) {
    if (!crawlId) return;
    if (window.confirm(msg("Are you sure you want to cancel the crawl?"))) {
      const data = await this.apiFetch<{ success: boolean }>(
        `/orgs/${this.orgId}/crawls/${crawlId}/cancel`,
        this.authState!,
        {
          method: "POST",
        },
      );
      if (data.success) {
        void this.fetchWorkflows();
      } else {
        this.notify({
          message: msg("Something went wrong, couldn't cancel crawl."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async stop(crawlId: ListWorkflow["lastCrawlId"]) {
    if (!crawlId) return;
    if (window.confirm(msg("Are you sure you want to stop the crawl?"))) {
      const data = await this.apiFetch<{ success: boolean }>(
        `/orgs/${this.orgId}/crawls/${crawlId}/stop`,
        this.authState!,
        {
          method: "POST",
        },
      );
      if (data.success) {
        void this.fetchWorkflows();
      } else {
        this.notify({
          message: msg("Something went wrong, couldn't stop crawl."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async runNow(workflow: ListWorkflow): Promise<void> {
    try {
      await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${workflow.id}/run`,
        this.authState!,
        {
          method: "POST",
        },
      );

      this.notify({
        message: msg(
          html`Started crawl from <strong>${this.renderName(workflow)}</strong>.
            <br />
            <a
              class="underline hover:no-underline"
              href="${this.orgBasePath}/workflows/crawl/${workflow.id}#watch"
              @click=${this.navLink.bind(this)}
              >Watch crawl</a
            >`,
        ),
        variant: "success",
        icon: "check2-circle",
        duration: 8000,
      });

      await this.fetchWorkflows();
      // Scroll to top of list
      this.scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      let message = msg("Sorry, couldn't run crawl at this time.");
      if (isApiError(e) && e.statusCode === 403) {
        if (e.details === "storage_quota_reached") {
          message = msg("Your org does not have enough storage to run crawls.");
        } else if (e.details === "exec_minutes_quota_reached") {
          message = msg(
            "Your org has used all of its execution minutes for this month.",
          );
        } else {
          message = msg("You do not have permission to run crawls.");
        }
      }
      this.notify({
        message: message,
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async fetchConfigSearchValues() {
    try {
      const data: {
        crawlIds: string[];
        names: string[];
        descriptions: string[];
        firstSeeds: string[];
      } = await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/search-values`,
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

  private async getWorkflow(workflow: ListWorkflow): Promise<Workflow> {
    const data: Workflow = await this.apiFetch(
      `/orgs/${this.orgId}/crawlconfigs/${workflow.id}`,
      this.authState!,
    );
    return data;
  }

  private async getSeeds(workflow: ListWorkflow) {
    // NOTE Returns first 1000 seeds (backend pagination max)
    const data = await this.apiFetch<APIPaginatedList<Seed>>(
      `/orgs/${this.orgId}/crawlconfigs/${workflow.id}/seeds`,
      this.authState!,
    );
    return data;
  }
}
