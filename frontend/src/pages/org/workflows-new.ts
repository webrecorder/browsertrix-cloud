import { localized, msg } from "@lit/localize";
import { mergeDeep } from "immutable";
import type { LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

import type { JobType, Seed, WorkflowParams } from "./types";

import type { SelectNewDialogEvent } from ".";

import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";

import "./workflow-editor";

const defaultValue = {
  name: "",
  description: null,
  profileid: null,
  schedule: "",
  config: {
    seeds: [],
    scopeType: "prefix",
    exclude: [""],
    behaviorTimeout: null,
    pageLoadTimeout: null,
    pageExtraDelay: null,
    postLoadDelay: null,
    useSitemap: false,
    failOnFailedSeed: false,
    userAgent: null,
  },
  tags: [],
  crawlTimeout: null,
  maxCrawlSize: null,
  jobType: undefined,
  scale: 1,
  autoAddCollections: [],
  crawlerChannel: "default",
  crawlerSocksProxyServer: null,
} as WorkflowParams;

/**
 * Usage:
 * ```ts
 * <btrix-workflows-new></btrix-workflows-new>
 * ```
 */
@localized()
@customElement("btrix-workflows-new")
export class WorkflowsNew extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: Boolean })
  isCrawler!: boolean;

  @property({ type: Array })
  initialSeeds?: Seed[];

  @property({ type: String })
  jobType?: JobType;

  @property({ type: Boolean })
  orgStorageQuotaReached = false;

  @property({ type: Boolean })
  orgExecutionMinutesQuotaReached = false;

  // Use custom property accessor to prevent
  // overriding default Workflow values
  @property({ type: Object })
  get initialWorkflow(): WorkflowParams {
    return this._initialWorkflow;
  }
  set initialWorkflow(val: Partial<WorkflowParams>) {
    this._initialWorkflow = mergeDeep(this._initialWorkflow, val);
  }

  private _initialWorkflow: WorkflowParams = defaultValue;

  private renderHeader() {
    const href = `${this.orgBasePath}/workflows/crawls`;
    const label = msg("Back to Crawl Workflows");

    return html`
      <nav class="mb-5">
        <a
          class="text-sm font-medium text-gray-600 hover:text-gray-800"
          href=${href}
          @click=${(e: MouseEvent) => {
            this.navLink(e);
            this.jobType = undefined;
          }}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle">${label}</span>
        </a>
      </nav>
    `;
  }

  render() {
    const jobTypeLabels: Record<JobType, string> = {
      "url-list": msg("URL List"),
      "seed-crawl": msg("Seeded Crawl"),
      custom: msg("Custom"),
    };

    const jobType = this.initialWorkflow.jobType || this.jobType;

    if (!this.isCrawler) {
      return this.renderNoAccess();
    }

    if (jobType) {
      return html`
        ${this.renderHeader()}
        <h2 class="mb-6 text-xl font-semibold">
          ${msg(html`New Crawl Workflow &mdash; ${jobTypeLabels[jobType]}`)}
        </h2>
        <btrix-workflow-editor
          .initialWorkflow=${this.initialWorkflow}
          .initialSeeds=${this.initialSeeds}
          jobType=${jobType}
          orgId=${this.orgId}
          .authState=${this.authState}
          ?orgStorageQuotaReached=${this.orgStorageQuotaReached}
          ?orgExecutionMinutesQuotaReached=${this
            .orgExecutionMinutesQuotaReached}
          @reset=${async (e: Event) => {
            await (e.target as LitElement).updateComplete;
            this.dispatchEvent(
              new CustomEvent("select-new-dialog", {
                detail: "workflow",
              }) as SelectNewDialogEvent,
            );
          }}
        ></btrix-workflow-editor>
      `;
    }

    return html``;
  }

  private readonly renderNoAccess = () => html`
    <btrix-alert variant="danger">
      ${msg(`You don't have permission to create a new Workflow.`)}
    </btrix-alert>
  `;
}
