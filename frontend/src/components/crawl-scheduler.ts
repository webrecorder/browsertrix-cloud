import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { parseCron } from "@cheap-glitch/mi-cron";

import LiteElement, { html } from "../utils/LiteElement";
import { getLocaleTimeZone } from "../utils/localization";
import {
  ScheduleInterval,
  getScheduleInterval,
  humanizeNextDate,
} from "../utils/cron";
import type { CrawlTemplate } from "../pages/archive/types";

const hours = Array.from({ length: 12 }).map((x, i) => ({
  value: i + 1,
  label: `${i + 1}`,
}));
const minutes = Array.from({ length: 60 }).map((x, i) => ({
  value: i,
  label: `${i}`.padStart(2, "0"),
}));

/**
 * Usage:
 * ```ts
 * <btrix-crawl-scheduler
 *   schedule="0 0 * * *"
 *   cancelable=${true}
 *   @submit=${this.handleSubmit}
 *   @cancel=${this.handleCancel}
 * ></btrix-crawl-scheduler>
 * ```
 *
 * @event submit
 * @event cancel
 */
@localized()
export class CrawlTemplatesScheduler extends LiteElement {
  @property({ type: String })
  schedule?: CrawlTemplate["schedule"];

  @property({ type: Boolean })
  isSubmitting: boolean = false;

  @property({ type: Boolean })
  cancelable?: boolean = false;

  @state()
  private scheduleInterval: ScheduleInterval | "" = "";

  @state()
  private scheduleTime: { hour: number; minute: number; period: "AM" | "PM" } =
    {
      hour: new Date().getHours() % 12 || 12,
      minute: 0,
      period: new Date().getHours() > 11 ? "PM" : "AM",
    };

  private get isScheduleDisabled() {
    return !this.scheduleInterval;
  }

  firstUpdated() {
    this.setInitialValues();
  }

  private setInitialValues() {
    if (this.schedule) {
      const nextDate = parseCron.nextDate(this.schedule)!;
      const hour = nextDate.getHours() % 12;
      const minute = nextDate.getMinutes();

      this.scheduleTime = {
        hour,
        minute,
        period: hour > 11 ? "PM" : "AM",
      };
      this.scheduleInterval = getScheduleInterval(this.schedule);
    }
  }

  render() {
    // TODO consolidate with new

    const nextSchedule = "";

    return html`
      <sl-form @sl-submit=${this.onSubmit}>
        <div class="flex items-end">
          <div class="pr-2 flex-1">
            <sl-select
              name="scheduleInterval"
              label=${msg("Recurring crawls")}
              value=${this.scheduleInterval}
              hoist
              @sl-hide=${this.stopProp}
              @sl-after-hide=${this.stopProp}
              @sl-select=${(e: any) => {
                this.scheduleInterval = e.target.value;
              }}
            >
              <sl-menu-item value="">${msg("None")}</sl-menu-item>
              <sl-menu-item value="daily">${msg("Daily")}</sl-menu-item>
              <sl-menu-item value="weekly">${msg("Weekly")}</sl-menu-item>
              <sl-menu-item value="monthly">${msg("Monthly")}</sl-menu-item>
            </sl-select>
          </div>
        </div>
        <fieldset class="mt-2">
          <label class="text-sm">${msg("Time")} </label>
          <div class="md:flex">
            <div class="flex items-center mb-2 md:mb-0 md:mr-2">
              <sl-select
                class="grow"
                name="scheduleHour"
                value=${this.scheduleTime.hour}
                ?disabled=${this.isScheduleDisabled}
                hoist
                @sl-hide=${this.stopProp}
                @sl-after-hide=${this.stopProp}
                @sl-select=${(e: any) => {
                  this.scheduleTime = {
                    ...this.scheduleTime,
                    hour: +e.target.value,
                  };
                }}
              >
                ${hours.map(
                  ({ value, label }) =>
                    html`<sl-menu-item value=${value}>${label}</sl-menu-item>`
                )}
              </sl-select>
              <span class="grow-0 px-1">:</span>
              <sl-select
                class="grow"
                name="scheduleMinute"
                value=${this.scheduleTime.minute}
                ?disabled=${this.isScheduleDisabled}
                hoist
                @sl-hide=${this.stopProp}
                @sl-after-hide=${this.stopProp}
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
            </div>
            <input
              name="schedulePeriod"
              type="hidden"
              value=${this.scheduleTime.period}
            />
            <sl-button-group>
              <sl-button
                type=${this.scheduleTime.period === "AM"
                  ? "neutral"
                  : "default"}
                aria-selected=${this.scheduleTime.period === "AM"}
                ?disabled=${this.isScheduleDisabled}
                @click=${() =>
                  (this.scheduleTime = {
                    ...this.scheduleTime,
                    period: "AM",
                  })}
                >${msg("AM", { desc: "Time AM/PM" })}</sl-button
              >
              <sl-button
                type=${this.scheduleTime.period === "PM"
                  ? "neutral"
                  : "default"}
                aria-selected=${this.scheduleTime.period === "PM"}
                ?disabled=${this.isScheduleDisabled}
                @click=${() =>
                  (this.scheduleTime = {
                    ...this.scheduleTime,
                    period: "PM",
                  })}
                >${msg("PM", { desc: "Time AM/PM" })}</sl-button
              >
            </sl-button-group>
          </div>
        </fieldset>

        <div class="mt-5">
          ${this.isScheduleDisabled
            ? msg(html`<span class="font-medium"
                >Crawls will not repeat.</span
              >`)
            : msg(
                html`<span class="font-medium">New schedule will be:</span
                  ><br />
                  <span class="text-0-600"
                    >${humanizeNextDate(nextSchedule)}
                  </span>`
              )}
        </div>

        <div class="mt-5${this.cancelable ? " text-right" : ""}">
          ${this.cancelable
            ? html`
                <sl-button type="text" @click=${this.onCancel}
                  >${msg("Cancel")}</sl-button
                >
              `
            : ""}

          <sl-button
            type="primary"
            submit
            ?disabled=${this.isSubmitting}
            ?loading=${this.isSubmitting}
            >${msg("Save Changes")}</sl-button
          >
        </div>
      </sl-form>
    `;
  }

  private onCancel(event: any) {
    this.dispatchEvent(new CustomEvent("cancel", event));
  }

  private onSubmit(event: any) {
    this.dispatchEvent(new CustomEvent("submit", event));
  }

  /**
   * Stop propgation of sl-select events.
   * Prevents bug where sl-dialog closes when dropdown closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: CustomEvent) {
    e.stopPropagation();
  }
}

customElements.define("btrix-crawl-scheduler", CrawlTemplatesScheduler);
