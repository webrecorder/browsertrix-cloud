import { localized, msg, str } from "@lit/localize";
import type {
  SlChangeEvent,
  SlCheckbox,
  SlInput,
  SlRadio,
  SlRadioGroup,
  SlSelect,
  SlSwitch,
  SlTextarea,
} from "@shoelace-style/shoelace";
import Fuse from "fuse.js";
import { mergeDeep } from "immutable";
import type { LanguageCode } from "iso-639-1";
import type { LitElement, PropertyValues, TemplateResult } from "lit";
import {
  customElement,
  property,
  query,
  queryAsync,
  state,
} from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { map } from "lit/directives/map.js";
import { range } from "lit/directives/range.js";
import { when } from "lit/directives/when.js";
import compact from "lodash/fp/compact";
import flow from "lodash/fp/flow";
import uniq from "lodash/fp/uniq";

import type {
  CrawlConfig,
  JobType,
  Profile,
  Seed,
  SeedConfig,
  WorkflowParams,
} from "./types";

import type {
  SelectCrawlerChangeEvent,
  SelectCrawlerUpdateEvent,
} from "@/components/ui/select-crawler";
import type { SelectCrawlerSocksProxyServerChangeEvent } from "@/components/ui/select-crawler-socks-proxy-server";
import type { Tab } from "@/components/ui/tab-list";
import type {
  TagInputEvent,
  Tags,
  TagsChangeEvent,
} from "@/components/ui/tag-input";
import type { TimeInputChangeEvent } from "@/components/ui/time-input";
import { type SelectBrowserProfileChangeEvent } from "@/features/browser-profiles/select-browser-profile";
import type { CollectionsChangeEvent } from "@/features/collections/collections-add";
import type {
  ExclusionChangeEvent,
  ExclusionRemoveEvent,
} from "@/features/crawl-workflows/queue-exclusion-table";
import { isApiError, type Detail } from "@/utils/api";
import type { AuthState } from "@/utils/AuthService";
import { DEFAULT_MAX_SCALE } from "@/utils/crawler";
import {
  getNextDate,
  getScheduleInterval,
  getUTCSchedule,
  humanizeNextDate,
  humanizeSchedule,
} from "@/utils/cron";
import { maxLengthValidator } from "@/utils/form";
import LiteElement, { html } from "@/utils/LiteElement";
import { getLocale } from "@/utils/localization";
import { regexEscape, regexUnescape } from "@/utils/string";

type NewCrawlConfigParams = WorkflowParams & {
  runNow: boolean;
  config: WorkflowParams["config"] & {
    seeds: Seed[];
  };
};

const STEPS = [
  "crawlSetup",
  "crawlLimits",
  "browserSettings",
  "crawlScheduling",
  "crawlMetadata",
  "confirmSettings",
] as const;
type StepName = (typeof STEPS)[number];
type TabState = {
  completed: boolean;
  error: boolean;
};
type Tabs = Record<StepName, TabState>;
type ProgressState = {
  activeTab: StepName;
  tabs: Tabs;
};
type FormState = {
  primarySeedUrl: string;
  urlList: string;
  includeLinkedPages: boolean;
  useSitemap: boolean;
  failOnFailedSeed: boolean;
  customIncludeUrlList: string;
  crawlTimeoutMinutes: number;
  behaviorTimeoutSeconds: number | null;
  pageLoadTimeoutSeconds: number | null;
  pageExtraDelaySeconds: number | null;
  postLoadDelaySeconds: number | null;
  maxCrawlSizeGB: number;
  maxScopeDepth: number | null;
  scopeType: WorkflowParams["config"]["scopeType"];
  exclusions: WorkflowParams["config"]["exclude"];
  pageLimit: WorkflowParams["config"]["limit"];
  scale: WorkflowParams["scale"];
  blockAds: WorkflowParams["config"]["blockAds"];
  lang: WorkflowParams["config"]["lang"];
  scheduleType: "date" | "cron" | "none";
  scheduleFrequency: "daily" | "weekly" | "monthly" | "";
  scheduleDayOfMonth?: number;
  scheduleDayOfWeek?: number;
  scheduleTime?: {
    hour: number;
    minute: number;
    period: "AM" | "PM";
  };
  runNow: boolean;
  jobName: WorkflowParams["name"];
  browserProfile: Profile | null;
  tags: Tags;
  autoAddCollections: string[];
  description: WorkflowParams["description"];
  autoscrollBehavior: boolean;
  userAgent: string | null;
  crawlerChannel: string;
  crawlerSocksProxyServer: string | null;
};

const DEPTH_SUPPORTED_SCOPES = ["prefix", "host", "domain", "custom", "any"];

const getDefaultProgressState = (hasConfigId = false): ProgressState => {
  let activeTab: StepName = "crawlSetup";
  if (window.location.hash) {
    const hashValue = window.location.hash.slice(1);

    if (STEPS.includes(hashValue as (typeof STEPS)[number])) {
      activeTab = hashValue as StepName;
    }
  }

  return {
    activeTab,
    tabs: {
      crawlSetup: { error: false, completed: hasConfigId },
      crawlLimits: {
        error: false,
        completed: hasConfigId,
      },
      browserSettings: {
        error: false,
        completed: hasConfigId,
      },
      crawlScheduling: {
        error: false,
        completed: hasConfigId,
      },
      crawlMetadata: {
        error: false,
        completed: hasConfigId,
      },
      confirmSettings: {
        error: false,
        completed: hasConfigId,
      },
    },
  };
};
const getDefaultFormState = (): FormState => ({
  primarySeedUrl: "",
  urlList: "",
  includeLinkedPages: false,
  useSitemap: false,
  failOnFailedSeed: false,
  customIncludeUrlList: "",
  crawlTimeoutMinutes: 0,
  maxCrawlSizeGB: 0,
  behaviorTimeoutSeconds: null,
  pageLoadTimeoutSeconds: null,
  pageExtraDelaySeconds: null,
  postLoadDelaySeconds: null,
  maxScopeDepth: null,
  scopeType: "host",
  exclusions: [],
  pageLimit: null,
  scale: 1,
  blockAds: true,
  lang: undefined,
  scheduleType: "none",
  scheduleFrequency: "weekly",
  scheduleDayOfMonth: new Date().getDate(),
  scheduleDayOfWeek: new Date().getDay(),
  scheduleTime: {
    hour: 12,
    minute: 0,
    period: "AM",
  },
  runNow: false,
  jobName: "",
  browserProfile: null,
  tags: [],
  autoAddCollections: [],
  description: null,
  autoscrollBehavior: true,
  userAgent: null,
  crawlerChannel: "default",
  crawlerSocksProxyServer: null,
});

function getLocalizedWeekDays() {
  const now = new Date();
  // TODO accept locale from locale-picker
  const { format } = new Intl.DateTimeFormat(getLocale(), { weekday: "short" });
  return Array.from({ length: 7 }).map((x, day) =>
    format(Date.now() - (now.getDay() - day) * 86400000),
  );
}

