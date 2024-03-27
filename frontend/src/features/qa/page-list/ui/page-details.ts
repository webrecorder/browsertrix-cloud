import { msg } from "@lit/localize";
import { html, nothing } from "lit";

import { crawlCounts } from "../helpers/crawlCounts";
import { iconFor } from "../helpers/iconFor";
import {
  severityFromMatch,
  severityFromResourceCounts,
} from "../helpers/severity";

import type { ArchivedItemQAPage } from "@/types/qa";
import { tw } from "@/utils/tailwind";

export function formatPercentage(n: number) {
  if (Number.isNaN(n)) {
    return "n/a";
  }
  return (n * 100).toFixed(2).replace(/[.,]00$/, "");
}

export const pageDetails = (page: ArchivedItemQAPage) =>
  html`<ul class="leading-4">
      <li class="my-3 flex">
        ${iconFor(
          severityFromMatch(page.qa.screenshotMatch),
          tw`mr-2 flex-none`,
        )}
        <span class="inline-block">
          ${page.qa.screenshotMatch != null
            ? html`<span class="font-bold"
                  >${formatPercentage(page.qa.screenshotMatch)}%</span
                >
                ${msg("Screenshot Match")}`
            : msg("No Screenshot Diff")}
        </span>
      </li>
      <li class="my-3 flex">
        ${iconFor(severityFromMatch(page.qa.textMatch), tw`mr-2 flex-none`)}
        <span class="inline-block">
          ${page.qa.textMatch != null
            ? html`<span class="font-bold"
                  >${formatPercentage(page.qa.textMatch)}%</span
                >
                ${msg("Extracted Text Match")}`
            : msg("No Extracted Text Diff")}
        </span>
      </li>
      <li class="my-3 flex">
        ${iconFor(
          severityFromResourceCounts(
            page.qa.resourceCounts.crawlBad,
            page.qa.resourceCounts.crawlGood,
          ),
          tw`mr-2 flex-none`,
        )}
        <span class="inline-block">
          ${page.qa.resourceCounts.crawlBad != null &&
          page.qa.resourceCounts.crawlGood != null
            ? html`<span class="font-bold"
                  >${crawlCounts(
                    page.qa.resourceCounts.crawlBad,
                    page.qa.resourceCounts.crawlGood,
                  )}</span
                >
                ${msg("Resources Loaded (Crawl)")}` // TODO pluralize
            : msg("No Crawl Diff")}
        </span>
      </li>
      <li class="my-3 flex">
        ${iconFor(
          severityFromResourceCounts(
            page.qa.resourceCounts.replayBad,
            page.qa.resourceCounts.replayGood,
          ),
          tw`mr-2 flex-none`,
        )}
        <span class="inline-block">
          ${page.qa.resourceCounts.replayBad != null &&
          page.qa.resourceCounts.replayGood != null
            ? html`<span class="font-bold"
                  >${crawlCounts(
                    page.qa.resourceCounts.replayBad,
                    page.qa.resourceCounts.replayGood,
                  )}</span
                >
                ${msg("Resources Loaded (Replay)")}` // TODO pluralize
            : msg("No Replay Diff")}
        </span>
      </li>
    </ul>
    ${page.notes?.[0]
      ? html` <sl-divider
            class="[--color:theme(colors.gray.200)] [--spacing:theme(spacing.3)]"
          ></sl-divider>
          <ul class="text-xs leading-4">
            ${page.notes.map(
              (note) => html`
                <li class="my-3 flex">
                  <sl-icon
                    name="chat-square-text-fill"
                    class="mr-2 h-4 w-4 flex-none text-blue-600"
                  ></sl-icon>
                  ${note.text}
                </li>
              `,
            )}
          </ul>`
      : nothing}`;
