import { msg, str } from "@lit/localize";
import type { SlChangeEvent, SlSelect } from "@shoelace-style/shoelace";
import { html, nothing, type TemplateResult } from "lit";
import { when } from "lit/directives/when.js";

import type { ArchivedItemDetail } from "../archived-item-detail";

import type { PageChangeEvent } from "@/components/ui/pagination";
import { iconFor as iconForPageReview } from "@/features/qa/page-list/helpers";
import {
  approvalFromPage,
  labelFor as labelForPageReview,
} from "@/features/qa/page-list/helpers/reviewStatus";
import type { SelectDetail } from "@/features/qa/qa-run-dropdown";
import type { ArchivedItem, ArchivedItemPage } from "@/types/crawler";
import type { QARun } from "@/types/qa";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";

export const iconForCrawlReview = (status: ArchivedItem["reviewStatus"]) => {
  switch (status) {
    case "acceptable":
      return html`<sl-icon
        name="patch-minus"
        class="text-success-600"
      ></sl-icon>`;

    case "failure":
      return html`<sl-icon
        name="patch-exclamation-fill"
        class="text-danger-600"
      ></sl-icon>`;

    case "good":
      return html`<sl-icon
        name="patch-check-fill"
        class="text-success-600"
      ></sl-icon>`;

    default:
      return;
  }
};

export const labelForCrawlReview = (severity: ArchivedItem["reviewStatus"]) => {
  switch (severity) {
    case "failure":
      return msg("Poor");
    case "acceptable":
      return msg("Fair");
    case "good":
      return msg("Good");
    default:
      return;
  }
};

function runAnalysisStatus(qaRun: QARun) {
  return html`
    <btrix-crawl-status state=${qaRun.state} type="qa"></btrix-crawl-status>
  `;
}

function statusWithIcon(
  icon: TemplateResult<1>,
  label: string | TemplateResult<1>,
) {
  return html`
    <div class="flex items-center gap-2">
      <span class="inline-flex text-base">${icon}</span>${label}
    </div>
  `;
}

function displayReviewStatus(status: ArchivedItem["reviewStatus"] | undefined) {
  if (status === undefined) return nothing;
  const icon =
    iconForCrawlReview(status) ??
    html` <sl-icon name="slash-circle" class="text-neutral-400"></sl-icon> `;
  const label =
    labelForCrawlReview(status) ??
    html`<span class="text-neutral-400">${msg("None Submitted")}</span>`;

  return statusWithIcon(icon, label);
}

function pageReviewStatus(page: ArchivedItemPage) {
  const approvalStatus = approvalFromPage(page);
  const status = approvalStatus === "commentOnly" ? null : approvalStatus;
  const icon = iconForPageReview(status);
  const label =
    labelForPageReview(status) ??
    html`<span class="text-neutral-400">${msg("None")}</span>`;

  return statusWithIcon(icon, label);
}

function renderCommentIcon() {
  return html`<sl-icon
    name="chat-square-text-fill"
    class="text-blue-600"
  ></sl-icon> `;
}

function renderAnalysis() {
  return html`
    <div class="flex flex-col gap-6 md:flex-row">
      <btrix-card class="flex-1">
        <span slot="title">${msg("Screenshots")}</span>
        TODO
      </btrix-card>
      <btrix-card class="flex-1">
        <span slot="title">${msg("Extracted Text")}</span>
        TODO
      </btrix-card>
      <btrix-card class="flex-1">
        <span slot="title">${msg("Page Resources")}</span>
        TODO
      </btrix-card>
    </div>
  `;
}

function renderPageListControls(component: ArchivedItemDetail) {
  return html`
    <div
      class="z-40 mb-1 flex flex-wrap items-center gap-2 rounded-lg border bg-neutral-50 px-5 py-3"
    >
      <div class="flex w-full grow items-center md:w-fit">
        <sl-select
          id="qaPagesSortBySelect"
          class="label-same-line"
          label=${msg("Sort by:")}
          size="small"
          value="approved.-1"
          pill
          @sl-change=${(e: SlChangeEvent) => {
            const { value } = e.target as SlSelect;
            const [field, direction] = (
              Array.isArray(value) ? value[0] : value
            ).split(".");
            component.fetchPages({
              sortBy: field,
              sortDirection: +direction,
              page: 1,
            });
          }}
        >
          <sl-option value="title.1">${msg("Title")}</sl-option>
          <sl-option value="url.1">${msg("URL")}</sl-option>
          <sl-option value="notes.-1">${msg("Most comments")}</sl-option>
          <sl-option value="approved.-1">${msg("Recently approved")}</sl-option>
          <sl-option value="approved.1">${msg("Not approved")}</sl-option>
        </sl-select>
      </div>
    </div>
  `;
}