function validURL(url: string) {
  return /((((https?):(?:\/\/)?)(?:[-;:&=+$,\w]+@)?[A-Za-z0-9.-]+|(?:www\.|[-;:&=+$,\w]+@)[A-Za-z0-9.-]+)((?:\/[+~%/.\w\-_]*)?\??(?:[-+=&;%@.\w_]*)#?(?:[.!/\\\w]*))?)/.test(
    url,
  );
}

const trimArray = flow(uniq, compact);
const urlListToArray = flow(
  (str: string) => (str.length ? str.trim().split(/\s+/g) : []),
  trimArray,
);
const mapSeedToUrl = (arr: Seed[]) =>
  arr.map((seed) => (typeof seed === "string" ? seed : seed.url));
const DEFAULT_BEHAVIORS = [
  "autoscroll",
  "autoplay",
  "autofetch",
  "siteSpecific",
];
const BYTES_PER_GB = 1e9;
const URL_LIST_MAX_URLS = 1000;

type CrawlConfigResponse = {
  run_now_job?: boolean;
  started?: boolean;
  storageQuotaReached?: boolean;
  execMinutesQuotaReached?: boolean;
  quotas?: { maxPagesPerCrawl?: number };
  id?: string;
};
@localized()
@customElement("btrix-workflow-editor")
export class CrawlConfigEditor extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  configId?: string;

  @property({ type: String })
  jobType?: JobType;

  @property({ type: Object })
  initialWorkflow?: WorkflowParams;

  @property({ type: Array })
  initialSeeds?: Seed[];

  @property({ type: Boolean })
  orgStorageQuotaReached = false;

  @property({ type: Boolean })
  orgExecutionMinutesQuotaReached = false;

  @state()
  private showCrawlerChannels = false;

  @state()
  private tagOptions: string[] = [];

  @state()
  private isSubmitting = false;

  @state()
  private progressState?: ProgressState;

  @state()
  private orgDefaults?: {
    behaviorTimeoutSeconds?: number;
    pageLoadTimeoutSeconds?: number;
    maxPagesPerCrawl?: number;
  };

  @state()
  private formState!: FormState;

  @state()
  private serverError?: TemplateResult | string;

  private maxScale = DEFAULT_MAX_SCALE;

  // For fuzzy search:
  private readonly fuse = new Fuse<string>([], {
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
  });

  private readonly validateNameMax = maxLengthValidator(50);
  private readonly validateDescriptionMax = maxLengthValidator(350);

  private get formHasError() {
    return (
      !this.hasRequiredFields() ||
      Object.values(this.progressState!.tabs).some(({ error }) => error)
    );
  }

  private get utcSchedule() {
    if (!this.formState.scheduleFrequency) {
      return "";
    }
    return getUTCSchedule({
      interval: this.formState.scheduleFrequency,
      dayOfMonth: this.formState.scheduleDayOfMonth,
      dayOfWeek: this.formState.scheduleDayOfWeek,
      ...this.formState.scheduleTime!,
    });
  }

  private readonly daysOfWeek = getLocalizedWeekDays();

  private readonly scopeTypeLabels: Record<
    NonNullable<FormState["scopeType"]>,
    string
  > = {
    prefix: msg("Pages in the Same Directory"),
    host: msg("Pages on This Domain"),
    domain: msg("Pages on This Domain & Subdomains"),
    "page-spa": msg("Hashtag Links Only"),
    page: msg("Page"),
    custom: msg("Custom Page Prefix"),
    any: msg("Any"),
  };

  private readonly scheduleTypeLabels: Record<
    FormState["scheduleType"],
    string
  > = {
    date: msg("Run on a specific date & time"),
    cron: msg("Run on a recurring basis"),
    none: msg("No schedule"),
  };

  private readonly scheduleFrequencyLabels: Record<
    FormState["scheduleFrequency"],
    string
  > = {
    daily: msg("Daily"),
    weekly: msg("Weekly"),
    monthly: msg("Monthly"),
    "": "",
  };

  @query('form[name="newJobConfig"]')
  formElem?: HTMLFormElement;

  @queryAsync("btrix-tab-panel[aria-hidden=false]")
  activeTabPanel!: Promise<HTMLElement | null>;

  connectedCallback(): void {
    this.initializeEditor();
    super.connectedCallback();

    window.addEventListener("hashchange", () => {
      const hashValue = window.location.hash.slice(1);
      if (STEPS.includes(hashValue as (typeof STEPS)[number])) {
        this.updateProgressState({
          activeTab: hashValue as StepName,
        });
      }
    });
  }

  async willUpdate(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ) {
    if (changedProperties.has("jobType") && this.jobType) {
      this.initializeEditor();
    }
    if (changedProperties.has("authState") && this.authState) {
      await this.fetchAPIDefaults();
      if (this.orgId) {
        await this.fetchOrgQuotaDefaults();
      }
    }
    if (changedProperties.get("initialWorkflow") && this.initialWorkflow) {
      this.initializeEditor();
    }
    if (changedProperties.get("progressState") && this.progressState) {
      if (
        (changedProperties.get("progressState") as ProgressState).activeTab ===
          "crawlSetup" &&
        this.progressState.activeTab !== "crawlSetup"
      ) {
        // Show that required tab has error even if input hasn't been touched
        if (
          !this.hasRequiredFields() &&
          !this.progressState.tabs.crawlSetup.error
        ) {
          this.updateProgressState({
            tabs: {
              crawlSetup: { error: true },
            },
          });
        }
      }
    }
    if (changedProperties.get("orgId") && this.orgId) {
      await this.fetchTags();
    }
  }

  async updated(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ) {
    if (changedProperties.get("progressState") && this.progressState) {
      if (
        (changedProperties.get("progressState") as ProgressState).activeTab !==
        this.progressState.activeTab
      ) {
        void this.scrollToPanelTop();

        // Focus on first field in section
        (await this.activeTabPanel)
          ?.querySelector<HTMLElement>(
            "sl-input, sl-textarea, sl-select, sl-radio-group",
          )
          ?.focus();
      }
    }
  }

  async firstUpdated() {
    // Focus on first field in section
    (await this.activeTabPanel)
      ?.querySelector<HTMLElement>(
        "sl-input, sl-textarea, sl-select, sl-radio-group",
      )
      ?.focus();

    void this.fetchTags();
  }

  private initializeEditor() {
    this.progressState = getDefaultProgressState(Boolean(this.configId));
    this.formState = {
      ...getDefaultFormState(),
      ...this.getInitialFormState(),
    };
    if (!this.formState.lang) {
      this.formState.lang = this.getInitialLang();
    }
    if (!this.formState.exclusions?.length) {
      this.formState.exclusions = [""]; // Add empty slot
    }
  }

  private getInitialLang() {
    // Default to current user browser language
    const browserLanguage = window.navigator.language;
    if (browserLanguage) {
      return browserLanguage.slice(0, browserLanguage.indexOf("-"));
    }
    return null;
  }

  private getInitialFormState(): FormState {
    const defaultFormState = getDefaultFormState();
    if (!this.configId) {
      defaultFormState.runNow = true;
    }
    if (!this.initialWorkflow) return defaultFormState;
    const formState: Partial<FormState> = {};
    const seedsConfig = this.initialWorkflow.config;
    let primarySeedConfig: SeedConfig | Seed = seedsConfig;
    if (this.initialWorkflow.jobType === "seed-crawl") {
      if (this.initialSeeds) {
        const firstSeed = this.initialSeeds[0];
        if (typeof firstSeed === "string") {
          formState.primarySeedUrl = firstSeed;
        } else {
          primarySeedConfig = firstSeed;
          formState.primarySeedUrl = primarySeedConfig.url;
        }
      }
      if (primarySeedConfig.include?.length) {
        formState.customIncludeUrlList = primarySeedConfig.include
          // Unescape regex
          .map(regexUnescape)
          .join("\n");
        // if we have additional include URLs, set to "custom" scope here
        // to indicate 'Custom Page Prefix' option
        formState.scopeType = "custom";
      }
      const additionalSeeds = this.initialSeeds?.slice(1);
      if (additionalSeeds?.length) {
        formState.urlList = mapSeedToUrl(additionalSeeds).join("\n");
      }
      formState.useSitemap = seedsConfig.useSitemap;
    } else {
      // Treat "custom" like URL list
      if (this.initialSeeds) {
        formState.urlList = mapSeedToUrl(this.initialSeeds).join("\n");
      }

      if (this.initialWorkflow.jobType === "custom") {
        formState.scopeType = seedsConfig.scopeType || "page";
      }

      formState.failOnFailedSeed = seedsConfig.failOnFailedSeed;
    }

    if (this.initialWorkflow.schedule) {
      formState.scheduleType = "cron";
      formState.scheduleFrequency = getScheduleInterval(
        this.initialWorkflow.schedule,
      );
      const nextDate = getNextDate(this.initialWorkflow.schedule)!;
      formState.scheduleDayOfMonth = nextDate.getDate();
      formState.scheduleDayOfWeek = nextDate.getDay();
      const hours = nextDate.getHours();
      formState.scheduleTime = {
        hour: hours % 12 || 12,
        minute: nextDate.getMinutes(),
        period: hours > 11 ? "PM" : "AM",
      };
    } else {
      formState.scheduleType = "none";
    }

    if (this.initialWorkflow.tags.length) {
      formState.tags = this.initialWorkflow.tags;
    }

    if (this.initialWorkflow.autoAddCollections.length) {
      formState.autoAddCollections = this.initialWorkflow.autoAddCollections;
    }

    const secondsToMinutes = (value: unknown, fallback = 0) => {
      if (typeof value === "number" && value > 0) return value / 60;
      return fallback;
    };

    const bytesToGB = (value: unknown, fallback = 0) => {
      if (typeof value === "number" && value > 0)
        return Math.floor(value / BYTES_PER_GB);
      return fallback;
    };

    return {
      primarySeedUrl: defaultFormState.primarySeedUrl,
      urlList: defaultFormState.urlList,
      customIncludeUrlList: defaultFormState.customIncludeUrlList,
      crawlTimeoutMinutes: secondsToMinutes(
        this.initialWorkflow.crawlTimeout,
        defaultFormState.crawlTimeoutMinutes,
      ),
      maxCrawlSizeGB: bytesToGB(
        this.initialWorkflow.maxCrawlSize,
        defaultFormState.maxCrawlSizeGB,
      ),
      behaviorTimeoutSeconds:
        seedsConfig.behaviorTimeout ?? defaultFormState.behaviorTimeoutSeconds,
      pageLoadTimeoutSeconds:
        seedsConfig.pageLoadTimeout ?? defaultFormState.pageLoadTimeoutSeconds,
      pageExtraDelaySeconds:
        seedsConfig.pageExtraDelay ?? defaultFormState.pageExtraDelaySeconds,
      postLoadDelaySeconds:
        seedsConfig.postLoadDelay ?? defaultFormState.postLoadDelaySeconds,
      maxScopeDepth: primarySeedConfig.depth ?? defaultFormState.maxScopeDepth,
      scale: this.initialWorkflow.scale,
      blockAds: this.initialWorkflow.config.blockAds,
      lang: this.initialWorkflow.config.lang,
      scheduleType: defaultFormState.scheduleType,
      scheduleFrequency: defaultFormState.scheduleFrequency,
      runNow:
        this.orgStorageQuotaReached || this.orgExecutionMinutesQuotaReached
          ? false
          : defaultFormState.runNow,
      tags: this.initialWorkflow.tags,
      autoAddCollections: this.initialWorkflow.autoAddCollections,
      jobName: this.initialWorkflow.name || defaultFormState.jobName,
      description: this.initialWorkflow.description,
      browserProfile: this.initialWorkflow.profileid
        ? ({ id: this.initialWorkflow.profileid } as Profile)
        : defaultFormState.browserProfile,
      scopeType: primarySeedConfig.scopeType as FormState["scopeType"],
      exclusions: seedsConfig.exclude,
      includeLinkedPages: Boolean(
        primarySeedConfig.extraHops || seedsConfig.extraHops,
      ),
      useSitemap: seedsConfig.useSitemap ?? defaultFormState.useSitemap,
      failOnFailedSeed:
        seedsConfig.failOnFailedSeed ?? defaultFormState.failOnFailedSeed,
      pageLimit:
        this.initialWorkflow.config.limit ?? defaultFormState.pageLimit,
      autoscrollBehavior: this.initialWorkflow.config.behaviors
        ? this.initialWorkflow.config.behaviors.includes("autoscroll")
        : defaultFormState.autoscrollBehavior,
      userAgent:
        this.initialWorkflow.config.userAgent ?? defaultFormState.userAgent,
      crawlerChannel:
        this.initialWorkflow.crawlerChannel || defaultFormState.crawlerChannel,
      crawlerSocksProxyServer:
        this.initialWorkflow.crawlerSocksProxyServer ||
        defaultFormState.crawlerSocksProxyServer,
      ...formState,
    };
  }

  render() {
    const tabLabels: Record<StepName, string> = {
      crawlSetup: msg("Scope"),
      crawlLimits: msg("Limits"),
      browserSettings: msg("Browser Settings"),
      crawlScheduling: msg("Scheduling"),
      crawlMetadata: msg("Metadata"),
      confirmSettings: msg("Review Settings"),
    };
    let orderedTabNames = STEPS as readonly StepName[];

    if (this.configId) {
      // Remove review tab
      orderedTabNames = orderedTabNames.slice(0, -1);
    }

    return html`
      <form
        name="newJobConfig"
        @reset=${this.onReset}
        @submit=${this.onSubmit}
        @keydown=${this.onKeyDown}
        @sl-blur=${this.validateOnBlur}
        @sl-change=${this.updateFormStateOnChange}
      >
        <btrix-tab-list
          activePanel="newJobConfig-${this.progressState!.activeTab}"
          progressPanel=${ifDefined(
            this.configId
              ? undefined
              : `newJobConfig-${this.progressState!.activeTab}`,
          )}
        >
          <header slot="header" class="flex items-baseline justify-between">
            <h3 class="font-semibold">
              ${tabLabels[this.progressState!.activeTab]}
            </h3>
            <p class="text-xs font-normal text-neutral-500">
              ${msg(
                html`Fields marked with
                  <span style="color:var(--sl-input-required-content-color)"
                    >*</span
                  >
                  are required`,
              )}
            </p>
          </header>

          ${orderedTabNames.map((tabName) =>
            this.renderNavItem(tabName, tabLabels[tabName]),
          )}

          <btrix-tab-panel name="newJobConfig-crawlSetup" class="scroll-m-3">
            ${this.renderPanelContent(
              html`
                ${choose(this.jobType, [
                  ["url-list", () => this.renderUrlListSetup(false)],
                  ["seed-crawl", () => this.renderSeededCrawlSetup()],
                  ["custom", () => this.renderUrlListSetup(true)],
                ])}
              `,
              { isFirst: true },
            )}
          </btrix-tab-panel>
          <btrix-tab-panel name="newJobConfig-crawlLimits" class="scroll-m-3">
            ${this.renderPanelContent(this.renderCrawlLimits())}
          </btrix-tab-panel>
          <btrix-tab-panel
            name="newJobConfig-browserSettings"
            class="scroll-m-3"
          >
            ${this.renderPanelContent(this.renderCrawlBehaviors())}
          </btrix-tab-panel>
          <btrix-tab-panel
            name="newJobConfig-crawlScheduling"
            class="scroll-m-3"
          >
            ${this.renderPanelContent(this.renderJobScheduling())}
          </btrix-tab-panel>
          <btrix-tab-panel name="newJobConfig-crawlMetadata" class="scroll-m-3">
            ${this.renderPanelContent(this.renderJobMetadata())}
          </btrix-tab-panel>
          <btrix-tab-panel
            name="newJobConfig-confirmSettings"
            class="scroll-m-3"
          >
            ${this.renderPanelContent(this.renderConfirmSettings(), {
              isLast: true,
            })}
          </btrix-tab-panel>
        </btrix-tab-list>
      </form>
    `;
  }

  private renderNavItem(tabName: StepName, content: TemplateResult | string) {
    const isActive = tabName === this.progressState!.activeTab;
    const isConfirmSettings = tabName === "confirmSettings";
    const { error: isInvalid, completed } = this.progressState!.tabs[tabName];
    let icon: TemplateResult = html``;

    if (!this.configId) {
      const iconProps = {
        name: "circle",
        library: "default",
        class: "text-neutral-400",
      };
      if (isConfirmSettings) {
        iconProps.name = "info-circle";
        iconProps.class = "text-base";
      } else {
        if (isInvalid) {
          iconProps.name = "exclamation-circle";
          iconProps.class = "text-danger";
        } else if (isActive) {
          iconProps.name = "pencil-circle-dashed";
          iconProps.library = "app";
          iconProps.class = "text-base";
        } else if (completed) {
          iconProps.name = "check-circle";
        }
      }

      icon = html`
        <sl-tooltip
          content=${msg("Form section contains errors")}
          ?disabled=${!isInvalid}
          hoist
        >
          <sl-icon
            name=${iconProps.name}
            library=${iconProps.library}
            class="${iconProps.class} mr-1 inline-block align-middle text-base"
          ></sl-icon>
        </sl-tooltip>
      `;
    }

    return html`
      <btrix-tab
        slot="nav"
        name="newJobConfig-${tabName}"
        class="whitespace-nowrap"
        @click=${this.tabClickHandler(tabName)}
      >
        ${icon}
        <span
          class="whitespace-normal${this.configId
            ? " ml-1"
            : ""} inline-block align-middle"
        >
          ${content}
        </span>
      </btrix-tab>
    `;
  }

  private renderPanelContent(
    content: TemplateResult,
    { isFirst = false, isLast = false } = {},
  ) {
    return html`
      <div class="flex h-full min-h-[21rem] flex-col">
        <div
          class="grid flex-1 grid-cols-5 gap-4 rounded-lg rounded-b-none border border-b-0 p-6"
        >
          ${content}
          ${when(this.serverError, () =>
            this.renderErrorAlert(this.serverError!),
          )}
        </div>

        ${this.renderFooter({ isFirst, isLast })}
      </div>
    `;
  }

  private renderFooter({ isFirst = false, isLast = false }) {
    if (this.configId) {
      return html`
        <footer
          class="sticky bottom-0 z-50 flex items-center justify-end gap-2 rounded-b-lg border bg-white px-6 py-4"
        >
          <div class="mr-auto">${this.renderRunNowToggle()}</div>
          <aside class="text-xs text-neutral-500">
            ${msg("Changes in all sections will be saved")}
          </aside>
          <sl-button
            type="submit"
            size="small"
            variant="primary"
            ?disabled=${this.isSubmitting}
            ?loading=${this.isSubmitting}
          >
            ${msg("Save Workflow")}
          </sl-button>
        </footer>
      `;
    }

    if (!this.configId) {
      return html`
        <footer
          class="sticky bottom-0 z-50 flex items-center justify-end gap-2 rounded-b-lg border bg-white px-6 py-4"
        >
          ${this.renderSteppedFooterButtons({ isFirst, isLast })}
        </footer>
      `;
    }

    return html`
      <div class="flex items-center justify-end gap-2 border-t px-6 py-4">
        ${when(
          this.configId,
          () => html`
            <div class="mr-auto">${this.renderRunNowToggle()}</div>
            <sl-button
              type="submit"
              size="small"
              variant="primary"
              ?disabled=${this.isSubmitting}
              ?loading=${this.isSubmitting}
            >
              ${msg("Save Changes")}
            </sl-button>
          `,
          () => this.renderSteppedFooterButtons({ isFirst, isLast }),
        )}
      </div>
    `;
  }

  private renderSteppedFooterButtons({
    isFirst,
    isLast,
  }: {
    isFirst: boolean;
    isLast: boolean;
  }) {
    if (isLast) {
      return html`<sl-button
          class="mr-auto"
          size="small"
          @click=${this.backStep}
        >
          <sl-icon slot="prefix" name="chevron-left"></sl-icon>
          ${msg("Previous Step")}
        </sl-button>
        ${this.renderRunNowToggle()}
        <sl-button
          type="submit"
          size="small"
          variant="primary"
          ?disabled=${this.isSubmitting || this.formHasError}
          ?loading=${this.isSubmitting}
        >
          ${msg("Save Workflow")}
        </sl-button>`;
    }
    return html`
      ${isFirst
        ? html`
            <sl-button class="mr-auto" size="small" type="reset">
              <sl-icon slot="prefix" name="chevron-left"></sl-icon>
              ${msg("Start Over")}
            </sl-button>
          `
        : html`
            <sl-button class="mr-auto" size="small" @click=${this.backStep}>
              <sl-icon slot="prefix" name="chevron-left"></sl-icon>
              ${msg("Previous Step")}
            </sl-button>
          `}
      <sl-button size="small" variant="primary" @click=${this.nextStep}>
        <sl-icon slot="suffix" name="chevron-right"></sl-icon>
        ${msg("Next Step")}
      </sl-button>
      <sl-button
        size="small"
        @click=${() => {
          if (this.hasRequiredFields()) {
            this.updateProgressState({
              activeTab: "confirmSettings",
            });
          } else {
            this.nextStep();
          }
        }}
      >
        <sl-icon slot="suffix" name="chevron-double-right"></sl-icon>
        ${msg("Review & Save")}
      </sl-button>
    `;
  }

  private renderRunNowToggle() {
    return html`
      <sl-switch
        class="mr-1"
        ?checked=${this.formState.runNow}
        ?disabled=${this.orgStorageQuotaReached ||
        this.orgExecutionMinutesQuotaReached}
        @sl-change=${(e: SlChangeEvent) => {
          this.updateFormState(
            {
              runNow: (e.target as SlSwitch).checked,
            },
            true,
          );
        }}
      >
        ${msg("Run on Save")}
      </sl-switch>
    `;
  }

  private renderSectionHeading(content: TemplateResult | string) {
    return html`
      <btrix-section-heading class="col-span-5">
        <h4>${content}</h4>
      </btrix-section-heading>
    `;
  }

  private readonly renderFormCol = (content: TemplateResult) => {
    return html`<div class="col-span-5 md:col-span-3">${content}</div> `;
  };

  private renderHelpTextCol(content: TemplateResult | string, padTop = true) {
    return html`
      <div class="flex${padTop ? " pt-6" : ""} col-span-5 md:col-span-2">
        <div class="mr-2 text-base">
          <sl-icon name="info-circle"></sl-icon>
        </div>
        <div class="mt-0.5 text-xs text-neutral-500">${content}</div>
      </div>
    `;
  }

  private readonly renderUrlListSetup = (isCustom = false) => {
    return html`
      ${this.renderFormCol(html`
        <sl-textarea
          name="urlList"
          class="textarea-wrap"
          label=${msg("List of URLs")}
          rows="10"
          autocomplete="off"
          inputmode="url"
          value=${this.formState.urlList}
          placeholder=${`https://example.com
https://example.com/path`}
          required
          @keyup=${async (e: KeyboardEvent) => {
            if (e.key === "Enter") {
              const inputEl = e.target as SlInput;
              await inputEl.updateComplete;
              if (!inputEl.value) return;
              const { isValid, helpText } = this.validateUrlList(inputEl.value);
              inputEl.helpText = helpText;
              if (isValid) {
                inputEl.setCustomValidity("");
              } else {
                inputEl.setCustomValidity(helpText);
              }
            }
          }}
          @sl-input=${(e: CustomEvent) => {
            const inputEl = e.target as SlInput;
            if (!inputEl.value) {
              inputEl.helpText = msg("At least 1 URL is required.");
            }
          }}
          @sl-change=${async (e: CustomEvent) => {
            const inputEl = e.target as SlInput;
            if (!inputEl.value) return;
            const { isValid, helpText } = this.validateUrlList(inputEl.value);
            inputEl.helpText = helpText;
            if (isValid) {
              inputEl.setCustomValidity("");
            } else {
              inputEl.setCustomValidity(helpText);
            }
          }}
        ></sl-textarea>
      `)}
      ${this.renderHelpTextCol(
        msg(str`The crawler will visit and record each URL listed in the order
        defined here. You can enter a maximum of ${URL_LIST_MAX_URLS.toLocaleString()} URLs, separated by a new line.`),
      )}
      ${when(
        isCustom,
        () => html`
          ${this.renderFormCol(html`
            <sl-select
              name="scopeType"
              label=${msg("Crawl Scope")}
              value=${this.formState.scopeType!}
              @sl-change=${(e: Event) =>
                this.updateFormState({
                  scopeType: (e.target as HTMLSelectElement)
                    .value as FormState["scopeType"],
                })}
            >
              <sl-option value="prefix">
                ${this.scopeTypeLabels["prefix"]}
              </sl-option>
              <sl-option value="host">
                ${this.scopeTypeLabels["host"]}
              </sl-option>
              <sl-option value="domain">
                ${this.scopeTypeLabels["domain"]}
              </sl-option>
              <sl-option value="page-spa">
                ${this.scopeTypeLabels["page-spa"]}
              </sl-option>
              <sl-option value="page">
                ${this.scopeTypeLabels["page"]}
              </sl-option>
              <sl-option value="custom">
                ${this.scopeTypeLabels["custom"]}
              </sl-option>
              <sl-option value="any">
                ${this.scopeTypeLabels["any"]}
              </sl-option>
            </sl-select>
          `)}
          ${this.renderHelpTextCol(
            msg(`Tells the crawler which pages it can visit.`),
          )}
        `,
      )}
      ${this.renderFormCol(
        html`<sl-checkbox
          name="includeLinkedPages"
          ?checked=${this.formState.includeLinkedPages}
        >
          ${msg("Include any linked page")}
        </sl-checkbox>`,
      )}
      ${this.renderHelpTextCol(
        msg(`If checked, the crawler will visit pages one link away from a Crawl
        URL.`),
        false,
      )}
      ${this.renderFormCol(
        html`<sl-checkbox
          name="failOnFailedSeed"
          ?checked=${this.formState.failOnFailedSeed}
        >
          ${msg("Fail crawl on failed URL")}
        </sl-checkbox>`,
      )}
      ${this.renderHelpTextCol(
        msg(
          `If checked, the crawler will fail the entire crawl if any of the provided URLs are invalid or unsuccessfully crawled.`,
        ),
        false,
      )}
      ${when(
        this.formState.includeLinkedPages || this.jobType === "custom",
        () => html`
          ${this.renderFormCol(html`
            <btrix-queue-exclusion-table
              .exclusions=${this.formState.exclusions}
              pageSize="30"
              editable
              removable
              @on-remove=${this.handleRemoveRegex}
              @on-change=${this.handleChangeRegex}
            ></btrix-queue-exclusion-table>
            <sl-button
              class="mt-1 w-full"
              @click=${() =>
                this.updateFormState({
                  exclusions: [""],
                })}
            >
              <sl-icon slot="prefix" name="plus-lg"></sl-icon>
              <span class="text-neutral-600">${msg("Add More")}</span>
            </sl-button>
          `)}
          ${this.renderHelpTextCol(
            msg(`Specify exclusion rules for what pages should not be visited.
            Exclusions apply to all URLs.`),
          )}
        `,
      )}
    `;
  };

  private readonly renderSeededCrawlSetup = () => {
    const urlPlaceholder = "https://example.com/path/page.html";
    let exampleUrl = new URL(urlPlaceholder);
    if (this.formState.primarySeedUrl) {
      try {
        exampleUrl = new URL(this.formState.primarySeedUrl);
      } catch {
        /* empty */
      }
    }
    const exampleHost = exampleUrl.host;
    const exampleProtocol = exampleUrl.protocol;
    const examplePathname = exampleUrl.pathname;
    const exampleDomain = `${exampleProtocol}//${exampleHost}`;

    let helpText: TemplateResult | string;

    switch (this.formState.scopeType) {
      case "prefix":
        helpText = msg(
          html`Will crawl all pages and paths in the same directory, e.g.
            <span class="break-word break-word text-blue-500"
              >${exampleDomain}</span
            ><span class="break-word font-medium text-blue-500"
              >${examplePathname.slice(
                0,
                examplePathname.lastIndexOf("/"),
              )}/</span
            >`,
        );
        break;
      case "host":
        helpText = msg(
          html`Will crawl all pages on
            <span class="text-blue-500">${exampleHost}</span> and ignore pages
            on any subdomains.`,
        );
        break;
      case "domain":
        helpText = msg(
          html`Will crawl all pages on
            <span class="text-blue-500">${exampleHost}</span> and
            <span class="text-blue-500">subdomain.${exampleHost}</span>.`,
        );
        break;
      case "page-spa":
        helpText = msg(
          html`Will only visit
            <span class="break-word text-blue-500"
              >${exampleDomain}${examplePathname}</span
            >
            hash anchor links, e.g.
            <span class="break-word text-blue-500"
              >${exampleDomain}${examplePathname}</span
            ><span class="break-word font-medium text-blue-500"
              >#example-page</span
            >`,
        );
        break;
      case "custom":
        helpText = msg(
          html`Will crawl all page URLs that begin with
            <span class="break-word text-blue-500"
              >${exampleDomain}${examplePathname}</span
            >
            or any URL that begins with those specified in
            <em>Extra URL Prefixes in Scope</em>`,
        );
        break;
      default:
        helpText = "";
        break;
    }
    const exclusions = trimArray(this.formState.exclusions || []);
    const additionalUrlList = urlListToArray(this.formState.urlList);
    const maxAdditionalURls = 100;

    return html`
      ${this.renderFormCol(html`
        <sl-input
          name="primarySeedUrl"
          label=${msg("Crawl Start URL")}
          autocomplete="off"
          inputmode="url"
          placeholder=${urlPlaceholder}
          value=${this.formState.primarySeedUrl}
          required
          @sl-input=${async (e: Event) => {
            const inputEl = e.target as SlInput;
            await inputEl.updateComplete;
            this.updateFormState(
              {
                primarySeedUrl: inputEl.value,
              },
              true,
            );
            if (!inputEl.checkValidity() && validURL(inputEl.value)) {
              inputEl.setCustomValidity("");
              inputEl.helpText = "";
            }
          }}
          @sl-blur=${async (e: Event) => {
            const inputEl = e.target as SlInput;
            await inputEl.updateComplete;
            if (inputEl.value && !validURL(inputEl.value)) {
              const text = msg("Please enter a valid URL.");
              inputEl.helpText = text;
              inputEl.setCustomValidity(text);
            }
          }}
        ></sl-input>
      `)}
      ${this.renderHelpTextCol(msg(`The starting point of your crawl.`))}
      ${this.renderFormCol(html`
        <sl-select
          name="scopeType"
          label=${msg("Start URL Scope")}
          value=${this.formState.scopeType!}
          @sl-change=${(e: Event) =>
            this.updateFormState({
              scopeType: (e.target as HTMLSelectElement)
                .value as FormState["scopeType"],
            })}
        >
          <div slot="help-text">${helpText}</div>
          <sl-option value="page-spa">
            ${this.scopeTypeLabels["page-spa"]}
          </sl-option>
          <sl-option value="prefix">
            ${this.scopeTypeLabels["prefix"]}
          </sl-option>
          <sl-option value="host"> ${this.scopeTypeLabels["host"]} </sl-option>
          <sl-option value="domain">
            ${this.scopeTypeLabels["domain"]}
          </sl-option>
          <sl-option value="custom">
            ${this.scopeTypeLabels["custom"]}
          </sl-option>
        </sl-select>
      `)}
      ${this.renderHelpTextCol(
        msg(`Tells the crawler which pages it can visit.`),
      )}
      ${when(
        DEPTH_SUPPORTED_SCOPES.includes(this.formState.scopeType!),
        () => html`
          ${this.renderFormCol(html`
            <sl-input
              name="maxScopeDepth"
              label=${msg("Max Depth")}
              value=${ifDefined(
                this.formState.maxScopeDepth === null
                  ? undefined
                  : this.formState.maxScopeDepth,
              )}
              placeholder=${msg("Default: Unlimited")}
              min="0"
              type="number"
              inputmode="numeric"
            >
              <span slot="suffix">${msg("hops")}</span>
            </sl-input>
          `)}
          ${this.renderHelpTextCol(
            msg(
              `Limits how many hops away the crawler can visit while staying within the Start URL Scope.`,
            ),
          )}
        `,
      )}
      ${when(
        this.formState.scopeType === "custom",
        () => html`
          ${this.renderFormCol(html`
            <sl-textarea
              name="customIncludeUrlList"
              label=${msg("Extra URL Prefixes in Scope")}
              rows="3"
              autocomplete="off"
              inputmode="url"
              value=${this.formState.customIncludeUrlList}
              placeholder=${`https://example.org
https://example.net`}
              required
            ></sl-textarea>
          `)}
          ${this.renderHelpTextCol(
            msg(`If the crawler finds pages outside of the Start URL Scope they
            will only be saved if they begin with URLs listed here.`),
          )}
        `,
      )}
      ${this.renderFormCol(html`
        <sl-checkbox
          name="includeLinkedPages"
          ?checked=${this.formState.includeLinkedPages}
        >
          ${msg("Include any linked page (“one hop out”)")}
        </sl-checkbox>
      `)}
      ${this.renderHelpTextCol(
        msg(`If checked, the crawler will visit pages one link away outside of
        Start URL Scope.`),
        false,
      )}
      ${this.renderFormCol(html`
        <sl-checkbox name="useSitemap" ?checked=${this.formState.useSitemap}>
          ${msg("Check for sitemap")}
        </sl-checkbox>
      `)}
      ${this.renderHelpTextCol(
        msg(
          `If checked, the crawler will check for a sitemap at /sitemap.xml and use it to discover pages to crawl if present.`,
        ),
        false,
      )}
      <div class="col-span-5">
        <btrix-details ?open=${exclusions.length > 0}>
          <span slot="title"
            >${msg("Exclusions")}
            ${exclusions.length
              ? html`<btrix-badge>${exclusions.length}</btrix-badge>`
              : ""}</span
          >
          <div class="grid grid-cols-5 gap-4 py-2">
            ${this.renderFormCol(html`
              <btrix-queue-exclusion-table
                label=""
                .exclusions=${this.formState.exclusions}
                pageSize="10"
                editable
                removable
                @on-remove=${this.handleRemoveRegex}
                @on-change=${this.handleChangeRegex}
              ></btrix-queue-exclusion-table>
              <sl-button
                class="mt-1 w-full"
                @click=${() =>
                  this.updateFormState({
                    exclusions: [""],
                  })}
              >
                <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                <span class="text-neutral-600">${msg("Add More")}</span>
              </sl-button>
            `)}
            ${this.renderHelpTextCol(
              msg(
                `Specify exclusion rules for what pages should not be visited.`,
              ),
            )}
          </div></btrix-details
        >
      </div>

      <div class="col-span-5">
        <btrix-details>
          <span slot="title">
            ${msg("Additional URLs")}
            ${additionalUrlList.length
              ? html`<btrix-badge>${additionalUrlList.length}</btrix-badge>`
              : ""}
          </span>
          <div class="grid grid-cols-5 gap-4 py-2">
            ${this.renderFormCol(html`
              <sl-textarea
                name="urlList"
                label=${msg("List of URLs")}
                rows="3"
                autocomplete="off"
                inputmode="url"
                value=${this.formState.urlList}
                placeholder=${`https://webrecorder.net/blog
https://archiveweb.page/images/${"logo.svg"}`}
                @keyup=${async (e: KeyboardEvent) => {
                  if (e.key === "Enter") {
                    const inputEl = e.target as SlInput;
                    await inputEl.updateComplete;
                    if (!inputEl.value) return;
                    const { isValid, helpText } = this.validateUrlList(
                      inputEl.value,
                      maxAdditionalURls,
                    );
                    inputEl.helpText = helpText;
                    if (isValid) {
                      inputEl.setCustomValidity("");
                    } else {
                      inputEl.setCustomValidity(helpText);
                    }
                  }
                }}
                @sl-input=${(e: CustomEvent) => {
                  const inputEl = e.target as SlInput;
                  if (!inputEl.value) {
                    inputEl.helpText = msg("At least 1 URL is required.");
                  }
                }}
                @sl-change=${async (e: CustomEvent) => {
                  const inputEl = e.target as SlInput;
                  if (!inputEl.value) return;
                  const { isValid, helpText } = this.validateUrlList(
                    inputEl.value,
                    maxAdditionalURls,
                  );
                  inputEl.helpText = helpText;
                  if (isValid) {
                    inputEl.setCustomValidity("");
                  } else {
                    inputEl.setCustomValidity(helpText);
                  }
                }}
              ></sl-textarea>
            `)}
            ${this.renderHelpTextCol(
              msg(str`The crawler will visit and record each URL listed here. Other
              links on these pages will not be crawled. You can enter up to ${maxAdditionalURls.toLocaleString()} URLs.`),
            )}
          </div>
        </btrix-details>
      </div>
    `;
  };

  private renderCrawlLimits() {
    // Max Pages minimum value cannot be lower than seed count
    const minPages = Math.max(
      1,
      urlListToArray(this.formState.urlList).length +
        (this.jobType === "seed-crawl" ? 1 : 0),
    );
    const onInputMinMax = async (e: CustomEvent) => {
      const inputEl = e.target as SlInput;
      await inputEl.updateComplete;
      let helpText = "";
      if (!inputEl.checkValidity()) {
        const value = +inputEl.value;
        const min = inputEl.min;
        const max = inputEl.max;
        if (min && value < +min) {
          helpText = msg(
            str`Must be more than minimum of ${(+min).toLocaleString()}`,
          );
        } else if (max && value > +max) {
          helpText = msg(
            str`Must be less than maximum of ${(+max).toLocaleString()}`,
          );
        }
      }
      inputEl.helpText = helpText;
    };
    return html`
      ${this.renderSectionHeading(msg("Per-Crawl Limits"))}
      ${this.renderFormCol(html`
        <sl-mutation-observer
          attr="min"
          @sl-mutation=${async (e: CustomEvent) => {
            // Input `min` attribute changes dynamically in response
            // to number of seed URLs. Watch for changes to `min`
            // and set validity accordingly
            const mutationRecord = e.detail.mutationList[0];
            const inputEl = mutationRecord.target as SlInput;
            await inputEl.updateComplete;
            inputEl.checkValidity();
            await inputEl.updateComplete;
            this.syncTabErrorState(inputEl);
          }}
        >
          <sl-input
            name="pageLimit"
            label=${msg("Max Pages")}
            type="number"
            inputmode="numeric"
            value=${this.formState.pageLimit || ""}
            min=${minPages}
            max=${ifDefined(
              this.orgDefaults?.maxPagesPerCrawl &&
                this.orgDefaults.maxPagesPerCrawl < Infinity
                ? this.orgDefaults.maxPagesPerCrawl
                : undefined,
            )}
            placeholder=${this.orgDefaults?.maxPagesPerCrawl
              ? this.orgDefaults.maxPagesPerCrawl === Infinity
                ? msg("Default: Unlimited")
                : msg(
                    str`Default: ${this.orgDefaults.maxPagesPerCrawl.toLocaleString()}`,
                  )
              : ""}
            @sl-input=${onInputMinMax}
          >
            <span slot="suffix">${msg("pages")}</span>
          </sl-input>
        </sl-mutation-observer>
      `)}
      ${this.renderHelpTextCol(
        msg(`Adds a hard limit on the number of pages
      that will be crawled.`),
      )}
      ${this.renderFormCol(html`
        <sl-input
          name="crawlTimeoutMinutes"
          label=${msg("Crawl Time Limit")}
          value=${this.formState.crawlTimeoutMinutes || ""}
          placeholder=${msg("Default: Unlimited")}
          min="0"
          type="number"
          inputmode="numeric"
        >
          <span slot="suffix">${msg("minutes")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(
        msg(`Gracefully stop the crawler after a specified time limit.`),
      )}
      ${this.renderFormCol(html`
        <sl-input
          name="maxCrawlSizeGB"
          label=${msg("Crawl Size Limit")}
          value=${this.formState.maxCrawlSizeGB || ""}
          placeholder=${msg("Default: Unlimited")}
          min="0"
          type="number"
          inputmode="numeric"
        >
          <span slot="suffix">${msg("GB")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(
        msg(`Gracefully stop the crawler after a specified size limit.`),
      )}
      ${this.renderFormCol(html`
        <sl-radio-group
          name="scale"
          label=${msg("Crawler Instances")}
          value=${this.formState.scale}
          @sl-change=${(e: Event) =>
            this.updateFormState({
              scale: +(e.target as SlCheckbox).value,
            })}
        >
          ${map(
            range(this.maxScale),
            (i: number) =>
              html` <sl-radio-button value="${i + 1}" size="small"
                >${i + 1}×</sl-radio-button
              >`,
          )}
        </sl-radio-group>
      `)}
      ${this.renderHelpTextCol(
        msg(`Increasing parallel crawler instances can speed up crawls, but may
        increase the chances of getting rate limited.`),
      )}
      ${this.renderSectionHeading(msg("Per-Page Limits"))}
      ${this.renderFormCol(html`
        <sl-input
          name="pageLoadTimeoutSeconds"
          type="number"
          inputmode="numeric"
          label=${msg("Page Load Timeout")}
          placeholder=${this.orgDefaults?.pageLoadTimeoutSeconds
            ? msg(
                str`Default: ${this.orgDefaults.pageLoadTimeoutSeconds.toLocaleString()}`,
              )
            : "Default: Unlimited"}
          value=${ifDefined(this.formState.pageLoadTimeoutSeconds ?? undefined)}
          min="0"
          @sl-input=${onInputMinMax}
        >
          <span slot="suffix">${msg("seconds")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(
        msg(
          `Limits amount of time to wait for a page to load. Behaviors will run after this timeout only if the page is partially or fully loaded.`,
        ),
      )}
      ${this.renderFormCol(html`
        <sl-input
          name="postLoadDelaySeconds"
          type="number"
          inputmode="numeric"
          label=${msg("Delay After Page Load")}
          placeholder=${"Default: 0"}
          value=${ifDefined(this.formState.postLoadDelaySeconds ?? undefined)}
          min="0"
        >
          <span slot="suffix">${msg("seconds")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(
        msg(
          `Waits on the page after initial HTML page load prior to moving on to next steps such as link extraction and behaviors. Can be useful with pages that are slow to load page contents.`,
        ),
      )}
      ${this.renderFormCol(html`
        <sl-input
          name="behaviorTimeoutSeconds"
          type="number"
          inputmode="numeric"
          label=${msg("Behavior Timeout")}
          placeholder=${this.orgDefaults?.behaviorTimeoutSeconds
            ? msg(
                str`Default: ${this.orgDefaults.behaviorTimeoutSeconds.toLocaleString()}`,
              )
            : msg("Unlimited")}
          value=${ifDefined(this.formState.behaviorTimeoutSeconds ?? undefined)}
          min="0"
          @sl-input=${onInputMinMax}
        >
          <span slot="suffix">${msg("seconds")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(
        msg(`Limits how long behaviors can run on each page.`),
      )}
      ${this.renderFormCol(
        html`<sl-checkbox
          name="autoscrollBehavior"
          ?checked=${this.formState.autoscrollBehavior}
        >
          ${msg("Auto-scroll behavior")}
        </sl-checkbox>`,
      )}
      ${this.renderHelpTextCol(
        msg(
          `When enabled the browser will automatically scroll to the end of the page.`,
        ),
        false,
      )}
      ${this.renderFormCol(html`
        <sl-input
          name="pageExtraDelaySeconds"
          type="number"
          inputmode="numeric"
          label=${msg("Delay Before Next Page")}
          placeholder=${"Default: 0"}
          value=${ifDefined(this.formState.pageExtraDelaySeconds ?? undefined)}
          min="0"
        >
          <span slot="suffix">${msg("seconds")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(
        msg(
          `Waits on the page after behaviors are complete before moving onto the next page. Can be helpful for rate limiting.`,
        ),
      )}
    `;
  }

  private renderCrawlBehaviors() {
    if (!this.formState.lang) throw new Error("missing formstate.lang");
    return html`
      ${this.renderFormCol(html`
        <btrix-select-browser-profile
          orgId=${this.orgId}
          .profileId=${this.formState.browserProfile?.id}
          .authState=${this.authState}
          @on-change=${(e: SelectBrowserProfileChangeEvent) =>
            this.updateFormState({
              browserProfile: e.detail.value,
            })}
        ></btrix-select-browser-profile>
      `)}
      ${this.renderHelpTextCol(
        msg(`Choose a custom profile to make use of saved cookies and logged-in
        accounts. Note that websites may log profiles out after a period of time.`),
      )}
      ${this.renderFormCol(html`
        <btrix-select-crawler
          orgId=${this.orgId}
          .crawlerChannel=${this.formState.crawlerChannel}
          .authState=${this.authState}
          @on-change=${(e: SelectCrawlerChangeEvent) =>
            this.updateFormState({
              crawlerChannel: e.detail.value,
            })}
          @on-update=${(e: SelectCrawlerUpdateEvent) =>
            (this.showCrawlerChannels = e.detail.show)}
        ></btrix-select-crawler>
      `)}
      ${this.showCrawlerChannels
        ? this.renderHelpTextCol(
            msg(
              `Choose a Browsertrix Crawler Release Channel. If available, other versions may provide new/experimental crawling features.`,
            ),
          )
        : html``}
      ${this.renderFormCol(html`
        <sl-checkbox name="blockAds" ?checked=${this.formState.blockAds}>
          ${msg("Block ads by domain")}
        </sl-checkbox>
      `)}
      ${this.renderHelpTextCol(
        msg(
          html`Blocks advertising content from being loaded. Uses
            <a
              href="https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"
              class="text-blue-600 hover:text-blue-500"
              target="_blank"
              rel="noopener noreferrer nofollow"
              >Steven Black’s Hosts file</a
            >.`,
        ),
        false,
      )}
      ${this.renderFormCol(html`
        <sl-input
          name="userAgent"
          label=${msg("User Agent")}
          autocomplete="off"
          placeholder=${msg("Default")}
          value=${this.formState.userAgent || ""}
        >
        </sl-input>
      `)}
      ${this.renderHelpTextCol(
        msg(
          html`Set custom user agent for crawler browsers to use in requests.
            For common user agents see
            <a
              href="https://www.useragents.me/"
              class="text-blue-600 hover:text-blue-500"
              target="_blank"
              rel="noopener noreferrer nofollow"
              >Useragents.me</a
            >.`,
        ),
      )}
      ${this.renderFormCol(html`
        <btrix-language-select
          .value=${this.formState.lang as LanguageCode}
          @on-change=${(e: CustomEvent) => {
            this.updateFormState({
              lang: e.detail.value,
            });
          }}
        >
          <span slot="label">${msg("Language")}</span>
        </btrix-language-select>
      `)}
      ${this.renderHelpTextCol(
        msg(`Websites that observe the browser’s language setting may serve
        content in that language if available.`),
      )}
      ${this.renderFormCol(html`
        <btrix-select-crawler-socks-proxy-server
          orgId=${this.orgId}
          .crawlerSocksProxyServer="${this.formState.crawlerSocksProxyServer ||
          ""}"
          .authState=${this.authState}
          @on-change=${(e: SelectCrawlerSocksProxyServerChangeEvent) =>
            this.updateFormState({
              crawlerSocksProxyServer: e.detail.value,
            })}
        ></btrix-select-crawler-socks-proxy-server>
      `)}
      ${this.renderHelpTextCol(msg(`Choose a Browsertrix Socks Proxy Server`))}
    `;
  }

  private renderJobScheduling() {
    return html`
      ${this.renderFormCol(html`
        <sl-radio-group
          label=${msg("Crawl Schedule")}
          name="scheduleType"
          value=${this.formState.scheduleType}
          @sl-change=${(e: Event) =>
            this.updateFormState({
              scheduleType: (e.target as SlRadio)
                .value as FormState["scheduleType"],
            })}
        >
          <sl-radio value="none">${this.scheduleTypeLabels["none"]}</sl-radio>
          <sl-radio value="cron">${this.scheduleTypeLabels["cron"]}</sl-radio>
        </sl-radio-group>
      `)}
      ${this.renderHelpTextCol(
        msg(
          `Configure crawls to run every day, week, or month at a specified time.`,
        ),
      )}
      ${when(this.formState.scheduleType === "cron", this.renderScheduleCron)}
    `;
  }

  private readonly renderScheduleCron = () => {
    const utcSchedule = this.utcSchedule;
    return html`
      ${this.renderSectionHeading(msg("Set Schedule"))}
      ${this.renderFormCol(html`
        <sl-select
          name="scheduleFrequency"
          label=${msg("Frequency")}
          value=${this.formState.scheduleFrequency}
          @sl-change=${(e: Event) =>
            this.updateFormState({
              scheduleFrequency: (e.target as HTMLSelectElement)
                .value as FormState["scheduleFrequency"],
            })}
        >
          <sl-option value="daily"
            >${this.scheduleFrequencyLabels["daily"]}</sl-option
          >
          <sl-option value="weekly"
            >${this.scheduleFrequencyLabels["weekly"]}</sl-option
          >
          <sl-option value="monthly"
            >${this.scheduleFrequencyLabels["monthly"]}</sl-option
          >
        </sl-select>
      `)}
      ${this.renderHelpTextCol(
        msg(`Limit the frequency for how often a crawl will run.`),
      )}
      ${when(
        this.formState.scheduleFrequency === "weekly",
        () => html`
          ${this.renderFormCol(html`
            <sl-radio-group
              name="scheduleDayOfWeek"
              label=${msg("Day")}
              value=${ifDefined(this.formState.scheduleDayOfWeek)}
              @sl-change=${(e: Event) =>
                this.updateFormState({
                  scheduleDayOfWeek: +(e.target as SlRadioGroup).value,
                })}
            >
              ${this.daysOfWeek.map(
                (label, day) =>
                  html`<sl-radio-button value=${day}
                    >${label}</sl-radio-button
                  >`,
              )}
            </sl-radio-group>
          `)}
          ${this.renderHelpTextCol(
            msg(`What day of the week should a crawl run on?`),
          )}
        `,
      )}
      ${when(
        this.formState.scheduleFrequency === "monthly",
        () => html`
          ${this.renderFormCol(html`
            <sl-input
              name="scheduleDayOfMonth"
              label=${msg("Date")}
              type="number"
              inputmode="numeric"
              min="1"
              max="31"
              value=${ifDefined(this.formState.scheduleDayOfMonth)}
              required
            >
            </sl-input>
          `)}
          ${this.renderHelpTextCol(
            msg(`What day of the month should a crawl run on?`),
          )}
        `,
      )}
      ${this.renderFormCol(html`
        <btrix-time-input
          hour=${ifDefined(this.formState.scheduleTime?.hour)}
          minute=${ifDefined(this.formState.scheduleTime?.minute)}
          period=${ifDefined(this.formState.scheduleTime?.period)}
          @time-change=${(e: TimeInputChangeEvent) => {
            this.updateFormState({
              scheduleTime: e.detail,
            });
          }}
        >
          <span slot="label">${msg("Start Time")}</span>
        </btrix-time-input>
        <div class="mt-3 text-xs text-neutral-500">
          <p class="mb-1">
            ${msg(
              html`Schedule:
                <span class="text-blue-500"
                  >${utcSchedule
                    ? humanizeSchedule(utcSchedule)
                    : msg("Invalid date")}</span
                >.`,
            )}
          </p>
          <p>
            ${msg(
              html`Next scheduled run:
                <span
                  >${utcSchedule
                    ? humanizeNextDate(utcSchedule)
                    : msg("Invalid date")}</span
                >.`,
            )}
          </p>
        </div>
      `)}
      ${this.renderHelpTextCol(
        msg(`A crawl will run at this time in your current timezone.`),
      )}
    `;
  };

  private renderJobMetadata() {
    return html`
      ${this.renderFormCol(html`
        <sl-input
          class="with-max-help-text"
          name="jobName"
          label=${msg("Name")}
          autocomplete="off"
          placeholder=${msg("Our Website (example.com)")}
          value=${this.formState.jobName}
          help-text=${this.validateNameMax.helpText}
          @sl-input=${this.validateNameMax.validate}
        ></sl-input>
      `)}
      ${this.renderHelpTextCol(
        msg(`Customize this Workflow's name. Workflows are named after
        the first Crawl URL by default.`),
      )}
      ${this.renderFormCol(html`
        <sl-textarea
          class="with-max-help-text"
          name="description"
          label=${msg("Description")}
          autocomplete="off"
          value=${ifDefined(
            this.formState.description === null
              ? undefined
              : this.formState.description,
          )}
          help-text=${this.validateDescriptionMax.helpText}
          @sl-input=${this.validateDescriptionMax.validate}
        ></sl-textarea>
      `)}
      ${this.renderHelpTextCol(msg(`Provide details about this Workflow.`))}
      ${this.renderFormCol(html`
        <btrix-tag-input
          .initialTags=${this.formState.tags}
          .tagOptions=${this.tagOptions}
          @tag-input=${this.onTagInput}
          @tags-change=${(e: TagsChangeEvent) =>
            this.updateFormState(
              {
                tags: e.detail.tags,
              },
              true,
            )}
        ></btrix-tag-input>
      `)}
      ${this.renderHelpTextCol(
        msg(`Create or assign this crawl (and its outputs) to one or more tags
        to help organize your archived items.`),
      )}
      ${this.renderFormCol(html`
        <btrix-collections-add
          .authState=${this.authState}
          .initialCollections=${this.formState.autoAddCollections}
          .orgId=${this.orgId}
          .configId=${this.configId}
          emptyText=${msg("Search for a Collection to auto-add crawls")}
          @collections-change=${(e: CollectionsChangeEvent) =>
            this.updateFormState(
              {
                autoAddCollections: e.detail.collections,
              },
              true,
            )}
        ></btrix-collections-add>
      `)}
      ${this.renderHelpTextCol(
        msg(`Automatically add crawls from this workflow to one or more collections
          as soon as they complete.
          Individual crawls can be selected from within the collection later.`),
      )}
    `;
  }

  private renderErrorAlert(errorMessage: string | TemplateResult) {
    return html`
      <div class="col-span-5">
        <btrix-alert variant="danger">${errorMessage}</btrix-alert>
      </div>
    `;
  }

  private readonly renderConfirmSettings = () => {
    const errorAlert = when(this.formHasError, () => {
      const crawlSetupUrl = `${window.location.href.split("#")[0]}#crawlSetup`;
      const errorMessage = this.hasRequiredFields()
        ? msg(
            "There are issues with this Workflow. Please go through previous steps and fix all issues to continue.",
          )
        : msg(
            html`There is an issue with this Crawl Workflow:<br /><br />Crawl
              URL(s) required in
              <a
                href="${crawlSetupUrl}"
                class="bold underline hover:no-underline"
                >Crawl Setup</a
              >. <br /><br />
              Please fix to continue.`,
          );

      return this.renderErrorAlert(errorMessage);
    });

    return html`
      ${errorAlert}

      <div class="col-span-5">
        ${when(this.progressState!.activeTab === "confirmSettings", () => {
          // Prevent parsing and rendering tab when not visible
          const crawlConfig = this.parseConfig();
          const profileName = this.formState.browserProfile?.name;

          return html`<btrix-config-details
            .authState=${this.authState!}
            .crawlConfig=${{
              ...crawlConfig,
              profileName,
              oid: this.orgId,
              image: null,
            } as CrawlConfig}
            .seeds=${crawlConfig.config.seeds}
          >
          </btrix-config-details>`;
        })}
      </div>

      ${errorAlert}
    `;
  };

  private hasRequiredFields(): boolean {
    if (this.jobType === "seed-crawl") {
      return Boolean(this.formState.primarySeedUrl);
    }
    return Boolean(this.formState.urlList);
  }

  private async scrollToPanelTop() {
    const activeTabPanel = await this.activeTabPanel;
    if (activeTabPanel && activeTabPanel.getBoundingClientRect().top < 0) {
      activeTabPanel.scrollIntoView({
        behavior: "smooth",
      });
    }
  }

  private getDefaultJobName() {
    // Set default crawl name based on seed URLs
    if (!this.formState.primarySeedUrl && !this.formState.urlList) {
      return;
    }
    let jobName = "";
    if (this.jobType === "seed-crawl") {
      jobName = this.formState.primarySeedUrl;
    } else {
      const urlList = urlListToArray(this.formState.urlList);

      const firstUrl = urlList[0].trim();
      if (urlList.length > 1) {
        const remainder = urlList.length - 1;
        if (remainder === 1) {
          jobName = msg(str`${firstUrl} + ${remainder} more URL`);
        } else {
          jobName = msg(str`${firstUrl} + ${remainder} more URLs`);
        }
      } else {
        jobName = firstUrl;
      }
    }
    return jobName;
  }

  private async handleRemoveRegex(e: ExclusionRemoveEvent) {
    const { index } = e.detail;
    if (!this.formState.exclusions) {
      this.updateFormState(
        {
          exclusions: this.formState.exclusions,
        },
        true,
      );
    } else {
      const { exclusions: exclude } = this.formState;
      this.updateFormState(
        {
          exclusions: [...exclude.slice(0, index), ...exclude.slice(index + 1)],
        },
        true,
      );
    }

    // Check if we removed an erroring input
    const table = e.target as LitElement;
    await this.updateComplete;
    await table.updateComplete;
    this.syncTabErrorState(table);
  }

  private handleChangeRegex(e: ExclusionChangeEvent) {
    const { regex, index } = e.detail;

    const nextExclusions = [...this.formState.exclusions!];
    nextExclusions[index] = regex;
    this.updateFormState(
      {
        exclusions: nextExclusions,
      },
      true,
    );
  }

  private readonly validateOnBlur = async (e: Event) => {
    const el = e.target as SlInput | SlTextarea | SlSelect | SlCheckbox;
    const tagName = el.tagName.toLowerCase();
    if (
      !["sl-input", "sl-textarea", "sl-select", "sl-checkbox"].includes(tagName)
    ) {
      return;
    }
    await el.updateComplete;
    await this.updateComplete;

    const currentTab = this.progressState!.activeTab as StepName;
    // Check [data-user-invalid] to validate only touched inputs
    if ("userInvalid" in el.dataset) {
      if (this.progressState!.tabs[currentTab].error) return;
      this.updateProgressState({
        tabs: {
          [currentTab]: { error: true },
        },
      });
    } else if (this.progressState!.tabs[currentTab].error) {
      this.syncTabErrorState(el);
    }
  };

  private syncTabErrorState(el: HTMLElement) {
    const panelEl = el.closest("btrix-tab-panel")!;
    const tabName = panelEl
      .getAttribute("name")!
      .replace("newJobConfig-", "") as StepName;
    const hasInvalid = panelEl.querySelector("[data-user-invalid]");

    if (!hasInvalid && this.progressState!.tabs[tabName].error) {
      this.updateProgressState({
        tabs: {
          [tabName]: { error: false },
        },
      });
    } else if (hasInvalid && !this.progressState!.tabs[tabName].error) {
      this.updateProgressState({
        tabs: {
          [tabName]: { error: true },
        },
      });
    }
  }

  private updateFormStateOnChange(e: Event) {
    const elem = e.target as SlTextarea | SlInput | SlCheckbox;
    const name = elem.name;
    if (!Object.prototype.hasOwnProperty.call(this.formState, name)) {
      return;
    }
    const tagName = elem.tagName.toLowerCase();
    let value: boolean | string | null | number;
    switch (tagName) {
      case "sl-checkbox":
        value = (elem as SlCheckbox).checked;
        break;
      case "sl-textarea":
        value = elem.value;
        break;
      case "sl-input": {
        if ((elem as SlInput).type === "number") {
          if (elem.value === "") {
            value = null;
          } else {
            value = +elem.value;
          }
        } else {
          value = elem.value;
        }
        break;
      }
      default:
        return;
    }
    this.updateFormState({
      [name]: value,
    });
  }

  private readonly tabClickHandler = (step: StepName) => (e: MouseEvent) => {
    const tab = e.currentTarget as Tab;
    if (tab.disabled || tab.active) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    window.location.hash = step;
    this.updateProgressState({ activeTab: step });
  };

  private backStep() {
    const targetTabIdx = STEPS.indexOf(this.progressState!.activeTab);
    if (targetTabIdx) {
      this.updateProgressState({
        activeTab: STEPS[targetTabIdx - 1] as StepName,
      });
    }
  }

  private nextStep() {
    const isValid = this.checkCurrentPanelValidity();

    if (isValid) {
      const { activeTab } = this.progressState!;
      const nextTab = STEPS[STEPS.indexOf(activeTab) + 1] as StepName;
      this.updateProgressState({
        activeTab: nextTab,
        tabs: {
          [activeTab]: {
            completed: true,
          },
        },
      });
    }
  }

  private readonly checkCurrentPanelValidity = (): boolean => {
    if (!this.formElem) return false;

    const currentTab = this.progressState!.activeTab as StepName;
    const activePanel = this.formElem.querySelector(
      `btrix-tab-panel[name="newJobConfig-${currentTab}"]`,
    );
    const invalidElems = [...activePanel!.querySelectorAll("[data-invalid]")];

    const hasInvalid = Boolean(invalidElems.length);
    if (hasInvalid) {
      invalidElems.forEach((el) => {
        (el as HTMLInputElement).reportValidity();
      });
    }

    return !hasInvalid;
  };

  private onKeyDown(event: KeyboardEvent) {
    const el = event.target as HTMLElement;
    const tagName = el.tagName.toLowerCase();
    if (tagName !== "sl-input") return;
    const { key } = event;
    if ((el as SlInput).type === "number") {
      // Prevent typing non-numeric keys
      if (
        !event.metaKey &&
        !event.shiftKey &&
        key.length === 1 &&
        /\D/.test(key)
      ) {
        event.preventDefault();
        return;
      }
    }
    if (
      key === "Enter" &&
      this.progressState!.activeTab !== STEPS[STEPS.length - 1]
    ) {
      // Prevent submission by "Enter" keypress if not on last tab
      event.preventDefault();
    }
  }

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const isValid = this.checkCurrentPanelValidity();
    await this.updateComplete;

    if (!isValid || this.formHasError) {
      return;
    }

    const config = this.parseConfig();
    this.isSubmitting = true;

    try {
      const data = await (this.configId
        ? this.apiFetch<CrawlConfigResponse>(
            `/orgs/${this.orgId}/crawlconfigs/${this.configId}`,
            this.authState!,
            {
              method: "PATCH",
              body: JSON.stringify(config),
            },
          )
        : this.apiFetch<CrawlConfigResponse>(
            `/orgs/${this.orgId}/crawlconfigs/`,
            this.authState!,
            {
              method: "POST",
              body: JSON.stringify(config),
            },
          ));

      const crawlId = data.run_now_job || data.started || null;
      const storageQuotaReached = data.storageQuotaReached;
      const executionMinutesQuotaReached = data.execMinutesQuotaReached;

      let message = msg("Workflow created.");
      if (crawlId) {
        message = msg("Crawl started with new workflow settings.");
      } else if (this.configId) {
        message = msg("Workflow updated.");
      }

      this.notify({
        message,
        variant: "success",
        icon: "check2-circle",
      });

      this.navTo(
        `${this.orgBasePath}/workflows/crawl/${this.configId || data.id}${
          crawlId && !storageQuotaReached && !executionMinutesQuotaReached
            ? "#watch"
            : ""
        }`,
      );
    } catch (e) {
      if (isApiError(e)) {
        if (e.details === "crawl_already_running") {
          this.notify({
            title: msg("Workflow saved without starting crawl."),
            message: msg(
              "Could not run crawl with new workflow settings due to already running crawl.",
            ),
            variant: "warning",
            icon: "exclamation-circle",
            duration: 12000,
          });
        } else {
          const isConfigError = ({ loc }: Detail) =>
            loc.some((v: string) => v === "config");
          if (Array.isArray(e.details) && e.details.some(isConfigError)) {
            this.serverError = this.formatConfigServerError(e.details);
          } else {
            this.serverError = e.message;
          }
        }
      } else {
        this.serverError = msg("Something unexpected went wrong");
      }
    }

    this.isSubmitting = false;
  }

  private async onReset() {
    this.initializeEditor();
  }

  /**
   * Format `config` related API error returned from server
   */
  private formatConfigServerError(details: Detail[]): TemplateResult {
    const detailsWithoutDictError = details.filter(
      ({ type }) => type !== "type_error.dict",
    );

    const renderDetail = ({ loc, msg: detailMsg }: Detail) => html`
      <li>
        ${loc.some((v: string) => v === "seeds") &&
        typeof loc[loc.length - 1] === "number"
          ? msg(str`Seed URL ${loc[loc.length - 1] + 1}: `)
          : `${loc[loc.length - 1]}: `}
        ${detailMsg}
      </li>
    `;

    return html`
      ${msg(
        "Couldn't save Workflow. Please fix the following Workflow issues:",
      )}
      <ul class="w-fit list-disc pl-4">
        ${detailsWithoutDictError.map(renderDetail)}
      </ul>
    `;
  }

  private validateUrlList(
    value: string,
    max = URL_LIST_MAX_URLS,
  ): { isValid: boolean; helpText: string } {
    const urlList = urlListToArray(value);
    let isValid = true;
    let helpText =
      urlList.length === 1
        ? msg(str`${urlList.length.toLocaleString()} URL entered`)
        : msg(str`${urlList.length.toLocaleString()} URLs entered`);
    if (urlList.length > max) {
      isValid = false;
      helpText = msg(
        str`Please shorten list to ${max.toLocaleString()} or fewer URLs.`,
      );
    } else {
      const invalidUrl = urlList.find((url) => !validURL(url));
      if (invalidUrl) {
        isValid = false;
        helpText = msg(
          str`Please remove or fix the following invalid URL: ${invalidUrl}`,
        );
      }
    }
    return { isValid, helpText };
  }

  private readonly onTagInput = (e: TagInputEvent) => {
    const { value } = e.detail;
    if (!value) return;
    this.tagOptions = this.fuse.search(value).map(({ item }) => item);
  };

  private async fetchTags() {
    this.tagOptions = [];
    try {
      const tags = await this.apiFetch<string[]>(
        `/orgs/${this.orgId}/crawlconfigs/tags`,
        this.authState!,
      );

      // Update search/filter collection
      this.fuse.setCollection(tags);
    } catch (e) {
      // Fail silently, since users can still enter tags
      console.debug(e);
    }
  }

  private parseConfig(): NewCrawlConfigParams {
    const config: NewCrawlConfigParams = {
      jobType: this.jobType || "custom",
      name: this.formState.jobName || "",
      description: this.formState.description,
      scale: this.formState.scale,
      profileid: this.formState.browserProfile?.id || "",
      runNow: this.formState.runNow,
      schedule: this.formState.scheduleType === "cron" ? this.utcSchedule : "",
      crawlTimeout: this.formState.crawlTimeoutMinutes * 60,
      maxCrawlSize: this.formState.maxCrawlSizeGB * BYTES_PER_GB,
      tags: this.formState.tags,
      autoAddCollections: this.formState.autoAddCollections,
      config: {
        ...(this.jobType === "seed-crawl"
          ? this.parseSeededConfig()
          : this.parseUrlListConfig()),
        behaviorTimeout: this.formState.behaviorTimeoutSeconds,
        pageLoadTimeout: this.formState.pageLoadTimeoutSeconds,
        pageExtraDelay: this.formState.pageExtraDelaySeconds,
        postLoadDelay: this.formState.postLoadDelaySeconds,
        userAgent: this.formState.userAgent,
        limit: this.formState.pageLimit,
        lang: this.formState.lang || "",
        blockAds: this.formState.blockAds,
        exclude: trimArray(this.formState.exclusions),
        behaviors: (this.formState.autoscrollBehavior
          ? DEFAULT_BEHAVIORS
          : DEFAULT_BEHAVIORS.slice(1)
        ).join(","),
      },
      crawlerChannel: this.formState.crawlerChannel || "default",
      crawlerSocksProxyServer: this.formState.crawlerSocksProxyServer,
    };

    return config;
  }

  private parseUrlListConfig(): Pick<
    NewCrawlConfigParams["config"],
    "seeds" | "scopeType" | "extraHops" | "useSitemap" | "failOnFailedSeed"
  > {
    const config = {
      seeds: urlListToArray(this.formState.urlList).map((seedUrl) => {
        const newSeed: Seed = { url: seedUrl, scopeType: "page" };
        return newSeed;
      }),
      scopeType: "page" as FormState["scopeType"],
      extraHops: this.formState.includeLinkedPages ? 1 : 0,
      useSitemap: false,
      failOnFailedSeed: this.formState.failOnFailedSeed,
    };

    return config;
  }

  private parseSeededConfig(): Pick<
    NewCrawlConfigParams["config"],
    "seeds" | "scopeType" | "useSitemap" | "failOnFailedSeed"
  > {
    const primarySeedUrl = this.formState.primarySeedUrl;
    const includeUrlList = this.formState.customIncludeUrlList
      ? urlListToArray(this.formState.customIncludeUrlList)
      : [];
    const additionalSeedUrlList = this.formState.urlList
      ? urlListToArray(this.formState.urlList).map((seedUrl) => {
          const newSeed: Seed = { url: seedUrl, scopeType: "page" };
          return newSeed;
        })
      : [];
    const primarySeed: Seed = {
      url: primarySeedUrl,
      // the 'custom' scope here indicates we have extra URLs, actually set to 'prefix'
      // scope on backend to ensure seed URL is also added as part of standard prefix scope
      scopeType:
        this.formState.scopeType === "custom"
          ? "prefix"
          : this.formState.scopeType,
      include:
        this.formState.scopeType === "custom"
          ? [...includeUrlList.map((url) => regexEscape(url))]
          : [],
      extraHops: this.formState.includeLinkedPages ? 1 : 0,
    };

    if (DEPTH_SUPPORTED_SCOPES.includes(this.formState.scopeType!)) {
      primarySeed.depth = this.formState.maxScopeDepth;
    }

    const config = {
      seeds: [primarySeed, ...additionalSeedUrlList],
      scopeType: this.formState.scopeType,
      useSitemap: this.formState.useSitemap,
      failOnFailedSeed: false,
    };
    return config;
  }

  private updateProgressState(
    nextState: {
      activeTab?: ProgressState["activeTab"];
      tabs?: {
        [K in StepName]?: Partial<TabState>;
      };
    },
    shallowMerge = false,
  ) {
    if (shallowMerge) {
      this.progressState = {
        ...this.progressState!,
        ...(nextState as Partial<ProgressState>),
      };
    } else {
      this.progressState = mergeDeep(this.progressState, nextState);
    }
  }

  private updateFormState(nextState: Partial<FormState>, shallowMerge = false) {
    if (shallowMerge) {
      this.formState = {
        ...this.formState,
        ...nextState,
      };
    } else {
      this.formState = mergeDeep(this.formState, nextState);
    }
  }

  private async fetchAPIDefaults() {
    try {
      const resp = await fetch("/api/settings", {
        headers: { "Content-Type": "application/json" },
      });
      if (!resp.ok) {
        throw new Error(resp.statusText);
      }
      const orgDefaults = {
        ...this.orgDefaults,
      };
      const data = await resp.json();
      if (data.defaultBehaviorTimeSeconds > 0) {
        orgDefaults.behaviorTimeoutSeconds = data.defaultBehaviorTimeSeconds;
      }
      if (data.defaultPageLoadTimeSeconds > 0) {
        orgDefaults.pageLoadTimeoutSeconds = data.defaultPageLoadTimeSeconds;
      }
      if (data.maxPagesPerCrawl > 0) {
        orgDefaults.maxPagesPerCrawl = data.maxPagesPerCrawl;
      }
      if (data.maxScale) {
        this.maxScale = data.maxScale;
      }
      this.orgDefaults = orgDefaults;
    } catch (e) {
      console.debug(e);
    }
  }

  private async fetchOrgQuotaDefaults() {
    try {
      const data = await this.apiFetch<{
        quotas: { maxPagesPerCrawl?: number };
      }>(`/orgs/${this.orgId}`, this.authState!);
      const orgDefaults = {
        ...this.orgDefaults,
      };
      if (data.quotas.maxPagesPerCrawl && data.quotas.maxPagesPerCrawl > 0) {
        orgDefaults.maxPagesPerCrawl = data.quotas.maxPagesPerCrawl;
      }
      this.orgDefaults = orgDefaults;
    } catch (e) {
      console.debug(e);
    }
  }
}
