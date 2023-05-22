import type { TemplateResult } from "lit";
import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import { until } from "lit/directives/until.js";
import { mergeDeep } from "immutable";
import omit from "lodash/fp/omit";
import groupBy from "lodash/fp/groupBy";
import type {
  SlTextarea,
  SlCheckbox,
  SlInput,
  SlIconButton,
} from "@shoelace-style/shoelace";
import queryString from "query-string";

import type {
  CheckboxChangeEvent,
  CheckboxGroupList,
} from "../../components/checkbox-list";
import type { MarkdownChangeEvent } from "../../components/markdown-editor";
import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { APIPaginatedList } from "../../types/api";
import type { Crawl, CrawlState, Workflow } from "./types";

const TABS = ["crawls", "metadata"] as const;
type Tab = (typeof TABS)[number];
type Collection = {
  name: string;
  description: string | null;
  crawlIds: string[];
};
type FormState = {
  name: string;
  description: string | null;
  workflows: any[];
};
const finishedCrawlStates: CrawlState[] = [
  "complete",
  "partial_complete",
  "timed_out",
];

@localized()
export class CollectionsNew extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @state()
  private collection?: Collection;

  @state()
  private workflows?: APIPaginatedList & {
    items: Workflow[];
  };

  @state()
  private workflowCrawls: {
    [workflowId: string]: Promise<Crawl[]>;
  } = {};

  @state()
  private selectedCrawls: {
    [crawlId: string]: Crawl;
  } = {};

  @state()
  private activeTab: Tab = TABS[0];

  @state()
  private formState: FormState = {
    name: "",
    description: "",
    workflows: [],
  };

  @state()
  private isSubmitting = false;

  @state()
  private serverError?: string;

  // TODO localize
  private numberFormatter = new Intl.NumberFormat(undefined, {
    notation: "compact",
  });

  private readonly tabLabels: Record<Tab, string> = {
    crawls: msg("Select Crawls"),
    metadata: msg("Metadata"),
  };

  protected async willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("orgId") && this.orgId) {
      this.fetchWorkflows();
    }
  }

  connectedCallback(): void {
    // Set initial active section and dialog based on URL #hash value
    this.getActivePanelFromHash();
    super.connectedCallback();
    window.addEventListener("hashchange", this.getActivePanelFromHash);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this.getActivePanelFromHash);
  }

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
    return html`<form name="newCollection" @submit=${this.onSubmit}>
      <btrix-tab-list
        activePanel="newCollection-${this.activeTab}"
        progressPanel="newCollection-${this.activeTab}"
      >
        <h3 slot="header" class="font-semibold">
          ${this.tabLabels[this.activeTab]}
        </h3>

        ${TABS.map(this.renderTab)}

        <btrix-tab-panel name="newCollection-crawls">
          ${this.renderSelectCrawls()}
        </btrix-tab-panel>
        <btrix-tab-panel name="newCollection-metadata">
          ${this.renderMetadata()}
        </btrix-tab-panel>
      </btrix-tab-list>
    </form>`;
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
        @click=${() => this.goToTab(tab)}
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

  private renderSelectCrawls() {
    return html`
      <section class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section class="col-span-1 flex flex-col">
          <h4 class="text-base font-semibold mb-3">
            ${msg("Crawls in Collection")}
          </h4>
          <div class="border rounded-lg py-2 flex-1">
            ${this.renderCollectionWorkflows()}
          </div>
        </section>
        <section class="col-span-1 flex flex-col">
          <h4 class="text-base font-semibold mb-3">${msg("All Workflows")}</h4>
          <div class="flex-0 border rounded bg-neutral-50 p-2 mb-2">
            TODO controls
          </div>
          <div class="flex-1">${this.renderWorkflows()}</div>
        </section>
        <footer
          class="col-span-1 md:col-span-2 border rounded-lg px-6 py-4 flex justify-between"
        >
          <sl-button
            variant="primary"
            size="small"
            class="ml-auto"
            @click=${() => this.goToTab("metadata")}
          >
            <sl-icon slot="suffix" name="chevron-right"></sl-icon>
            ${msg("Next Step")}
          </sl-button>
        </footer>
      </section>
    `;
  }

  private renderMetadata() {
    return html`
      <section class="border rounded-lg">
        <div class="p-6 grid grid-cols-5 gap-4">
          ${this.renderFormCol(html`
            <sl-input
              class="mb-4"
              name="name"
              label=${msg("Name")}
              autocomplete="off"
              placeholder=${msg("My Collection")}
              value=${this.formState.name}
              required
              @sl-change=${(e: CustomEvent) => {
                const inputEl = e.target as SlInput;
                this.updateFormState({
                  [inputEl.name]: inputEl.value,
                });
              }}
            ></sl-input>
          `)}
          ${this.renderHelpTextCol(msg("TODO"))}
          ${this.renderFormCol(html`
            <h4 class="form-label">${msg("Description")}</h4>
            <btrix-markdown-editor
              initialValue=${this.formState.description}
              @on-change=${(e: MarkdownChangeEvent) => {
                this.updateFormState({
                  description: e.detail.value,
                });
              }}
            ></btrix-markdown-editor>
          `)}
          ${this.renderHelpTextCol(msg("TODO"))}
        </div>
        <footer class="border-t px-6 py-4 flex justify-between">
          <sl-button size="small" @click=${() => this.goToTab("crawls")}>
            <sl-icon slot="prefix" name="chevron-left"></sl-icon>
            ${msg("Previous Step")}
          </sl-button>
          <sl-button
            type="submit"
            size="small"
            variant="primary"
            ?disabled=${this.isSubmitting}
            ?loading=${this.isSubmitting}
          >
            ${msg("Save New Collection")}
          </sl-button>
        </footer>
      </section>
    `;
  }

  private renderCollectionWorkflows() {
    // TODO show crawls in collection
    const crawls = Object.values(this.selectedCrawls);
    if (!crawls.length) {
      return html`
        <div class="flex flex-col items-center justify-center text-center p-4">
          <span class="text-base font-semibold text-primary"
            >${msg("Add Crawls to This Collection")}</span
          >
          <p class="max-w-[24em] mx-auto mt-4">
            ${msg(
              "Select entire Workflows or individual Crawls. You can always come back and add Crawls later."
            )}
          </p>
        </div>
      `;
    }
    const groupedByWorkflow = groupBy("cid")(crawls);

    return html`
      <btrix-checkbox-list>
        ${Object.keys(groupedByWorkflow).map((workflowId) =>
          until(
            this.workflowCrawls[workflowId].then((crawls) =>
              this.renderWorkflowCrawls(
                workflowId,
                // TODO show crawls in collection
                crawls
              )
            )
          )
        )}
      </btrix-checkbox-list>
    `;
  }

  private renderWorkflows() {
    if (!this.workflows) {
      return html`
        <div class="w-full flex items-center justify-center my-24 text-3xl">
          <sl-spinner></sl-spinner>
        </div>
      `;
    }

    return html`
      <btrix-checkbox-list>
        ${this.workflows.items.map((workflow) =>
          this.renderWorkflowItem(workflow)
        )}
      </btrix-checkbox-list>
    `;
  }

  private renderFormCol = (content: TemplateResult) => {
    return html`<div class="col-span-5 md:col-span-3">${content}</div> `;
  };

  private renderHelpTextCol(content: TemplateResult | string, padTop = true) {
    return html`
      <div class="col-span-5 md:col-span-2 flex${padTop ? " pt-6" : ""}">
        <div class="text-base mr-2">
          <sl-icon name="info-circle"></sl-icon>
        </div>
        <div class="mt-0.5 text-xs text-neutral-500">${content}</div>
      </div>
    `;
  }

  // TODO consolidate collections/workflow name
  private renderWorkflowName(workflow: Workflow) {
    if (workflow.name)
      return html`<span class="truncate">${workflow.name}</span>`;
    if (!workflow.firstSeed)
      return html`<span class="truncate">${workflow.id}</span>`;
    return this.renderSeedsLabel(
      workflow.firstSeed,
      workflow.config.seeds.length
    );
  }

  private renderSeedsLabel(firstSeed: string, seedCount: number) {
    let nameSuffix: any = "";
    const remainder = seedCount - 1;
    if (remainder) {
      if (remainder === 1) {
        nameSuffix = html`<span class="ml-1 text-neutral-500"
          >${msg(str`+${remainder} URL`)}</span
        >`;
      } else {
        nameSuffix = html`<span class="ml-1 text-neutral-500"
          >${msg(str`+${remainder} URLs`)}</span
        >`;
      }
    }
    return html`
      <span class="inline-block truncate">${firstSeed}</span>${nameSuffix}
    `;
  }

  private renderWorkflowCrawls(workflowId: string, crawls: Crawl[]) {
    const selectedCrawlIds = Object.keys(this.selectedCrawls).filter((id) =>
      crawls.some((crawl) => id === crawl.id)
    );
    const allChecked = crawls.length === selectedCrawlIds.length;
    // Use latest crawl for workflow information, since we
    // may not have access to workflow details
    const firstCrawl = crawls[0];

    return html`
      <btrix-checkbox-list-item
        ?checked=${selectedCrawlIds.length}
        ?allChecked=${allChecked}
        group
        aria-controls=${selectedCrawlIds.join(" ")}
        @on-change=${(e: CheckboxChangeEvent) => {
          const checkAll = () => {
            const allCrawls = crawls.reduce(
              (acc: any, crawl: Crawl) => ({
                ...acc,
                [crawl.id]: crawl,
              }),
              {}
            );
            this.selectedCrawls = mergeDeep(this.selectedCrawls, allCrawls);
          };
          if (e.detail.checked) {
            checkAll();
          } else if (allChecked) {
            this.selectedCrawls = omit(crawls.map(({ id }) => id))(
              this.selectedCrawls
            ) as any;
          } else {
            checkAll();
          }
        }}
      >
        <div class="grid grid-cols-[1fr_4rem_2.5rem] gap-3 items-center">
          <div class="truncate">
            ${this.renderSeedsLabel(firstCrawl.firstSeed, firstCrawl.seedCount)}
          </div>
          <div class="text-neutral-500 text-xs font-monostyle truncate h-4">
            ${crawls.length === 1
              ? msg("1 crawl")
              : msg(`${this.numberFormatter.format(crawls.length)} crawls`)}
          </div>
          <div class="col-span-1 border-l flex items-center justify-center">
            <btrix-button
              class="expandBtn p-2 text-base"
              aria-expanded="true"
              aria-controls=${`workflow-${workflowId}`}
              @click=${this.onWorkflowExpandClick(workflowId, crawls.length)}
              icon
            >
              <sl-icon name="chevron-double-down"></sl-icon>
            </btrix-button>
          </div>
        </div>
        <div
          id=${`workflow-${workflowId}-group`}
          slot="group"
          class="checkboxGroup transition-all overflow-hidden"
        >
          <btrix-checkbox-group-list>
            ${crawls.map((crawl) => this.renderCrawl(crawl, workflowId))}
          </btrix-checkbox-group-list>
        </div>
      </btrix-checkbox-list-item>
    `;
  }

  private renderCrawl(crawl: Crawl, workflowId?: string) {
    return html`
      <btrix-checkbox-list-item
        id=${crawl.id}
        ?checked=${this.selectedCrawls[crawl.id]}
        @on-change=${(e: CheckboxChangeEvent) => {
          if (e.detail.checked) {
            this.selectedCrawls = mergeDeep(this.selectedCrawls, {
              [crawl.id]: crawl,
            });
          } else {
            this.selectedCrawls = omit([crawl.id])(this.selectedCrawls) as any;
          }
        }}
      >
        <div class="flex items-center">
          <btrix-crawl-status
            state=${crawl.state}
            hideLabel
          ></btrix-crawl-status>
          <div class="flex-1">
            ${
              workflowId
                ? html`<sl-format-date
                    date=${`${crawl.finished}Z`}
                    month="2-digit"
                    day="2-digit"
                    year="2-digit"
                    hour="2-digit"
                    minute="2-digit"
                  ></sl-format-date>`
                : this.renderSeedsLabel(crawl.firstSeed, crawl.seedCount)
            }
          </div>
          <sl-format-bytes
            class="w-14 text-xs font-monostyle"
            value=${crawl.fileSize || 0}
            display="narrow"
          ></sl-format-bytes>
          <div class="w-16 text-neutral-500  font-monostyle truncate">
            <sl-tooltip content=${msg("Pages in crawl")}>
              <div class="flex items-center">
                <sl-icon
                  class="text-base"
                  name="file-earmark-richtext"
                ></sl-icon>
                <div class="ml-1 text-xs">
                  ${this.numberFormatter.format(+(crawl.stats?.done || 0))}
                </span>
              </div>
            </sl-tooltip>
          </div>
        </div>
      </btrix-checkbox-list-item>
    `;
  }

  private renderWorkflowItem(workflow: Workflow) {
    const workflowCrawlsAsync =
      this.workflowCrawls[workflow.id] || Promise.resolve([]);
    const someSelectedAsync = workflowCrawlsAsync.then((crawls) => {
      return crawls.some(({ id }) => this.selectedCrawls[id]);
    });

    return html`
      <btrix-checkbox-list-item
        ?checked=${until(someSelectedAsync, false)}
        @on-change=${async (e: CheckboxChangeEvent) => {
          this.fetchCrawls(workflow.id);
          const workflowCrawls = await this.workflowCrawls[workflow.id];

          if (e.detail.checked) {
            this.selectedCrawls = mergeDeep(
              this.selectedCrawls,
              workflowCrawls.reduce(
                (acc: any, crawl: Crawl) => ({
                  ...acc,
                  [crawl.id]: crawl,
                }),
                {}
              )
            );
          } else {
            this.selectedCrawls = omit(workflowCrawls.map(({ id }) => id))(
              this.selectedCrawls
            ) as any;
          }
        }}
      >
        <div class="grid grid-cols-[1fr_10ch] gap-3">
          ${this.renderWorkflowDetails(workflow)}
        </div>
      </btrix-checkbox-list-item>
    `;
  }

  private renderWorkflowDetails(workflow: Workflow) {
    return html`
      <div class="col-span-1 py-3 whitespace-nowrap truncate">
        <div class="text-neutral-700 h-6">
          ${this.renderWorkflowName(workflow)}
        </div>
        <div class="text-neutral-500 text-xs font-monostyle truncate h-4">
          <sl-format-date
            date=${workflow.lastCrawlTime}
            month="2-digit"
            day="2-digit"
            year="2-digit"
            hour="2-digit"
            minute="2-digit"
          ></sl-format-date>
        </div>
      </div>
      <div class="col-span-1 py-3">
        <div class="text-neutral-700 truncate h-6">
          <sl-format-bytes
            value=${workflow.totalSize}
            display="narrow"
          ></sl-format-bytes>
        </div>
        <div class="text-neutral-500 text-xs font-monostyle truncate h-4">
          ${workflow.crawlCount === 1
            ? msg("1 crawl")
            : msg(
                str`${this.numberFormatter.format(workflow.crawlCount)} crawls`
              )}
        </div>
      </div>
    `;
  }

  private onWorkflowExpandClick =
    (workflowId: string, crawlCount: number) => async (e: MouseEvent) => {
      e.stopPropagation();
      const checkboxGroup = this.querySelector(
        `#workflow-${workflowId}-group`
      ) as HTMLElement;
      const expandBtn = e.currentTarget as HTMLElement;
      const expanded = !(expandBtn.getAttribute("aria-expanded") === "true");
      expandBtn.setAttribute("aria-expanded", expanded.toString());

      if (expanded) {
        checkboxGroup.style.marginTop = "0px";
        checkboxGroup.style.opacity = "100%";
        checkboxGroup.style.pointerEvents = "auto";
      } else {
        checkboxGroup.style.marginTop = `-${checkboxGroup.clientHeight}px`;
        checkboxGroup.style.opacity = "0";
        checkboxGroup.style.pointerEvents = "none";
      }
    };

  private getActivePanelFromHash = () => {
    const hashValue = window.location.hash.slice(1);
    if (TABS.includes(hashValue as any)) {
      this.activeTab = hashValue as Tab;
    } else {
      this.goToTab(TABS[0], { replace: true });
    }
  };

  private goToTab(tab: Tab, { replace = false } = {}) {
    const path = `${window.location.href.split("#")[0]}#${tab}`;
    if (replace) {
      window.history.replaceState(null, "", path);
    } else {
      window.history.pushState(null, "", path);
    }
    this.activeTab = tab;
  }

  private updateFormState(nextState: Partial<FormState>) {
    this.formState = mergeDeep(this.formState, nextState);
  }

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    await this.updateComplete;

    const form = event.target as HTMLFormElement;
    if (form.querySelector("[data-invalid]")) {
      return;
    }

    const params: Collection = {
      name: this.formState.name,
      description: this.formState.description,
      crawlIds: [],
    };
    this.isSubmitting = true;
    console.log("submit", params);

    try {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/collections/`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify(params),
        }
      );

      console.log(data.added);

      this.notify({
        message: msg("Successfully created new Collection."),
        variant: "success",
        icon: "check2-circle",
        duration: 8000,
      });

      this.navTo(`/orgs/${this.orgId}/collections`);
    } catch (e: any) {
      if (e?.isApiError) {
        this.serverError = e?.message;
      } else {
        this.serverError = msg("Something unexpected went wrong");
      }

      console.log(this.serverError);
    }

    this.isSubmitting = false;
  }

  private async fetchWorkflows() {
    try {
      this.workflows = await this.getWorkflows();

      // TODO remove
      this.fetchCrawls(this.workflows.items[0].id);
    } catch (e: any) {
      this.notify({
        message: msg("Sorry, couldn't retrieve Workflows at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getWorkflows(
    params?: any /* TODO */
  ): Promise<APIPaginatedList> {
    const query = queryString.stringify(params);
    const data: APIPaginatedList = await this.apiFetch(
      `/orgs/${this.orgId}/crawlconfigs?${query}`,
      this.authState!
    );

    return data;
  }

  private fetchCrawls(workflowId: string) {
    if (this.workflowCrawls[workflowId] !== undefined) {
      return Promise.resolve(this.workflowCrawls[workflowId]);
    }

    this.workflowCrawls = mergeDeep(this.workflowCrawls, {
      [workflowId]: this.getCrawls({
        cid: workflowId,
        state: finishedCrawlStates,
      })
        .then((data) => data.items)
        .catch((err: any) => {
          console.debug(err);
          this.workflowCrawls = omit([workflowId], this.workflowCrawls);
        }),
    });
  }

  private async getCrawls(params?: any /* TODO */): Promise<APIPaginatedList> {
    const query = queryString.stringify(params, {
      arrayFormat: "comma",
    });
    const data: APIPaginatedList = await this.apiFetch(
      `/orgs/${this.orgId}/crawls?${query}`,
      this.authState!
    );

    return data;
  }
}
customElements.define("btrix-collections-new", CollectionsNew);
