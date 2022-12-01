import type { TemplateResult } from "lit";
import type {
  SlCheckbox,
  SlInput,
  SlRadio,
  SlSelect,
  SlTextarea,
} from "@shoelace-style/shoelace";
import { state, property, query } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { msg, localized, str } from "@lit/localize";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { ifDefined } from "lit/directives/if-defined.js";
import compact from "lodash/fp/compact";
import flow from "lodash/fp/flow";
import merge from "lodash/fp/merge";
import uniq from "lodash/fp/uniq";

import LiteElement, { html } from "../../utils/LiteElement";
import { regexEscape } from "../../utils/string";
import type { AuthState } from "../../utils/AuthService";
import {
  getUTCSchedule,
  humanizeSchedule,
  humanizeNextDate,
} from "../../utils/cron";
import type { Tab } from "../../components/tab-list";
import type {
  ExclusionRemoveEvent,
  ExclusionChangeEvent,
} from "../../components/queue-exclusion-table";
import type { TimeInputChangeEvent } from "../../components/time-input";
import type { JobConfig, NewJobConfigParams } from "./types";

export type InitialJobConfig = Pick<JobConfig, "name" | "profileid"> & {
  config: Pick<JobConfig["config"], "seeds" | "scopeType" | "exclude">;
};
export type JobType = "urlList" | "seeded";
type StepName =
  | "crawlerSetup"
  | "browserSettings"
  | "jobScheduling"
  | "jobInformation";
type Tabs = Record<
  StepName,
  {
    enabled: boolean;
    completed: boolean;
    error: boolean;
  }
>;
type ProgressState = {
  currentStep: StepName;
  activeTab: StepName;
  tabs: Tabs;
};
type FormState = {
  primarySeedUrl: string;
  urlList: string;
  includeLinkedPages: boolean;
  allowedExternalUrlList: string;
  jobTimeoutMinutes: number | null;
  pageTimeoutMinutes: number | null;
  scopeType: "prefix" | "host" | "domain" | "page" | "page-spa" | "custom";
  exclusions: NewJobConfigParams["config"]["exclude"];
  pageLimit: NewJobConfigParams["config"]["limit"];
  scale: NewJobConfigParams["scale"];
  profileid: NewJobConfigParams["profileid"];
  blockAds: NewJobConfigParams["config"]["blockAds"];
  lang: NewJobConfigParams["config"]["lang"];
  scheduleType: "now" | "date" | "cron";
  scheduleFrequency: "daily" | "weekly" | "monthly";
  scheduleDayOfMonth: number;
  scheduleDayOfWeek: number;
  scheduleTime: {
    hour: number;
    minute: number;
    period: "AM" | "PM";
  };
  runNow: boolean;
  jobName: NewJobConfigParams["name"];
};
const getDefaultProgressState = (): ProgressState => ({
  activeTab: "crawlerSetup",
  currentStep: "crawlerSetup",
  tabs: {
    crawlerSetup: { enabled: true, error: false, completed: false },
    browserSettings: { enabled: false, error: false, completed: false },
    jobScheduling: { enabled: false, error: false, completed: false },
    jobInformation: { enabled: false, error: false, completed: false },
  },
});
const getDefaultFormState = (): FormState => ({
  primarySeedUrl: "",
  urlList: "",
  includeLinkedPages: false,
  allowedExternalUrlList: "",
  jobTimeoutMinutes: null,
  pageTimeoutMinutes: null,
  scopeType: "host",
  exclusions: [""], // Empty slots for adding exclusions
  pageLimit: null,
  scale: 1,
  profileid: null,
  blockAds: true,
  lang: null,
  scheduleType: "now",
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
});
const stepOrder: StepName[] = [
  "crawlerSetup",
  "browserSettings",
  "jobScheduling",
  "jobInformation",
];
const defaultProgressState = getDefaultProgressState();
const orderedTabNames = stepOrder.filter(
  (stepName) => defaultProgressState.tabs[stepName as StepName]
) as StepName[];

function getLocalizedWeekDays() {
  const now = new Date();
  // TODO accept locale from locale-picker
  const { format } = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  return Array.from({ length: 7 }).map((x, day) =>
    format(Date.now() - (now.getDay() - day) * 86400000)
  );
}

function validURL(url: string) {
  return /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/.test(
    url
  );
}

const trimExclusions = flow(uniq, compact);

