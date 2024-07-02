import { localized, msg } from "@lit/localize";
import type { SlSelectEvent } from "@shoelace-style/shoelace";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import type { SelectNewDialogEvent } from ".";

import type { AuthState } from "@/utils/AuthService";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";
import LiteElement, { html } from "@/utils/LiteElement";
import { getLocale } from "@/utils/localization";
import type { OrgData, YearMonth } from "@/utils/orgs";

type Metrics = {
  storageUsedBytes: number;
  storageUsedCrawls: number;
  storageUsedUploads: number;
  storageUsedProfiles: number;
  storageQuotaBytes: number;
  archivedItemCount: number;
  crawlCount: number;
  uploadCount: number;
  pageCount: number;
  profileCount: number;
  workflowsRunningCount: number;
  maxConcurrentCrawls: number;
  workflowsQueuedCount: number;
  collectionsCount: number;
  publicCollectionsCount: number;
};

@localized()
@customElement("btrix-dashboard")
export class Dashboard extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: Boolean })
  isCrawler?: boolean;

  @property({ type: Boolean })
  isAdmin?: boolean;

  @property({ type: String })
  orgId!: string;

  @property({ type: Object })
  org: OrgData | null = null;

  @state()
  private metrics?: Metrics;

  private readonly colors = {
    default: "neutral",
    crawls: "green",
    uploads: "sky",
    browserProfiles: "indigo",
    runningTime: "blue",
  };

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("orgId")) {
      void this.fetchMetrics();
    }
  }

  render() {
    const hasQuota = Boolean(this.metrics?.storageQuotaBytes);
    const quotaReached =
      this.metrics &&
      this.metrics.storageQuotaBytes > 0 &&
      this.metrics.storageUsedBytes >= this.metrics.storageQuotaBytes;

    return html`<header
        class="mb-7 flex items-center justify-end gap-2 border-b pb-3"
      >
        <h1 class="mr-auto min-w-0 text-xl font-semibold leading-8">
          ${this.org?.name}
        </h1>
        ${when(
          this.isAdmin,
          () =>
            html` <sl-icon-button
              href=${`${this.orgBasePath}/settings`}
              class="text-lg"
              name="gear"
              label=${msg("Edit org settings")}
              @click=${this.navLink}
            ></sl-icon-button>`,
        )}
        ${when(
          this.isCrawler,
          () =>
            html` <sl-dropdown
              distance="4"
              placement="bottom-end"
              @sl-select=${(e: SlSelectEvent) => {
                this.dispatchEvent(
                  new CustomEvent("select-new-dialog", {
                    detail: e.detail.item.value,
                  }) as SelectNewDialogEvent,
                );
              }}
            >
              <sl-button slot="trigger" size="small" variant="primary" caret>
                <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                ${msg("Create New...")}
              </sl-button>
              <sl-menu>
                <sl-menu-item value="workflow"
                  >${msg("Crawl Workflow")}</sl-menu-item
                >
                <sl-menu-item
                  value="upload"
                  ?disabled=${!this.metrics || quotaReached}
                  >${msg("Upload")}</sl-menu-item
                >
                <sl-menu-item value="collection">
                  ${msg("Collection")}
                </sl-menu-item>
                <sl-menu-item
                  value="browser-profile"
                  ?disabled=${!this.metrics || quotaReached}
                >
                  ${msg("Browser Profile")}
                </sl-menu-item>
              </sl-menu>
            </sl-dropdown>`,
        )}
      </header>
      <main>
        <div class="flex flex-col gap-6 md:flex-row">
          ${this.renderCard(
            msg("Storage"),
            (metrics) => html`
              ${this.renderStorageMeter(metrics)}
              <dl>
                ${this.renderStat({
                  value: metrics.crawlCount,
                  secondaryValue: hasQuota
                    ? ""
                    : html`<sl-format-bytes
                        value=${metrics.storageUsedCrawls}
                      ></sl-format-bytes>`,
                  singleLabel: msg("Crawl"),
                  pluralLabel: msg("Crawls"),
                  iconProps: {
                    name: "gear-wide-connected",
                    color: this.colors.crawls,
                  },
                })}
                ${this.renderStat({
                  value: metrics.uploadCount,
                  secondaryValue: hasQuota
                    ? ""
                    : html`<sl-format-bytes
                        value=${metrics.storageUsedUploads}
                      ></sl-format-bytes>`,
                  singleLabel: msg("Upload"),
                  pluralLabel: msg("Uploads"),
                  iconProps: { name: "upload", color: this.colors.uploads },
                })}
                ${this.renderStat({
                  value: metrics.profileCount,
                  secondaryValue: hasQuota
                    ? ""
                    : html`<sl-format-bytes
                        value=${metrics.storageUsedProfiles}
                      ></sl-format-bytes>`,
                  singleLabel: msg("Browser Profile"),
                  pluralLabel: msg("Browser Profiles"),
                  iconProps: {
                    name: "window-fullscreen",
                    color: this.colors.browserProfiles,
                  },
                })}
                <sl-divider
                  style="--spacing:var(--sl-spacing-small)"
                ></sl-divider>
                ${this.renderStat({
                  value: metrics.archivedItemCount,
                  secondaryValue: hasQuota
                    ? ""
                    : html`<sl-format-bytes
                        value=${metrics.storageUsedBytes}
                      ></sl-format-bytes>`,
                  singleLabel: msg("Archived Item"),
                  pluralLabel: msg("Archived Items"),
                  iconProps: { name: "file-zip-fill" },
                })}
              </dl>
            `,
          )}
          ${this.renderCard(
            msg("Crawling"),
            (metrics) => html`
              ${this.renderCrawlingMeter(metrics)}
              <dl>
                ${this.renderStat({
                  value:
                    metrics.workflowsRunningCount && metrics.maxConcurrentCrawls
                      ? `${metrics.workflowsRunningCount} / ${metrics.maxConcurrentCrawls}`
                      : metrics.workflowsRunningCount,
                  singleLabel: msg("Crawl Running"),
                  pluralLabel: msg("Crawls Running"),
                  iconProps: {
                    name: "dot",
                    library: "app",
                    color: metrics.workflowsRunningCount ? "green" : "neutral",
                  },
                })}
                ${this.renderStat({
                  value: metrics.workflowsQueuedCount,
                  singleLabel: msg("Crawl Workflow Waiting"),
                  pluralLabel: msg("Crawl Workflows Waiting"),
                  iconProps: { name: "hourglass-split", color: "purple" },
                })}
                ${this.renderStat({
                  value: metrics.pageCount,
                  singleLabel: msg("Page Crawled"),
                  pluralLabel: msg("Pages Crawled"),
                  iconProps: { name: "file-richtext-fill" },
                })}
              </dl>
            `,
          )}
          ${this.renderCard(
            msg("Collections"),
            (metrics) => html`
              <dl>
                ${this.renderStat({
                  value: metrics.collectionsCount,
                  singleLabel: msg("Collection Total"),
                  pluralLabel: msg("Collections Total"),
                  iconProps: { name: "collection-fill" },
                })}
                ${this.renderStat({
                  value: metrics.publicCollectionsCount,
                  singleLabel: msg("Shareable Collection"),
                  pluralLabel: msg("Shareable Collections"),
                  iconProps: { name: "people-fill", color: "emerald" },
                })}
              </dl>
            `,
          )}
        </div>
        <section class="mt-10">${this.renderUsageHistory()}</section>
      </main> `;
  }

  private renderStorageMeter(metrics: Metrics) {
    const hasQuota = Boolean(metrics.storageQuotaBytes);
    const isStorageFull =
      hasQuota && metrics.storageUsedBytes >= metrics.storageQuotaBytes;
    const renderBar = (value: number, label: string, color: string) => html`
      <btrix-meter-bar
        value=${(value / metrics.storageUsedBytes) * 100}
        style="--background-color:var(--sl-color-${color}-400)"
      >
        <div class="text-center">
          <div>${label}</div>
          <div class="text-xs opacity-80">
            <sl-format-bytes value=${value} display="narrow"></sl-format-bytes>
            | ${this.renderPercentage(value / metrics.storageUsedBytes)}
          </div>
        </div>
      </btrix-meter-bar>
    `;
    return html`
      <div class="mb-1 font-semibold">
        ${when(
          isStorageFull,
          () => html`
            <div class="flex items-center gap-2">
              <sl-icon
                class="text-danger"
                name="exclamation-triangle"
              ></sl-icon>
              <span>${msg("Storage is Full")}</span>
            </div>
          `,
          () =>
            hasQuota
              ? html`
                  <sl-format-bytes
                    value=${metrics.storageQuotaBytes -
                    metrics.storageUsedBytes}
                  ></sl-format-bytes>
                  ${msg("Available")}
                `
              : "",
        )}
      </div>
      ${when(
        hasQuota,
        () => html`
          <div class="mb-2">
            <btrix-meter
              value=${metrics.storageUsedBytes}
              max=${ifDefined(metrics.storageQuotaBytes || undefined)}
              valueText=${msg("gigabyte")}
            >
              ${when(metrics.storageUsedCrawls, () =>
                renderBar(
                  metrics.storageUsedCrawls,
                  msg("Crawls"),
                  this.colors.crawls,
                ),
              )}
              ${when(metrics.storageUsedUploads, () =>
                renderBar(
                  metrics.storageUsedUploads,
                  msg("Uploads"),
                  this.colors.uploads,
                ),
              )}
              ${when(metrics.storageUsedProfiles, () =>
                renderBar(
                  metrics.storageUsedProfiles,
                  msg("Profiles"),
                  this.colors.browserProfiles,
                ),
              )}
              <div slot="available" class="flex-1">
                <sl-tooltip class="text-center">
                  <div slot="content">
                    <div>${msg("Available")}</div>
                    <div class="text-xs opacity-80">
                      ${this.renderPercentage(
                        (metrics.storageQuotaBytes - metrics.storageUsedBytes) /
                          metrics.storageQuotaBytes,
                      )}
                    </div>
                  </div>
                  <div class="h-full w-full"></div>
                </sl-tooltip>
              </div>
              <sl-format-bytes
                slot="valueLabel"
                value=${metrics.storageUsedBytes}
                display="narrow"
              ></sl-format-bytes>
              <sl-format-bytes
                slot="maxLabel"
                value=${metrics.storageQuotaBytes}
                display="narrow"
              ></sl-format-bytes>
            </btrix-meter>
          </div>
        `,
      )}
    `;
  }

  private renderCrawlingMeter(_metrics: Metrics) {
    let quotaSeconds = 0;

    if (this.org!.quotas.maxExecMinutesPerMonth) {
      quotaSeconds = this.org!.quotas.maxExecMinutesPerMonth * 60;
    }

    let quotaSecondsAllTypes = quotaSeconds;

    let quotaSecondsExtra = 0;
    if (this.org!.extraExecSecondsAvailable) {
      quotaSecondsExtra = this.org!.extraExecSecondsAvailable;
      quotaSecondsAllTypes += this.org!.extraExecSecondsAvailable;
    }

    let quotaSecondsGifted = 0;
    if (this.org!.giftedExecSecondsAvailable) {
      quotaSecondsGifted = this.org!.giftedExecSecondsAvailable;
      quotaSecondsAllTypes += this.org!.giftedExecSecondsAvailable;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getUTCMonth() + 1).padStart(2, "0");
    const currentPeriod = `${currentYear}-${currentMonth}` as YearMonth;

    let usageSeconds = 0;
    if (this.org!.monthlyExecSeconds) {
      const actualUsage = this.org!.monthlyExecSeconds[currentPeriod];
      if (actualUsage) {
        usageSeconds = actualUsage;
      }
    }

    if (usageSeconds > quotaSeconds) {
      usageSeconds = quotaSeconds;
    }

    let usageSecondsAllTypes = 0;
    if (this.org!.crawlExecSeconds) {
      const actualUsage = this.org!.crawlExecSeconds[currentPeriod];
      if (actualUsage) {
        usageSecondsAllTypes = actualUsage;
      }
    }

    let usageSecondsExtra = 0;
    if (this.org!.extraExecSeconds) {
      const actualUsageExtra = this.org!.extraExecSeconds[currentPeriod];
      if (actualUsageExtra) {
        usageSecondsExtra = actualUsageExtra;
      }
    }
    const maxExecSecsExtra = this.org!.quotas.extraExecMinutes * 60;
    // Cap usage at quota for display purposes
    if (usageSecondsExtra > maxExecSecsExtra) {
      usageSecondsExtra = maxExecSecsExtra;
    }
    if (usageSecondsExtra) {
      // Quota for extra = this month's usage + remaining available
      quotaSecondsAllTypes += usageSecondsExtra;
      quotaSecondsExtra += usageSecondsExtra;
    }

    let usageSecondsGifted = 0;
    if (this.org!.giftedExecSeconds) {
      const actualUsageGifted = this.org!.giftedExecSeconds[currentPeriod];
      if (actualUsageGifted) {
        usageSecondsGifted = actualUsageGifted;
      }
    }
    const maxExecSecsGifted = this.org!.quotas.giftedExecMinutes * 60;
    // Cap usage at quota for display purposes
    if (usageSecondsGifted > maxExecSecsGifted) {
      usageSecondsGifted = maxExecSecsGifted;
    }
    if (usageSecondsGifted) {
      // Quota for gifted = this month's usage + remaining available
      quotaSecondsAllTypes += usageSecondsGifted;
      quotaSecondsGifted += usageSecondsGifted;
    }

    const hasQuota = Boolean(quotaSecondsAllTypes);
    const isReached = hasQuota && usageSecondsAllTypes >= quotaSecondsAllTypes;

    const maxTotalTime = quotaSeconds + quotaSecondsExtra + quotaSecondsGifted;
    if (isReached) {
      usageSecondsAllTypes = maxTotalTime;
      quotaSecondsAllTypes = maxTotalTime;
    }

    const hasExtra =
      usageSecondsExtra ||
      this.org!.extraExecSecondsAvailable ||
      usageSecondsGifted ||
      this.org!.giftedExecSecondsAvailable;

    const renderBar = (
      /** Time in Seconds */
      used: number,
      quota: number,
      label: string,
      color: string,
      divided = true,
    ) => {
      if (divided) {
        return html` <btrix-divided-meter-bar
          value=${(used / quotaSecondsAllTypes) * 100}
          quota=${(quota / quotaSecondsAllTypes) * 100}
          style="--background-color:var(--sl-color-${color}-400); --quota-background-color:var(--sl-color-${color}-100)"
        >
          <div class="text-center">
            <div>${label}</div>
            <div class="text-xs opacity-80">
              ${humanizeExecutionSeconds(used, { displaySeconds: true })} /
              ${humanizeExecutionSeconds(quota, { displaySeconds: true })}
            </div>
          </div>
        </btrix-divided-meter-bar>`;
      } else {
        return html`<btrix-meter-bar
          value=${100}
          style="--background-color:var(--sl-color-${color}-400);"
        >
          <div class="text-center">
            <div>${label}</div>
            <div class="text-xs opacity-80">
              ${humanizeExecutionSeconds(used, { displaySeconds: true })} |
              ${this.renderPercentage(used / quota)}
            </div>
          </div>
        </btrix-meter-bar>`;
      }
    };
    return html`
      <div class="mb-1 font-semibold">
        ${when(
          isReached,
          () => html`
            <div class="flex items-center gap-2">
              <sl-icon
                class="text-danger"
                name="exclamation-triangle"
              ></sl-icon>
              <span>${msg("Execution Minutes Quota Reached")}</span>
            </div>
          `,
          () =>
            hasQuota
              ? html`
                  <span class="inline-flex items-center">
                    ${humanizeExecutionSeconds(
                      quotaSeconds -
                        usageSeconds +
                        this.org!.extraExecSecondsAvailable +
                        this.org!.giftedExecSecondsAvailable,
                      { style: "short", round: "down" },
                    )}
                    <span class="ml-1">${msg("remaining")}</span>
                  </span>
                `
              : "",
        )}
      </div>
      ${when(
        hasQuota,
        () => html`
          <div class="mb-2">
            <btrix-meter
              value=${this.org!.giftedExecSecondsAvailable ||
              this.org!.extraExecSecondsAvailable ||
              isReached
                ? quotaSecondsAllTypes
                : usageSeconds}
              max=${quotaSecondsAllTypes}
              valueText=${msg("time")}
            >
              ${when(usageSeconds || quotaSeconds, () =>
                renderBar(
                  usageSeconds > quotaSeconds ? quotaSeconds : usageSeconds,
                  hasExtra ? quotaSeconds : quotaSecondsAllTypes,
                  msg("Monthly Execution Time Used"),
                  "green",
                  hasExtra ? true : false,
                ),
              )}
              ${when(
                usageSecondsGifted || this.org!.giftedExecSecondsAvailable,
                () =>
                  renderBar(
                    usageSecondsGifted > quotaSecondsGifted
                      ? quotaSecondsGifted
                      : usageSecondsGifted,
                    quotaSecondsGifted,
                    msg("Gifted Execution Time Used"),
                    "blue",
                  ),
              )}
              ${when(
                usageSecondsExtra || this.org!.extraExecSecondsAvailable,
                () =>
                  renderBar(
                    usageSecondsExtra > quotaSecondsExtra
                      ? quotaSecondsExtra
                      : usageSecondsExtra,
                    quotaSecondsExtra,
                    msg("Extra Execution Time Used"),
                    "red",
                  ),
              )}
              <div slot="available" class="flex-1">
                <sl-tooltip class="text-center">
                  <div slot="content">
                    <div>${msg("Monthly Execution Time Remaining")}</div>
                    <div class="text-xs opacity-80">
                      ${humanizeExecutionSeconds(quotaSeconds - usageSeconds, {
                        displaySeconds: true,
                      })}
                      |
                      ${this.renderPercentage(
                        (quotaSeconds - usageSeconds) / quotaSeconds,
                      )}
                    </div>
                  </div>
                  <div class="h-full w-full"></div>
                </sl-tooltip>
              </div>
              <span slot="valueLabel">
                ${humanizeExecutionSeconds(usageSecondsAllTypes, {
                  style: "short",
                })}
              </span>
              <span slot="maxLabel">
                ${humanizeExecutionSeconds(quotaSecondsAllTypes, {
                  style: "short",
                })}
              </span>
            </btrix-meter>
          </div>
        `,
      )}
    `;
  }

  private renderCard(
    title: string,
    renderContent: (metric: Metrics) => TemplateResult,
    renderFooter?: (metric: Metrics) => TemplateResult,
  ) {
    return html`
      <btrix-card class="flex-1">
        <span slot="title">${title}</span>
        ${when(
          this.metrics,
          () => renderContent(this.metrics!),
          this.renderCardSkeleton,
        )}
        ${when(
          renderFooter && this.metrics,
          () => html`<div slot="footer">${renderFooter!(this.metrics!)}</div>`,
        )}
      </btrix-card>
    `;
  }

  private renderStat(stat: {
    value: number | string | TemplateResult;
    secondaryValue?: number | string | TemplateResult;
    singleLabel: string;
    pluralLabel: string;
    iconProps: { name: string; library?: string; color?: string };
  }) {
    const { value, iconProps } = stat;
    return html`
      <div class="mb-2 flex items-center justify-between last:mb-0">
        <div class="flex items-center">
          <sl-icon
            class="mr-2 text-base text-neutral-500"
            name=${iconProps.name}
            library=${ifDefined(iconProps.library)}
            style="color:var(--sl-color-${iconProps.color ||
            this.colors.default}-500)"
          ></sl-icon>
          <dt class="order-last">
            ${value === 1 ? stat.singleLabel : stat.pluralLabel}
          </dt>
          <dd class="mr-1">
            ${typeof value === "number" ? value.toLocaleString() : value}
          </dd>
        </div>
        ${when(
          stat.secondaryValue,
          () => html`
            <div class="font-monostyle text-xs text-neutral-500">
              ${stat.secondaryValue}
            </div>
          `,
        )}
      </div>
    `;
  }

  private readonly renderCardSkeleton = () => html`
    <sl-skeleton class="mb-3" effect="sheen"></sl-skeleton>
    <sl-skeleton class="mb-3" effect="sheen"></sl-skeleton>
    <sl-skeleton class="mb-3" effect="sheen"></sl-skeleton>
    <sl-skeleton class="mb-3" effect="sheen"></sl-skeleton>
  `;

  private readonly hasMonthlyTime = () =>
    Object.keys(this.org!.monthlyExecSeconds!).length;

  private readonly hasExtraTime = () =>
    Object.keys(this.org!.extraExecSeconds!).length;

  private readonly hasGiftedTime = () =>
    Object.keys(this.org!.giftedExecSeconds!).length;

  private renderUsageHistory() {
    if (!this.org) return;

    const usageTableCols = [
      msg("Month"),
      html`
        ${msg("Elapsed Time")}
        <sl-tooltip>
          <div slot="content" style="text-transform: initial">
            ${msg("Total time elapsed between when crawls started and ended")}
          </div>
          <sl-icon name="info-circle" style="vertical-align: -.175em"></sl-icon>
        </sl-tooltip>
      `,
      html`
        ${msg("Total Execution Time")}
        <sl-tooltip>
          <div slot="content" style="text-transform: initial">
            ${msg(
              "Total billable time of all crawler instances this used month",
            )}
          </div>
          <sl-icon name="info-circle" style="vertical-align: -.175em"></sl-icon>
        </sl-tooltip>
      `,
    ];

    if (this.hasMonthlyTime()) {
      usageTableCols.push(
        html`${msg("Execution: Monthly")}
          <sl-tooltip>
            <div slot="content" style="text-transform: initial">
              ${msg("Billable time used, included with monthly plan")}
            </div>
            <sl-icon
              name="info-circle"
              style="vertical-align: -.175em"
            ></sl-icon>
          </sl-tooltip>`,
      );
    }
    if (this.hasExtraTime()) {
      usageTableCols.push(
        html`${msg("Execution: Extra")}
          <sl-tooltip>
            <div slot="content" style="text-transform: initial">
              ${msg(
                "Additional units of billable time used, any extra minutes will roll over to next month",
              )}
            </div>
            <sl-icon
              name="info-circle"
              style="vertical-align: -.175em"
            ></sl-icon>
          </sl-tooltip>`,
      );
    }
    if (this.hasGiftedTime()) {
      usageTableCols.push(
        html`${msg("Execution: Gifted")}
          <sl-tooltip>
            <div slot="content" style="text-transform: initial">
              ${msg(
                "Usage of execution time added to your account free of charge",
              )}
            </div>
            <sl-icon
              name="info-circle"
              style="vertical-align: -.175em"
            ></sl-icon>
          </sl-tooltip>`,
      );
    }

    const rows = (Object.entries(this.org.usage || {}) as [YearMonth, number][])
      // Sort latest
      .reverse()
      .map(([mY, crawlTime]) => {
        let monthlySecondsUsed = this.org!.monthlyExecSeconds?.[mY] || 0;
        let maxMonthlySeconds = 0;
        if (this.org!.quotas.maxExecMinutesPerMonth) {
          maxMonthlySeconds = this.org!.quotas.maxExecMinutesPerMonth * 60;
        }
        if (monthlySecondsUsed > maxMonthlySeconds) {
          monthlySecondsUsed = maxMonthlySeconds;
        }

        let extraSecondsUsed = this.org!.extraExecSeconds?.[mY] || 0;
        let maxExtraSeconds = 0;
        if (this.org!.quotas.extraExecMinutes) {
          maxExtraSeconds = this.org!.quotas.extraExecMinutes * 60;
        }
        if (extraSecondsUsed > maxExtraSeconds) {
          extraSecondsUsed = maxExtraSeconds;
        }

        let giftedSecondsUsed = this.org!.giftedExecSeconds?.[mY] || 0;
        let maxGiftedSeconds = 0;
        if (this.org!.quotas.giftedExecMinutes) {
          maxGiftedSeconds = this.org!.quotas.giftedExecMinutes * 60;
        }
        if (giftedSecondsUsed > maxGiftedSeconds) {
          giftedSecondsUsed = maxGiftedSeconds;
        }

        let totalSecondsUsed = this.org!.crawlExecSeconds?.[mY] || 0;
        const totalMaxQuota =
          maxMonthlySeconds + maxExtraSeconds + maxGiftedSeconds;
        if (totalSecondsUsed > totalMaxQuota) {
          totalSecondsUsed = totalMaxQuota;
        }

        const tableRows = [
          html`
            <sl-format-date
              lang=${getLocale()}
              date="${mY}-15T00:00:00.000Z"
              time-zone="utc"
              month="long"
              year="numeric"
            >
            </sl-format-date>
          `,
          humanizeExecutionSeconds(crawlTime || 0),
          totalSecondsUsed ? humanizeExecutionSeconds(totalSecondsUsed) : "--",
        ];
        if (this.hasMonthlyTime()) {
          tableRows.push(
            monthlySecondsUsed
              ? humanizeExecutionSeconds(monthlySecondsUsed)
              : "--",
          );
        }
        if (this.hasExtraTime()) {
          tableRows.push(
            extraSecondsUsed
              ? humanizeExecutionSeconds(extraSecondsUsed)
              : "--",
          );
        }
        if (this.hasGiftedTime()) {
          tableRows.push(
            giftedSecondsUsed
              ? humanizeExecutionSeconds(giftedSecondsUsed)
              : "--",
          );
        }
        return tableRows;
      });
    return html`
      <btrix-details>
        <span slot="title">${msg("Usage History")}</span>
        <btrix-data-table
          .columns=${usageTableCols}
          .rows=${rows}
        ></btrix-data-table>
      </btrix-details>
    `;
  }

  private renderPercentage(ratio: number) {
    const percent = ratio * 100;
    if (percent < 1) return `<1%`;
    return `${percent.toFixed(2)}%`;
  }

  private async fetchMetrics() {
    try {
      const data = await this.apiFetch<Metrics | undefined>(
        `/orgs/${this.orgId}/metrics`,
        this.authState!,
      );

      this.metrics = data;
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve org metrics at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }
}
