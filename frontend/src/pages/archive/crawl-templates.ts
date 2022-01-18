import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import cronParser from "cron-parser";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import { getLocaleTimeZone } from "../../utils/localization";

type CrawlTemplate = any; // TODO

const initialValues = {
  name: "",
  runNow: true,
  schedule: "@weekly",
  config: {
    seeds: [],
    scopeType: "prefix",
  },
};
const initialJsonTemplate = JSON.stringify(initialValues, null, 2);
const hours = Array.from({ length: 12 }).map((x, i) => ({
  value: i + 1,
  label: `${i + 1}`,
}));
const minutes = Array.from({ length: 60 }).map((x, i) => ({
  value: i,
  label: `${i}`.padStart(2, "0"),
}));

@localized()
export class CrawlTemplates extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @property({ type: Boolean })
  isNew!: boolean;

  @property({ type: Array })
  crawlTemplates?: CrawlTemplate[];

  @state()
  private isAdvancedSettingsView: boolean = false;

  @state()
  private isRunNow: boolean = initialValues.runNow;

  @state()
  private scheduleInterval: "" | "daily" | "weekly" | "monthly" = "weekly";

  /** Schedule local time */
  @state()
  private scheduleTime: { hour: number; minute: number; period: "AM" | "PM" } =
    {
      hour: 12,
      minute: 0,
      period: "AM",
    };

  @state()
  private jsonTemplate: string = initialJsonTemplate;

  @state()
  private invalidJsonTemplateMessage: string = "";

  @state()
  private isSubmitting: boolean = false;

  @state()
  private serverError?: string;

  private get timeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  private get timeZoneShortName() {
    return getLocaleTimeZone();
  }

  private get nextScheduledCrawlMessage() {
    const utcSchedule = this.getUTCSchedule();

    return this.scheduleInterval
      ? msg(html`Next scheduled crawl:
          <sl-format-date
            date="${cronParser
              .parseExpression(utcSchedule, {
                utc: true,
              })
              .next()
              .toString()}"
            weekday="long"
            month="long"
            day="numeric"
            year="numeric"
            hour="numeric"
            minute="numeric"
            time-zone-name="short"
            time-zone=${this.timeZone}
          ></sl-format-date>`)
      : undefined;
  }

  render() {
    if (this.isNew) {
      return this.renderNew();
    }

    return this.renderList();
  }

  private renderNew() {
    return html`
      <h2 class="text-xl font-bold">${msg("New Crawl Template")}</h2>
      <p>
        ${msg(
          "Configure a new crawl template. You can choose to run a crawl immediately upon saving this template."
        )}
      </p>

      <main class="mt-4">
        <div class="mb-2 text-right">
          <sl-switch
            ?checked=${this.isAdvancedSettingsView}
            @sl-change=${(e: any) =>
              (this.isAdvancedSettingsView = e.target.checked)}
          >
            <span class="text-sm">${msg("Advanced custom settings")}</span>
          </sl-switch>
        </div>

        <div class="border rounded-lg">
          <sl-form @sl-submit=${this.onSubmit} aria-describedby="formError">
            ${this.isAdvancedSettingsView
              ? this.renderAdvancedSettings()
              : this.renderBasicSettings()}

            <div class="p-4 md:p-8 text-center grid gap-5">
              ${this.serverError
                ? html`<btrix-alert id="formError" type="danger"
                    >${this.serverError}</btrix-alert
                  >`
                : ""}

              <div>
                <sl-button type="primary" submit
                  >${msg("Save Crawl Template")}</sl-button
                >
              </div>

              ${!this.isAdvancedSettingsView &&
              (this.isRunNow || this.scheduleInterval)
                ? html`<div class="text-sm text-gray-500">
                    ${this.isRunNow
                      ? html`
                          <p class="mb-2">
                            ${msg("A crawl will start immediately on save.")}
                          </p>
                        `
                      : ""}
                    ${this.nextScheduledCrawlMessage}
                  </div>`
                : ""}
            </div>
          </sl-form>
        </div>
      </main>
    `;
  }

  private renderList() {
    return html`
      <div class="text-center">
        <sl-button
          @click=${() =>
            this.navTo(`/archives/${this.archiveId}/crawl-templates/new`)}
        >
          <sl-icon slot="prefix" name="plus-square-dotted"></sl-icon>
          ${msg("Create new crawl template")}
        </sl-button>
      </div>

      <div>
        ${this.crawlTemplates?.map(
          (template) => html`<div>${template.id}</div>`
        )}
      </div>
    `;
  }

  private renderBasicSettings() {
    return html`
      <div class="md:grid grid-cols-4">
        <div class="col-span-1 p-4 md:p-8 md:border-b">
          <h3 class="text-lg font-medium">${msg("Basic settings")}</h3>
        </div>
        <section class="col-span-3 p-4 md:p-8 border-b grid gap-5">
          <div>
            <sl-input
              name="name"
              label=${msg("Name")}
              placeholder=${msg("Example (example.com) Weekly Crawl", {
                desc: "Example crawl template name",
              })}
              autocomplete="off"
              value=${initialValues.name}
              required
            ></sl-input>
          </div>
          <div>
            <div class="flex items-end">
              <div class="pr-2 flex-1">
                <sl-select
                  name="schedule"
                  label=${msg("Schedule")}
                  value=${this.scheduleInterval}
                  @sl-select=${(e: any) =>
                    (this.scheduleInterval = e.target.value)}
                >
                  <sl-menu-item value="">${msg("None")}</sl-menu-item>
                  <sl-menu-item value="daily">${msg("Daily")}</sl-menu-item>
                  <sl-menu-item value="weekly">${msg("Weekly")}</sl-menu-item>
                  <sl-menu-item value="monthly">${msg("Monthly")}</sl-menu-item>
                </sl-select>
              </div>
              <div class="grid grid-flow-col gap-2 items-center">
                <span class="px-1">${msg("at")}</span>
                <sl-select
                  name="scheduleHour"
                  value=${this.scheduleTime.hour}
                  class="w-24"
                  ?disabled=${!this.scheduleInterval}
                  @sl-select=${(e: any) =>
                    (this.scheduleTime = {
                      ...this.scheduleTime,
                      hour: +e.target.value,
                    })}
                >
                  ${hours.map(
                    ({ value, label }) =>
                      html`<sl-menu-item value=${value}>${label}</sl-menu-item>`
                  )}
                </sl-select>
                <span>:</span>
                <sl-select
                  name="scheduleMinute"
                  value=${this.scheduleTime.minute}
                  class="w-24"
                  ?disabled=${!this.scheduleInterval}
                  @sl-select=${(e: any) =>
                    (this.scheduleTime = {
                      ...this.scheduleTime,
                      minute: +e.target.value,
                    })}
                >
                  ${minutes.map(
                    ({ value, label }) =>
                      html`<sl-menu-item value=${value}>${label}</sl-menu-item>`
                  )}
                </sl-select>
                <sl-select
                  value="AM"
                  class="w-24"
                  ?disabled=${!this.scheduleInterval}
                  @sl-select=${(e: any) =>
                    (this.scheduleTime = {
                      ...this.scheduleTime,
                      period: e.target.value,
                    })}
                >
                  <sl-menu-item value="AM"
                    >${msg("AM", { desc: "Time AM/PM" })}</sl-menu-item
                  >
                  <sl-menu-item value="PM"
                    >${msg("PM", { desc: "Time AM/PM" })}</sl-menu-item
                  >
                </sl-select>
                <span class="px-1">${this.timeZoneShortName}</span>
              </div>
            </div>
            <div class="text-sm text-gray-500 mt-1">
              ${this.nextScheduledCrawlMessage || msg("No crawls scheduled")}
            </div>
          </div>

          <div>
            <sl-switch
              name="runNow"
              ?checked=${initialValues.runNow}
              @sl-change=${(e: any) => (this.isRunNow = e.target.checked)}
              >${msg("Run immediately on save")}</sl-switch
            >
          </div>

          <div>
            <sl-input
              name="crawlTimeoutMinutes"
              label=${msg("Time limit")}
              placeholder=${msg("unlimited")}
              type="number"
            >
              <span slot="suffix">${msg("minutes")}</span>
            </sl-input>
          </div>
        </section>

        <div class="col-span-1 p-4 md:p-8 md:border-b">
          <h3 class="text-lg font-medium">${msg("Pages")}</h3>
        </div>
        <section class="col-span-3 p-4 md:p-8 border-b grid gap-5">
          <div>
            <sl-textarea
              name="seedUrls"
              label=${msg("Seed URLs")}
              helpText=${msg("Separated by a new line, space or comma")}
              placeholder=${msg(
                `https://webrecorder.net\nhttps://example.com`,
                {
                  desc: "Example seed URLs",
                }
              )}
              help-text=${msg("Separate URLs with a new line, space or comma.")}
              rows="3"
              required
            ></sl-textarea>
          </div>
          <div>
            <sl-select
              name="scopeType"
              label=${msg("Scope type")}
              value=${initialValues.config.scopeType}
            >
              <sl-menu-item value="page">Page</sl-menu-item>
              <sl-menu-item value="page-spa">Page SPA</sl-menu-item>
              <sl-menu-item value="prefix">Prefix</sl-menu-item>
              <sl-menu-item value="host">Host</sl-menu-item>
              <sl-menu-item value="any">Any</sl-menu-item>
            </sl-select>
          </div>
          <div>
            <sl-input
              name="limit"
              label=${msg("Page limit")}
              type="number"
              placeholder=${msg("unlimited")}
            >
              <span slot="suffix">${msg("pages")}</span>
            </sl-input>
          </div>
        </section>
      </div>
    `;
  }

  private renderAdvancedSettings() {
    return html`
      <div class="p-4 md:p-8 md:border-b">
        <label class="text-lg font-medium" for="json-editor">
          ${msg("JSON Configuration")}
        </label>

        <div class="mt-4 grid gap-4">
          <div>
            <p class="mb-2">
              ${msg("Edit or paste in an existing JSON crawl template.")}
            </p>
          </div>

          <div class="grid grid-cols-3 gap-4">
            <div class="relative col-span-2">
              ${this.renderJSON()}

              <div class="absolute top-2 right-2">
                <btrix-copy-button
                  .value=${this.jsonTemplate}
                ></btrix-copy-button>
              </div>
            </div>

            <div class="col-span-1">
              ${this.invalidJsonTemplateMessage
                ? html`<btrix-alert type="danger">
                    ${this.invalidJsonTemplateMessage}
                  </btrix-alert> `
                : html` <btrix-alert> ${msg("Valid JSON")} </btrix-alert>`}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderJSON() {
    return html`
      <textarea
        id="json-editor"
        class="language-json block w-full bg-gray-800 text-gray-50 p-4 rounded font-mono text-sm"
        autocomplete="off"
        rows="10"
        spellcheck="false"
        .value=${this.jsonTemplate}
        @keydown=${(e: any) => {
          // Add indentation when pressing tab key instead of moving focus
          if (e.keyCode === /* tab: */ 9) {
            e.preventDefault();

            const textarea = e.target;

            textarea.setRangeText(
              "  ",
              textarea.selectionStart,
              textarea.selectionStart,
              "end"
            );
          }
        }}
        @change=${(e: any) => (this.jsonTemplate = e.target.value)}
        @blur=${this.updateJsonTemplate}
      ></textarea>
    `;
  }

  private updateJsonTemplate(e: any) {
    const textarea = e.target;
    const text = textarea.value;

    try {
      const json = JSON.parse(text);

      this.jsonTemplate = JSON.stringify(json, null, 2);
      this.invalidJsonTemplateMessage = "";

      textarea.setCustomValidity("");
      textarea.reportValidity();
    } catch (e: any) {
      this.invalidJsonTemplateMessage = e.message
        ? msg(str`JSON is invalid: ${e.message.replace("JSON.parse: ", "")}`)
        : msg("JSON is invalid.");
    }
  }

  private parseTemplate(formData: FormData) {
    const crawlTimeoutMinutes = formData.get("crawlTimeoutMinutes");
    const pageLimit = formData.get("limit");
    const seedUrlsStr = formData.get("seedUrls");
    const template = {
      name: formData.get("name"),
      schedule: this.getUTCSchedule(),
      runNow: this.isRunNow,
      crawlTimeout: crawlTimeoutMinutes ? +crawlTimeoutMinutes * 60 : 0,
      config: {
        seeds: (seedUrlsStr as string).trim().replace(/,/g, " ").split(/\s+/g),
        scopeType: formData.get("scopeType"),
        limit: pageLimit ? +pageLimit : 0,
      },
    };

    return template;
  }

  private async onSubmit(event: {
    detail: { formData: FormData };
    target: any;
  }) {
    if (!this.authState) return;

    let params;

    if (this.isAdvancedSettingsView) {
      // Check JSON validity
      const jsonEditor = event.target.querySelector("#json-editor");

      if (this.invalidJsonTemplateMessage) {
        jsonEditor.setCustomValidity(msg("Please correct JSON errors."));
        jsonEditor.reportValidity();
        return;
      }

      params = JSON.parse(this.jsonTemplate);
    } else {
      params = this.parseTemplate(event.detail.formData);
    }

    console.log(params);

    this.serverError = undefined;
    this.isSubmitting = true;

    try {
      await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/`,
        this.authState,
        {
          method: "POST",
          body: JSON.stringify(params),
        }
      );

      this.navTo(`/archives/${this.archiveId}/crawl-templates`);
    } catch (e: any) {
      if (e?.isApiError) {
        this.serverError = e?.message;
      } else {
        this.serverError = msg("Something unexpected went wrong");
      }
    }

    this.isSubmitting = false;
  }

  /**
   * Get schedule as UTC cron job expression
   * https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/#cron-schedule-syntax
   **/
  private getUTCSchedule(): string {
    if (!this.scheduleInterval) {
      return "";
    }

    const { minute, hour, period } = this.scheduleTime;
    const localDate = new Date();

    // Convert 12-hr to 24-hr time
    let periodOffset = 0;

    if (hour === 12) {
      if (period === "AM") {
        periodOffset = -12;
      }
    } else if (hour === 1) {
      if (period === "PM") {
        periodOffset = 12;
      }
    }

    localDate.setHours(+hour + periodOffset);
    localDate.setMinutes(+minute);
    const dayOfMonth =
      this.scheduleInterval === "monthly" ? localDate.getUTCDate() : "*";
    const dayOfWeek =
      this.scheduleInterval === "weekly" ? localDate.getUTCDay() : "*";
    const month = "*";

    const schedule = `${localDate.getUTCMinutes()} ${localDate.getUTCHours()} ${dayOfMonth} ${month} ${dayOfWeek}`;

    return schedule;
  }
}
