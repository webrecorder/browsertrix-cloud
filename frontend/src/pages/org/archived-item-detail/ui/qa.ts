import { msg } from "@lit/localize";
import { html } from "lit";
import { when } from "lit/directives/when.js";

import type { ArchivedItemDetail } from "../archived-item-detail";

import type { SelectDetail } from "@/features/qa/qa-run-dropdown";
import type { ArchivedItem } from "@/types/crawler";
import type { QARun } from "@/types/qa";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";

type RenderParams = {
  reviewStatus: ArchivedItem["reviewStatus"] | undefined;
  qaCrawlExecSeconds: ArchivedItem["qaCrawlExecSeconds"] | undefined;
  qaRuns: ArchivedItemDetail["qaRuns"];
  qaRunId: ArchivedItemDetail["qaRunId"];
  pages: ArchivedItemDetail["pages"];
};

function runAnalysisStatus(qaRun: QARun) {
  return html` <btrix-crawl-status state=${qaRun.state}></btrix-crawl-status> `;
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

export function renderQA({
  reviewStatus,
  qaCrawlExecSeconds,
  qaRuns,
  qaRunId,
  pages,
}: RenderParams) {
  const finishedQARuns = qaRuns
    ? qaRuns.filter(({ finished }) => finished)
    : [];
  const renderEmpty = () => html`--`;

  return html`
    <div class="mb-5 rounded-lg border p-4">
      <btrix-desc-list horizontal>
        <btrix-desc-list-item label=${msg("Review Status")}>
          ${when(
            reviewStatus !== undefined,
            () => (reviewStatus ? html`${reviewStatus}` : msg("No Review")),
            renderEmpty,
          )}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Analysis Status")}>
          ${when(
            qaRuns,
            (qaRuns) =>
              qaRuns[0] ? runAnalysisStatus(qaRuns[0]) : msg("No Analysis"),
            renderEmpty,
          )}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Analysis Elapsed Time")}>
          ${when(
            qaCrawlExecSeconds !== undefined,
            () =>
              qaRuns?.[0] && qaCrawlExecSeconds
                ? humanizeExecutionSeconds(qaCrawlExecSeconds)
                : msg("N/A"),
            renderEmpty,
          )}
        </btrix-desc-list-item>
      </btrix-desc-list>
    </div>
    <section class="mb-7">
      <div class="flex items-center gap-1">
        <h4 class="text-base font-semibold leading-8">${msg("Analysis")}</h4>
        <btrix-qa-run-dropdown
          .items=${finishedQARuns}
          selectedId=${qaRunId || ""}
          @btrix-select=${(e: CustomEvent<SelectDetail>) =>
            (qaRunId = e.detail.item.id)}
        ></btrix-qa-run-dropdown>
      </div>
      ${when(qaRuns, (qaRuns) =>
        qaRuns[0]
          ? renderAnalysis()
          : html`
              <div
                class="rounded-lg border bg-slate-50 p-4 text-center text-slate-600"
              >
                ${msg(
                  "This crawl hasn’t been analyzed yet. Run an analysis to access crawl quality metrics.",
                )}
              </div>
            `,
      )}
    </section>
    <btrix-tab-group>
      <btrix-tab-group-tab slot="nav" panel="pages">
        ${msg("Page Reviews")}
      </btrix-tab-group-tab>
      <btrix-tab-group-tab slot="nav" panel="runs" ?disabled=${!qaRuns?.length}>
        ${msg("Analysis Runs")}
      </btrix-tab-group-tab>

      <btrix-tab-group-panel name="pages">
        <btrix-table class="qaPageList">
          <btrix-table-head>
            <btrix-table-header-cell> ${msg("Page")} </btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Review Status")}
            </btrix-table-header-cell>
          </btrix-table-head>
          <btrix-table-body class="rounded border">
            ${pages?.items.map(
              (page, idx) => html`
                <btrix-table-row class=${idx > 0 ? "border-t" : ""}>
                  <btrix-table-cell class="block">
                    <div class="text-medium">${page.title}</div>
                    <div class="text-xs">${page.url}</div>
                  </btrix-table-cell>
                  <btrix-table-cell>
                    ${page.approved === true
                      ? msg("Approved")
                      : page.approved === false
                        ? msg("Rejected")
                        : msg("No Review")}
                  </btrix-table-cell>
                </btrix-table-row>
              `,
            )}
          </btrix-table-body>
        </btrix-table>
      </btrix-tab-group-panel>
      <btrix-tab-group-panel name="runs">
        <btrix-table class="qaPageList">
          <btrix-table-head>
            <btrix-table-header-cell>
              ${msg("Started")}
            </btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Finished")}
            </btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Started by")}
            </btrix-table-header-cell>
          </btrix-table-head>
          <btrix-table-body class="rounded border">
            ${qaRuns?.map(
              (run, idx) => html`
                <btrix-table-row class=${idx > 0 ? "border-t" : ""}>
                  <btrix-table-cell class="block">
                    ${run.started}
                  </btrix-table-cell>
                  <btrix-table-cell>${run.finished}</btrix-table-cell>
                  <btrix-table-cell>${run.userName}</btrix-table-cell>
                </btrix-table-row>
              `,
            )}
          </btrix-table-body>
        </btrix-table>
      </btrix-tab-group-panel>
    </btrix-tab-group>
  `;
}