function renderPageList(component: ArchivedItemDetail) {
  const commentIcon = renderCommentIcon();
  return html`
    <btrix-table
      class="mx-2"
      style="grid-template-columns: ${[
        "[clickable-start] auto",
        "12rem",
        "12rem [clickable-end]",
      ].join(" ")}"
    >
      <btrix-table-head>
        <btrix-table-header-cell>${msg("Page")}</btrix-table-header-cell>
        <btrix-table-header-cell>${msg("Approval")}</btrix-table-header-cell>
        <btrix-table-header-cell>${msg("Comments")}</btrix-table-header-cell>
      </btrix-table-head>
      <btrix-table-body class="rounded border">
        ${component.pages?.items.map(
          (page, idx) => html`
            <btrix-table-row
              class="${idx > 0
                ? "border-t"
                : ""} cursor-pointer select-none transition-colors focus-within:bg-neutral-50 hover:bg-neutral-50"
            >
              <btrix-table-cell
                class="block overflow-hidden"
                rowClickTarget="a"
              >
                <a
                  class="truncate text-sm font-semibold"
                  href=${`${
                    component.navigate.orgBasePath
                  }/items/${component.itemType}/${component.crawlId}/review/screenshots?qaRunId=${
                    component.qaRunId || ""
                  }&itemPageId=${page.id}`}
                  @click=${component.navigate.link}
                  >${page.title}</a
                >
                <div class="truncate text-xs leading-4 text-neutral-600">
                  ${page.url}
                </div>
              </btrix-table-cell>
              <btrix-table-cell>${pageReviewStatus(page)}</btrix-table-cell>
              <btrix-table-cell
                >${page.notes?.length
                  ? statusWithIcon(
                      commentIcon,
                      page.notes.length === 1
                        ? msg(str`1 comment`)
                        : msg(
                            str`${page.notes.length.toLocaleString()} comments`,
                          ),
                    )
                  : html`<span class="text-neutral-400"
                      >${msg("None")}</span
                    >`}</btrix-table-cell
              >
            </btrix-table-row>
          `,
        )}
      </btrix-table-body>
    </btrix-table>
    ${when(component.pages, (pages) =>
      pages.total > pages.pageSize
        ? html`
            <footer class="mt-3 flex justify-center">
              <btrix-pagination
                page=${pages.page}
                size=${pages.pageSize}
                totalCount=${pages.total}
                @page-change=${(e: PageChangeEvent) => {
                  component.fetchPages({
                    page: e.detail.page,
                  });
                }}
              ></btrix-pagination>
            </footer>
          `
        : nothing,
    )}
  `;
}

/**
 * TODO convert to lit component
 */