@localized()
export class NewJobConfig extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @property({ type: String })
  jobType?: JobType;

  @property({ type: Object })
  initialJobConfig?: InitialJobConfig;

  @state()
  private isSubmitting = false;

  @state()
  private progressState!: ProgressState;

  @state()
  private formState!: FormState;

  @state()
  private serverError?: TemplateResult | string;

  private get formHasError() {
    return Object.values(this.progressState.tabs).some(({ error }) => error);
  }

  private daysOfWeek = getLocalizedWeekDays();

  @query('form[name="newJobConfig"]')
  formElem?: HTMLFormElement;

  constructor() {
    super();
    this.progressState = getDefaultProgressState();
    this.formState = getDefaultFormState();
    if (!this.formState.lang) {
      this.formState.lang = this.getInitialLang();
    }
  }

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("initialJobConfig") && this.initialJobConfig) {
      this.updateFormState(this.getInitialFormState());
    }
  }

  private getInitialLang() {
    // Default to current user browser language
    const browserLanguage = navigator.languages?.length
      ? navigator.languages[0]
      : navigator.language;
    if (browserLanguage) {
      return browserLanguage.slice(0, browserLanguage.indexOf("-"));
    }
    return null;
  }

  private getInitialFormState() {
    if (!this.initialJobConfig) return {};
    return {
      jobName: this.initialJobConfig.name,
      profileid: this.initialJobConfig.profileid,
      scopeType: this.initialJobConfig.config
        .scopeType as FormState["scopeType"],
      exclusions: this.initialJobConfig.config.exclude,
      urlList: this.initialJobConfig.config.seeds
        .map((seed) => (typeof seed === "string" ? seed : seed.url))
        .join("\n"),
    };
  }

  render() {
    const tabLabels: Record<StepName, string> = {
      crawlerSetup: msg("Crawler Setup"),
      browserSettings: msg("Browser Settings"),
      jobScheduling: msg("Job Scheduling"),
      jobInformation: msg("Job Information"),
    };

    return html`
      <header class="ml-48 mb-3 flex justify-between items-baseline">
        <h3 class="text-lg font-medium">
          ${tabLabels[this.progressState.activeTab]}
        </h3>
        <p class="text-xs text-neutral-500">
          ${msg(
            html`Fields marked with
              <span style="color:var(--sl-input-required-content-color)"
                >*</span
              >
              are required`
          )}
        </p>
      </header>

      <form
        name="newJobConfig"
        @reset=${this.onReset}
        @submit=${this.onSubmit}
        @keydown=${this.preventSubmit}
        @sl-blur=${this.validateOnBlur}
      >
        <btrix-tab-list
          activePanel="newJobConfig-${this.progressState.activeTab}"
          progressPanel="newJobConfig-${this.progressState.currentStep}"
        >
          ${orderedTabNames.map((tabName) =>
            this.renderNavItem(tabName, tabLabels[tabName])
          )}

          <btrix-tab-panel name="newJobConfig-crawlerSetup">
            ${this.renderPanelContent(
              html`
                ${when(this.jobType === "urlList", this.renderUrlListSetup)}
                ${when(this.jobType === "seeded", this.renderSeededCrawlSetup)}
              `,
              { isFirst: true }
            )}
          </btrix-tab-panel>
          <btrix-tab-panel name="newJobConfig-browserSettings">
            ${this.renderPanelContent(this.renderCrawlBehaviors())}
          </btrix-tab-panel>
          <btrix-tab-panel name="newJobConfig-jobScheduling">
            ${this.renderPanelContent(this.renderJobScheduling())}
          </btrix-tab-panel>
          <btrix-tab-panel name="newJobConfig-jobInformation">
            ${this.renderPanelContent(this.renderJobInformation(), {
              isLast: true,
            })}
          </btrix-tab-panel>
        </btrix-tab-list>
      </form>
    `;
  }

  private renderNavItem(tabName: StepName, content: TemplateResult | string) {
    const isActive = tabName === this.progressState.activeTab;
    const { error: isInvalid, completed } = this.progressState.tabs[tabName];
    let icon = html`
      <sl-icon
        name="circle"
        class="inline-block align-middle mr-1 text-base text-neutral-300"
      ></sl-icon>
    `;
    if (isInvalid) {
      icon = html`
        <sl-icon
          name="exclamation-circle"
          class="inline-block align-middle mr-1 text-base text-danger"
        ></sl-icon>
      `;
    } else if (isActive) {
      icon = html`
        <sl-icon
          library="app"
          name="pencil-circle-dashed"
          class="inline-block align-middle mr-1 text-base"
        ></sl-icon>
      `;
    } else if (completed) {
      icon = html`
        <sl-icon
          name="check-circle"
          class="inline-block align-middle mr-1 text-base text-success"
        ></sl-icon>
      `;
    }

    return html`
      <btrix-tab
        slot="nav"
        name="newJobConfig-${tabName}"
        class="whitespace-nowrap"
        ?disabled=${!this.progressState.tabs[tabName].enabled}
        @click=${this.tabClickHandler(tabName)}
      >
        ${icon}
        <span class="inline-block align-middle whitespace-normal">
          ${content}
        </span>
      </btrix-tab>
    `;
  }

  private renderPanelContent(
    content: TemplateResult,
    { isFirst = false, isLast = false } = {}
  ) {
    return html`
      <div class="flex flex-col h-full">
        <div class="flex-1 p-6 grid grid-cols-1 md:grid-cols-5 gap-6">
          ${content}
        </div>
        ${this.renderFooter({ isFirst, isLast })}
      </div>
    `;
  }

  private renderFooter({ isFirst = false, isLast = false }) {
    return html`
      <div class="px-6 py-4 border-t flex justify-between">
        ${isFirst
          ? html`
              <sl-button size="small" type="reset">
                <sl-icon slot="prefix" name="arrow-left"></sl-icon>
                ${msg("Start Over")}
              </sl-button>
            `
          : html`
              <sl-button size="small" @click=${this.backStep}>
                <sl-icon slot="prefix" name="arrow-left"></sl-icon>
                ${msg("Previous Step")}
              </sl-button>
            `}
        ${isLast
          ? html`<sl-button
              type="submit"
              size="small"
              variant="primary"
              ?disabled=${this.isSubmitting}
              ?loading=${this.isSubmitting}
            >
              ${this.formState.runNow
                ? msg("Save & Run Job")
                : msg("Save & Schedule Job")}
            </sl-button>`
          : html`<sl-button
              size="small"
              variant="primary"
              @click=${this.nextStep}
            >
              <sl-icon slot="suffix" name="arrow-right"></sl-icon>
              ${msg("Next Step")}
            </sl-button>`}
      </div>
    `;
  }

  private renderSectionHeading(content: TemplateResult | string) {
    return html`
      <h4
        class="col-span-1 md:col-span-5 text-neutral-500 leading-none py-2 border-b"
      >
        ${content}
      </h4>
    `;
  }

  private renderFormCol = (content: TemplateResult) => {
    return html` <div class="col-span-1 md:col-span-3">${content}</div> `;
  };

  private renderHelpTextCol(content: TemplateResult) {
    return html`
      <div class="col-span-1 md:col-span-2 flex">
        <div class="text-base mr-2">
          <sl-icon name="info-circle"></sl-icon>
        </div>
        <div class="mt-0.5 text-xs text-neutral-500">${content}</div>
      </div>
    `;
  }

  private renderUrlListSetup = () => {
    return html`
      ${this.renderFormCol(html`
        <sl-textarea
          name="urlList"
          label=${msg("List of URLs")}
          rows="10"
          autocomplete="off"
          value=${this.formState.urlList}
          placeholder=${`https://example.com
https://example.com/path`}
          required
        ></sl-textarea>
      `)}
      ${this.renderHelpTextCol(
        html`The crawler will visit and record each URL listed in the order
        defined here.`
      )}
      ${this.renderFormCol(html`<sl-checkbox
        name="includeLinkedPages"
        ?checked=${this.formState.includeLinkedPages}
        @sl-change=${(e: Event) =>
          this.updateFormState({
            includeLinkedPages: (e.target as SlCheckbox).checked,
          })}
      >
        ${msg("Include Linked Pages")}
      </sl-checkbox>`)}
      ${this.renderHelpTextCol(
        html`If checked, the crawler will visit pages one link away from a Crawl
        URL.`
      )}
      ${when(
        this.formState.includeLinkedPages,
        () => html`
          ${this.renderSectionHeading(msg("Crawl URL Limits"))}
          ${this.renderFormCol(html`
            <btrix-queue-exclusion-table
              .exclusions=${this.formState.exclusions}
              pageSize="50"
              editable
              removable
              @on-remove=${this.handleRemoveRegex}
              @on-change=${this.handleChangeRegex}
            ></btrix-queue-exclusion-table>
            <sl-button
              class="w-full mt-1"
              @click=${() =>
                this.updateFormState({
                  exclusions: [...(this.formState.exclusions || []), ""],
                })}
            >
              <sl-icon slot="prefix" name="plus-lg"></sl-icon>
              <span class="text-neutral-600">${msg("Add More")}</span>
            </sl-button>
          `)}
          ${this.renderHelpTextCol(
            html`Specify exclusion rules for what pages should not be visited.
            Exclusions apply to all URLs.`
          )}
        `
      )}
      ${this.renderCrawlScale()}
    `;
  };

  private renderSeededCrawlSetup = () => {
    const urlPlaceholder = "https://example.com";
    let exampleUrl = new URL(urlPlaceholder);
    if (this.formState.primarySeedUrl) {
      try {
        exampleUrl = new URL(this.formState.primarySeedUrl);
      } catch {}
    }
    const exampleHost = exampleUrl.host;
    const exampleProtocol = exampleUrl.protocol;
    const examplePathname = exampleUrl.pathname.replace(/\/$/, "");
    const exampleDomain = `${exampleProtocol}//${exampleHost}`;

    let helpText: TemplateResult | string;

    switch (this.formState.scopeType) {
      case "prefix":
        helpText = msg(
          html`Will crawl all page URLs that begin with
            <span class="text-blue-500 break-word"
              >${exampleDomain}${examplePathname}</span
            >, e.g.
            <span class="text-blue-500 break-word break-word"
              >${exampleDomain}${examplePathname}</span
            ><span class="text-blue-500 font-medium break-word"
              >/path/page.html</span
            >`
        );
        break;
      case "host":
        helpText = msg(
          html`Will crawl all pages on
            <span class="text-blue-500">${exampleHost}</span> and ignore pages
            on any subdomains.`
        );
        break;
      case "domain":
        helpText = msg(
          html`Will crawl all pages on
            <span class="text-blue-500">${exampleHost}</span> and
            <span class="text-blue-500">subdomain.${exampleHost}</span>.`
        );
        break;
      case "page-spa":
        helpText = msg(
          html`Will only visit
            <span class="text-blue-500 break-word"
              >${exampleDomain}${examplePathname}</span
            >
            and links that stay within the same URL, e.g. hash anchor links:
            <span class="text-blue-500 break-word"
              >${exampleDomain}${examplePathname}</span
            ><span class="text-blue-500 font-medium break-word"
              >#example-page</span
            >`
        );
        break;
      default:
        helpText = "";
        break;
    }

    return html`
      ${this.renderFormCol(html`
        <sl-input
          name="primarySeedUrl"
          label=${msg("Crawl Start URL")}
          autocomplete="off"
          placeholder=${urlPlaceholder}
          value=${this.formState.primarySeedUrl}
          required
          @sl-input=${async (e: Event) => {
            const inputEl = e.target as SlInput;
            await inputEl.updateComplete;
            if (inputEl.invalid && validURL(inputEl.value)) {
              inputEl.setCustomValidity("");
              inputEl.helpText = "";
            }
          }}
          @sl-change=${(e: Event) => {
            const inputEl = e.target as SlInput;
            this.updateFormState({
              primarySeedUrl: inputEl.value,
            });
          }}
          @sl-blur=${async (e: Event) => {
            const inputEl = e.target as SlInput;
            await inputEl.updateComplete;
            if (inputEl.value && !validURL(inputEl.value)) {
              const text = msg("Please enter a valid URL.");
              inputEl.invalid = true;
              inputEl.helpText = text;
              inputEl.setCustomValidity(text);
            }
          }}
        ></sl-input>
      `)}
      ${this.renderHelpTextCol(html`The starting point of your crawl.`)}
      ${this.renderFormCol(html`
        <sl-select
          name="scopeType"
          label=${msg("Crawl Scope")}
          defaultValue=${this.formState.scopeType}
          value=${this.formState.scopeType}
          @sl-select=${(e: Event) =>
            this.updateFormState({
              scopeType: (e.target as HTMLSelectElement)
                .value as FormState["scopeType"],
            })}
        >
          <div slot="help-text">${helpText}</div>
          <sl-menu-item value="prefix">
            ${msg("Path Begins with This URL")}
          </sl-menu-item>
          <sl-menu-item value="host">
            ${msg("Pages on This Domain")}
          </sl-menu-item>
          <sl-menu-item value="domain">
            ${msg("Pages on This Domain & Subdomains")}
          </sl-menu-item>
          <sl-divider></sl-divider>
          <sl-menu-label>${msg("Advanced Options")}</sl-menu-label>
          <sl-menu-item value="page-spa">
            ${msg("Single Page App (In-Page Links Only)")}
          </sl-menu-item>
        </sl-select>
      `)}
      ${this.renderHelpTextCol(
        html`Tells the crawler which pages it can visit.`
      )}
      ${this.renderSectionHeading(msg("Additional Pages"))}
      ${this.renderFormCol(html`
        <sl-textarea
          name="allowedExternalUrlList"
          label=${msg("Allowed URL Prefixes")}
          rows="3"
          autocomplete="off"
          value=${this.formState.allowedExternalUrlList}
          placeholder=${`https://example.org/page/
https://example.net`}
          ?disabled=${this.formState.scopeType === "page-spa"}
        ></sl-textarea>
      `)}
      ${this.renderHelpTextCol(
        html`Crawl pages outside of Crawl Scope that begin with these URLs.`
      )}
      ${this.renderFormCol(html`
        <sl-checkbox
          name="includeLinkedPages"
          ?checked=${this.formState.includeLinkedPages}
          @sl-change=${(e: Event) =>
            this.updateFormState({
              includeLinkedPages: (e.target as SlCheckbox).checked,
            })}
        >
          ${msg("Include Any Linked Page (“one hop out”)")}
        </sl-checkbox>
      `)}
      ${this.renderHelpTextCol(
        html`If checked, the crawler will visit pages one link away outside of
        Crawl Scope.`
      )}
      ${this.renderSectionHeading(msg("Crawl Limits"))}
      ${this.renderFormCol(html`
        <sl-input
          name="pageLimit"
          label=${msg("Page Limit")}
          type="number"
          defaultValue=${this.formState.pageLimit || ""}
          placeholder=${msg("Unlimited")}
        >
          <span slot="suffix">${msg("pages")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(html`Adds a hard limit on the number of pages
      that will be crawled for this job.`)}
      ${this.renderFormCol(html`
        <btrix-queue-exclusion-table
          .exclusions=${this.formState.exclusions}
          pageSize="50"
          editable
          removable
          @on-remove=${this.handleRemoveRegex}
          @on-change=${this.handleChangeRegex}
        ></btrix-queue-exclusion-table>
        <sl-button
          class="w-full mt-1"
          @click=${() =>
            this.updateFormState({
              exclusions: [...(this.formState.exclusions || []), ""],
            })}
        >
          <sl-icon slot="prefix" name="plus-lg"></sl-icon>
          <span class="text-neutral-600">${msg("Add More")}</span>
        </sl-button>
      `)}
      ${this.renderHelpTextCol(
        html`Specify exclusion rules for what pages should not be visited.`
      )}
      ${this.renderCrawlScale()}
    `;
  };

  private renderCrawlScale() {
    return html`
      ${this.renderSectionHeading(msg("Crawl Job Limits"))}
      ${this.renderFormCol(html`
        <sl-input
          name="jobTimeoutMinutes"
          label=${msg("Total Job Time Limit")}
          placeholder=${msg("Unlimited")}
          type="number"
        >
          <span slot="suffix">${msg("minutes")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(
        html`Gracefully stop the crawler after a specified time limit.`
      )}
      ${this.renderFormCol(html`
        <sl-radio-group
          name="scale"
          label=${msg("Crawler Instances")}
          value=${this.formState.scale}
        >
          <sl-radio-button value="1" size="small">1</sl-radio-button>
          <sl-radio-button value="2" size="small">2</sl-radio-button>
          <sl-radio-button value="3" size="small">3</sl-radio-button>
        </sl-radio-group>
      `)}
      ${this.renderHelpTextCol(
        html`Increasing parallel crawler instances will speed up crawls, but
        take up more system resources.`
      )}
    `;
  }

  private renderCrawlBehaviors() {
    return html`
      ${this.renderFormCol(html`
        <btrix-select-browser-profile
          archiveId=${this.archiveId}
          .profileId=${this.formState.profileid}
          .authState=${this.authState}
          @on-change=${(e: any) =>
            this.updateFormState({
              profileid: e.detail.value,
            })}
        ></btrix-select-browser-profile>
      `)}
      ${this.renderHelpTextCol(
        html`Choose a custom profile to make use of saved cookies and logged-in
        accounts.`
      )}
      ${this.renderFormCol(html`
        <sl-checkbox
          name="blockAds"
          ?checked=${this.formState.blockAds}
          @sl-change=${(e: Event) =>
            this.updateFormState({
              blockAds: (e.target as SlCheckbox).checked,
            })}
        >
          ${msg("Block Ads by Domain")}
        </sl-checkbox>
      `)}
      ${this.renderHelpTextCol(
        html`Blocks advertising content from being loaded. Uses
          <a
            href="https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"
            class="text-blue-600 hover:text-blue-500"
            target="_blank"
            rel="noopener noreferrer nofollow"
            >Steven Black’s Hosts file</a
          >.`
      )}
      ${this.renderFormCol(html`
        <btrix-language-select
          .value=${this.formState.lang}
          @sl-select=${(e: CustomEvent) =>
            this.updateFormState({
              lang: e.detail.item.value,
            })}
          @sl-clear=${() => {
            this.updateFormState({
              lang: null,
            });
          }}
        >
          <span slot="label">${msg("Language")}</span>
        </btrix-language-select>
      `)}
      ${this.renderHelpTextCol(
        html`Websites that observe the browser’s language setting may serve
        content in that language if available.`
      )}
      ${this.renderSectionHeading(msg("On-Page Behavior"))}
      ${this.renderFormCol(html`
        <sl-input
          name="pageTimeoutMinutes"
          type="number"
          label=${msg("Page Time Limit")}
          placeholder=${msg("Unlimited")}
          value=${ifDefined(this.formState.pageTimeoutMinutes || undefined)}
        >
          <span slot="suffix">${msg("minutes")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(
        html`Adds a hard time limit for how long the crawler can spend on a
        single webpage.`
      )}
    `;
  }

  private renderJobScheduling() {
    return html`
      ${this.renderFormCol(html`
        <sl-radio-group
          label=${msg("Job Schedule Type")}
          name="scheduleType"
          value=${this.formState.scheduleType}
          @sl-change=${(e: Event) =>
            this.updateFormState({
              scheduleType: (e.target as SlRadio)
                .value as FormState["scheduleType"],
              runNow: (e.target as SlRadio).value === "now",
            })}
        >
          <sl-radio value="now">${msg("Run Immediately on Save")}</sl-radio>
          <sl-radio value="cron">${msg("Run on a Recurring Basis")}</sl-radio>
        </sl-radio-group>
      `)}
      ${this.renderHelpTextCol(
        html`Should this job run immediately when setup is complete, on a set
        day, or on a recurring schedule?`
      )}
      ${when(this.formState.scheduleType === "cron", this.renderScheduleCron)}
    `;
  }

  private renderScheduleCron = () => {
    const utcSchedule = getUTCSchedule({
      interval: this.formState.scheduleFrequency,
      ...this.formState.scheduleTime,
    });
    return html`
      ${this.renderSectionHeading(msg("Set Schedule"))}
      ${this.renderFormCol(html`
        <sl-select
          name="scheduleFrequency"
          label=${msg("Frequency")}
          value=${this.formState.scheduleFrequency}
          @sl-select=${(e: Event) =>
            this.updateFormState({
              scheduleFrequency: (e.target as HTMLSelectElement)
                .value as FormState["scheduleFrequency"],
            })}
        >
          <sl-menu-item value="daily">${msg("Daily")}</sl-menu-item>
          <sl-menu-item value="weekly">${msg("Weekly")}</sl-menu-item>
          <sl-menu-item value="monthly">${msg("Monthly")}</sl-menu-item>
        </sl-select>
      `)}
      ${this.renderHelpTextCol(
        html`Limit the frequency for how often the job will run.`
      )}
      ${when(
        this.formState.scheduleFrequency === "weekly",
        () => html`
          ${this.renderFormCol(html`
            <sl-radio-group
              name="scheduleDayOfWeek"
              label=${msg("Day")}
              value=${this.formState.scheduleDayOfWeek}
            >
              ${this.daysOfWeek.map(
                (label, day) =>
                  html`<sl-radio-button value=${day}>${label}</sl-radio-button>`
              )}
            </sl-radio-group>
          `)}
          ${this.renderHelpTextCol(
            html`What day of the week should the job run on?`
          )}
        `
      )}
      ${when(
        this.formState.scheduleFrequency === "monthly",
        () => html`
          ${this.renderFormCol(html`
            <sl-input
              name="scheduleDayOfMonth"
              label=${msg("Date")}
              type="number"
              min="1"
              max="31"
              value=${this.formState.scheduleDayOfMonth}
              required
            >
            </sl-input>
          `)}
          ${this.renderHelpTextCol(
            html`What day of the month should the job run on?`
          )}
        `
      )}
      ${this.renderFormCol(html`
        <btrix-time-input
          hour=${ifDefined(this.formState.scheduleTime.hour)}
          minute=${ifDefined(this.formState.scheduleTime.minute)}
          period=${ifDefined(this.formState.scheduleTime.period)}
          @time-change=${(e: TimeInputChangeEvent) => {
            this.updateFormState({
              scheduleTime: e.detail,
            });
          }}
        >
          <span slot="label">${msg("Start Time")}</span>
        </btrix-time-input>
        <div class="text-xs text-neutral-500 mt-3">
          <p class="mb-1">
            ${msg(
              html`Schedule:
                <span class="text-blue-500"
                  >${humanizeSchedule(utcSchedule)}</span
                >.`
            )}
          </p>
          <p>
            ${msg(
              html`Next scheduled run:
                <span>${humanizeNextDate(utcSchedule)}</span>.`
            )}
          </p>
        </div>
      `)}
      ${this.renderHelpTextCol(
        html`Job will run at this time in your current timezone.`
      )}
      ${this.renderFormCol(html`<sl-checkbox
        name="runNow"
        ?checked=${this.formState.runNow}
        @sl-change=${(e: Event) =>
          this.updateFormState({
            runNow: (e.target as SlCheckbox).checked,
          })}
      >
        ${msg("Also run job immediately on save")}
      </sl-checkbox>`)}
      ${this.renderHelpTextCol(
        html`If checked, the job will run at the time specified above and also
        once when setup is complete.`
      )}
    `;
  };

  private renderJobInformation() {
    const defaultValue =
      this.jobType === "urlList"
        ? this.formState.jobName
        : this.formState.primarySeedUrl;
    return html`
      ${this.renderFormCol(html`
        <sl-input
          name="jobName"
          label=${msg("Job Name")}
          autocomplete="off"
          placeholder=${msg("Example (example.com) Weekly Crawl", {
            desc: "Example job config name",
          })}
          value=${defaultValue}
          required
          @sl-change=${(e: Event) => {
            this.updateFormState({
              jobName: (e.target as SlInput).value,
            });
          }}
        ></sl-input>
      `)}
      ${this.renderHelpTextCol(
        html`Try to give this job a memorable name so it (and its outputs) can
        be found later!`
      )}
      ${this.renderServerError()}
    `;
  }

  private renderServerError() {
    if (!this.serverError) return;
    return html`
      <div class="col-span-1 md:col-span-5 mt-5">
        <btrix-alert variant="danger">${this.serverError}</btrix-alert>
      </div>
    `;
  }

  private handleRemoveRegex(e: ExclusionRemoveEvent) {
    const { index } = e.detail;
    if (!this.formState.exclusions) {
      this.updateFormState(
        {
          exclusions: this.formState.exclusions,
        },
        true
      );
    } else {
      const { exclusions: exclude } = this.formState;
      this.updateFormState(
        {
          exclusions: [...exclude.slice(0, index), ...exclude.slice(index + 1)],
        },
        true
      );
    }
  }

  private handleChangeRegex(e: ExclusionChangeEvent) {
    const { regex, index } = e.detail;

    const nextExclusions = [...this.formState.exclusions!];
    nextExclusions[index] = regex;
    this.updateFormState(
      {
        exclusions: nextExclusions,
      },
      true
    );
  }

  private validateOnBlur = async (e: Event) => {
    const el = e.target as SlInput | SlTextarea | SlSelect | SlCheckbox;
    const tagName = el.tagName.toLowerCase();
    if (
      !["sl-input", "sl-textarea", "sl-select", "sl-checkbox"].includes(tagName)
    ) {
      return;
    }
    await el.updateComplete;
    await this.updateComplete;

    const currentTab = this.progressState.activeTab as StepName;
    const tabs = { ...this.progressState.tabs };
    // Check [data-user-invalid] instead of .invalid property
    // to validate only touched inputs
    if ("userInvalid" in el.dataset) {
      tabs[currentTab].error = true;
      this.updateProgressState({ tabs });
    } else if (this.progressState.tabs[currentTab].error) {
      const hasInvalid = el
        .closest("btrix-tab-panel")
        ?.querySelector("[data-invalid]");
      if (!hasInvalid) {
        tabs[currentTab].error = false;
        this.updateProgressState({ tabs });
      }
    }
  };

  private tabClickHandler = (step: StepName) => (e: MouseEvent) => {
    const tab = e.currentTarget as Tab;
    if (tab.disabled || tab.active) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    this.updateProgressState({ activeTab: step });
  };

  private backStep() {
    const targetTabIdx = stepOrder.indexOf(this.progressState.activeTab!);
    if (targetTabIdx) {
      this.updateProgressState({
        activeTab: stepOrder[targetTabIdx - 1] as StepName,
      });
    }
  }

  private nextStep() {
    const isValid = this.checkCurrentPanelValidity();

    if (isValid) {
      const { activeTab, tabs, currentStep } = this.progressState;
      const nextTab = stepOrder[stepOrder.indexOf(activeTab!) + 1] as StepName;

      const isFirstTimeEnabled = !tabs[nextTab].enabled;
      const nextTabs = { ...tabs };
      let nextCurrentStep = currentStep;

      if (isFirstTimeEnabled) {
        nextTabs[nextTab].enabled = true;
        nextCurrentStep = nextTab;
      }

      nextTabs[activeTab!].completed = true;
      this.updateProgressState({
        activeTab: nextTab,
        currentStep: nextCurrentStep,
        tabs: nextTabs,
      });
    }
  }

  private checkCurrentPanelValidity = (): boolean => {
    if (!this.formElem) return false;

    const currentTab = this.progressState.activeTab as StepName;
    const activePanel = this.formElem.querySelector(
      `btrix-tab-panel[name="newJobConfig-${currentTab}"]`
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

  private preventSubmit(event: KeyboardEvent) {
    const el = event.target as HTMLElement;
    const tagName = el.tagName.toLowerCase();
    if (tagName === "sl-input") {
      if (
        event.key === "Enter" &&
        this.progressState.activeTab !== stepOrder[stepOrder.length - 1]
      ) {
        // Prevent submission by "Enter" keypress if not on last tab
        event.preventDefault();
      }
    }
  }

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const isValid = this.checkCurrentPanelValidity();
    await this.updateComplete;

    if (!isValid || this.formHasError) {
      return;
    }

    const form = event.target as HTMLFormElement;
    const config = this.parseConfig(form);

    console.log(config);

    this.isSubmitting = true;

    try {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify(config),
        }
      );

      const crawlId = data.run_now_job;

      this.notify({
        message: crawlId
          ? msg("Crawl started with new template.")
          : msg("Crawl template created."),
        variant: "success",
        icon: "check2-circle",
        duration: 8000,
      });

      if (crawlId) {
        this.navTo(`/archives/${this.archiveId}/crawls/crawl/${crawlId}`);
      } else {
        this.navTo(
          `/archives/${this.archiveId}/crawl-templates/config/${data.added}`
        );
      }
    } catch (e: any) {
      if (e?.isApiError) {
        const isConfigError = ({ loc }: any) =>
          loc.some((v: string) => v === "config");
        if (e.details && e.details.some(isConfigError)) {
          this.serverError = this.formatConfigServerError(e.details);
        } else {
          this.serverError = e.message;
        }
      } else {
        this.serverError = msg("Something unexpected went wrong");
      }
    }

    this.isSubmitting = false;
  }

  private async onReset() {
    this.progressState = getDefaultProgressState();
    this.formState = {
      ...getDefaultFormState(),
      lang: this.getInitialLang(),
      ...this.getInitialFormState(),
    };
  }

  /**
   * Format `config` related API error returned from server
   */
  private formatConfigServerError(details: any): TemplateResult {
    const detailsWithoutDictError = details.filter(
      ({ type }: any) => type !== "type_error.dict"
    );

    const renderDetail = ({ loc, msg: detailMsg }: any) => html`
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
        "Couldn't save crawl template. Please fix the following crawl configuration issues:"
      )}
      <ul class="list-disc w-fit pl-4">
        ${detailsWithoutDictError.map(renderDetail)}
      </ul>
    `;
  }

  private parseConfig(form: HTMLFormElement): NewJobConfigParams {
    const formValues = serialize(form) as FormState;

    // TODO save job type
    const config: NewJobConfigParams = {
      name: formValues.jobName,
      scale: +formValues.scale,
      profileid: this.formState.profileid || null,
      runNow: this.formState.runNow,
      schedule:
        this.formState.scheduleType === "cron"
          ? getUTCSchedule({
              interval: this.formState.scheduleFrequency,
              ...this.formState.scheduleTime,
            })
          : "",
      crawlTimeout: formValues.jobTimeoutMinutes
        ? +formValues.jobTimeoutMinutes * 60
        : 0,
      config: {
        ...(this.jobType === "urlList"
          ? this.parseUrlListConfig(formValues)
          : this.parseSeededConfig(formValues)),
        behaviorTimeout: formValues.pageTimeoutMinutes
          ? +formValues.pageTimeoutMinutes * 60
          : 0,
        limit: formValues.pageLimit ? +formValues.pageLimit : null,
        extraHops: this.formState.includeLinkedPages ? 1 : 0,
        lang: this.formState.lang || null,
        blockAds: this.formState.blockAds,
        exclude: trimExclusions(this.formState.exclusions),
      },
    };

    return config;
  }

  private parseUrlListConfig(
    formValues: FormState
  ): NewJobConfigParams["config"] {
    const config = {
      seeds: formValues.urlList.trim().replace(/,/g, " ").split(/\s+/g),
      scopeType: "page" as FormState["scopeType"],
    };

    return config;
  }

  private parseSeededConfig(
    formValues: FormState
  ): NewJobConfigParams["config"] {
    const primarySeedUrl = formValues.primarySeedUrl.replace(/\/$/, "");
    const externalUrlList = formValues.allowedExternalUrlList
      ? formValues.allowedExternalUrlList
          .trim()
          .replace(/,/g, " ")
          .split(/\s+/g)
          .map((str) => str.replace(/\/$/, ""))
      : [];
    let scopeType = formValues.scopeType;
    const include = [];
    if (externalUrlList.length) {
      const { host, origin } = new URL(primarySeedUrl);
      scopeType = "custom";

      // Replicate scope type with regex
      switch (formValues.scopeType) {
        case "prefix":
          include.push(`${regexEscape(primarySeedUrl)}\/.*`);
          break;
        case "host":
          include.push(`${regexEscape(origin)}\/.*`);
          break;
        case "domain":
          include.push(
            `${regexEscape(origin)}\/.*`,
            `.*\.${regexEscape(host)}\/.*`
          );
          break;
        default:
          break;
      }

      externalUrlList.forEach((url) => {
        include.push(`${regexEscape(url)}\/.*`);
      });
    }
    const config = {
      seeds: [primarySeedUrl],
      scopeType,
      include,
    };
    return config;
  }

  private updateProgressState(
    nextState: Partial<ProgressState>,
    shallowMerge = false
  ) {
    if (shallowMerge) {
      this.progressState = {
        ...this.progressState,
        ...nextState,
      };
    } else {
      this.progressState = merge(
        <ProgressState>{ ...this.progressState },
        <Partial<ProgressState>>{ ...nextState }
      );
    }
  }

  private updateFormState(nextState: Partial<FormState>, shallowMerge = false) {
    if (shallowMerge) {
      this.formState = {
        ...this.formState,
        ...nextState,
      };
    } else {
      this.formState = merge(
        <FormState>this.formState,
        <Partial<FormState>>nextState
      );
    }
  }
}

customElements.define("btrix-new-job-config", NewJobConfig);