export function renderQA(component: ArchivedItemDetail) {
  const reviewStatus = component.crawl?.reviewStatus;
  const qaCrawlExecSeconds = component.crawl?.qaCrawlExecSeconds;
  const qaRuns = component.qaRuns;
  const qaRunId = component.qaRunId;
  const finishedQARuns = qaRuns
    ? qaRuns.filter(({ finished }) => finished)
    : [];
  const renderSpinner = () => html`<sl-spinner></sl-spinner>`;

  return html`
    <div class="mb-5 rounded-lg border p-2">
      <btrix-desc-list horizontal>
        <btrix-desc-list-item label=${msg("Analysis Status")}>
          ${when(
            qaRuns,
            (qaRuns) =>
              qaRuns[0]
                ? runAnalysisStatus(qaRuns[0])
                : statusWithIcon(
                    html`<sl-icon
                      name="slash-circle"
                      class="text-neutral-400"
                    ></sl-icon>`,
                    html`<span class="text-neutral-400">
                      ${msg("Not Analyzed")}
                    </span>`,
                  ),
            renderSpinner,
          )}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Crawl Rating")}>
          ${when(
            reviewStatus !== undefined,
            () => displayReviewStatus(reviewStatus),
            renderSpinner,
          )}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Elapsed Time")}>
          ${when(
            qaCrawlExecSeconds !== undefined,
            () =>
              qaRuns?.[0] && qaCrawlExecSeconds
                ? humanizeExecutionSeconds(qaCrawlExecSeconds)
                : html`<span class="text-neutral-400">${msg("N/A")}</span>`,
            renderSpinner,
          )}
        </btrix-desc-list-item>
      </btrix-desc-list>
    </div>

    <btrix-tab-group>
      <btrix-tab-group-tab slot="nav" panel="pages">
        <sl-icon name="file-richtext-fill"></sl-icon>
        ${msg("Review Pages")}
      </btrix-tab-group-tab>
      <btrix-tab-group-tab slot="nav" panel="runs" ?disabled=${!qaRuns?.length}>
        <sl-icon name="list-ul"></sl-icon>
        ${msg("Analysis Runs")}
      </btrix-tab-group-tab>
      <sl-divider></sl-divider>

      <btrix-tab-group-panel
        name="pages"
        class="-mx-3 block overflow-x-hidden px-3"
      >
        <section class="mb-7">
          <div class="mb-2 flex items-center gap-1">
            <h4 class="text-lg font-semibold leading-8">
              ${msg("QA Analysis")}
            </h4>
            <btrix-qa-run-dropdown
              .items=${finishedQARuns}
              selectedId=${qaRunId || ""}
              @btrix-select=${(e: CustomEvent<SelectDetail>) =>
                (component.qaRunId = e.detail.item.id)}
            ></btrix-qa-run-dropdown>
          </div>

          ${qaRuns
            ? qaRuns[0]
              ? renderAnalysis()
              : html`
                  <div
                    class="rounded-lg border bg-slate-50 p-4 text-center text-slate-600"
                  >
                    ${msg(
                      "This crawl hasn’t been analyzed yet. Run an analysis to access crawl quality metrics.",
                    )}
                  </div>
                `
            : html` <div
                class="grid h-[55px] place-content-center rounded-lg border bg-slate-50 p-4 text-lg text-slate-600"
              >
                <sl-spinner></sl-spinner>
              </div>`}
        </section>
        <div>
          <h4 class="mb-2 mt-4 text-lg leading-8">
            <span class="font-semibold">${msg("Pages")}</span> (${(
              component.pages?.total ?? 0
            ).toLocaleString()})
          </h4>
        </div>
        ${renderPageListControls(component)} ${renderPageList(component)}
      </btrix-tab-group-panel>
      <btrix-tab-group-panel
        name="runs"
        class="-mx-3 block overflow-x-hidden px-3"
      >
        <btrix-table class="grid-cols-[repeat(4,_auto)_min-content]">
          <btrix-table-head>
            <btrix-table-header-cell> ${msg("State")} </btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Started")}
            </btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Finished")}
            </btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Started by")}
            </btrix-table-header-cell>
            <btrix-table-header-cell class="px-1">
              <span class="sr-only">${msg("Row actions")}</span>
            </btrix-table-header-cell>
          </btrix-table-head>
          <btrix-table-body class="rounded border">
            ${qaRuns?.map(
              (run, idx) => html`
                <btrix-table-row class=${idx > 0 ? "border-t" : ""}>
                  <btrix-table-cell>
                    <btrix-crawl-status
                      .state=${run.state}
                      type="qa"
                    ></btrix-crawl-status>
                  </btrix-table-cell>
                  <btrix-table-cell>
                    <sl-format-date
                      date=${`${run.started}Z`}
                      month="2-digit"
                      day="2-digit"
                      year="2-digit"
                      hour="2-digit"
                      minute="2-digit"
                    ></sl-format-date>
                  </btrix-table-cell>
                  <btrix-table-cell>
                    <sl-format-date
                      date=${`${run.finished}Z`}
                      month="2-digit"
                      day="2-digit"
                      year="2-digit"
                      hour="2-digit"
                      minute="2-digit"
                    ></sl-format-date>
                  </btrix-table-cell>
                  <btrix-table-cell>${run.userName}</btrix-table-cell>
                  <btrix-table-cell class="px-1">
                    <div class="col action">
                      <btrix-overflow-dropdown
                        @click=${(e: MouseEvent) => {
                          // Prevent navigation to detail view
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        <sl-menu>
                          <sl-menu-item
                            @click=${() => {
                              console.log("download");
                            }}
                          >
                            <sl-icon name="download" slot="prefix"></sl-icon>
                            ${msg("Download QA Run")}
                          </sl-menu-item>
                          <sl-divider></sl-divider>
                          <sl-menu-item
                            @click=${() => {
                              console.log("delete");
                            }}
                            style="--sl-color-neutral-700: var(--danger)"
                          >
                            <sl-icon name="trash3" slot="prefix"></sl-icon>
                            ${msg("Delete Item")}
                          </sl-menu-item>
                        </sl-menu>
                      </btrix-overflow-dropdown>
                    </div>
                  </btrix-table-cell>
                </btrix-table-row>
              `,
            )}
          </btrix-table-body>
        </btrix-table>
      </btrix-tab-group-panel>
    </btrix-tab-group>
  `;
}
