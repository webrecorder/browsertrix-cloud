import { msg, str } from "@lit/localize";
import { html, type TemplateResult } from "lit";

import type { ArchivedItem, CrawlState, Workflow } from "@/types/crawler";

export const activeCrawlStates: CrawlState[] = [
  "starting",
  "waiting_org_limit",
  "waiting_capacity",
  "running",
  "generate-wacz",
  "uploading-wacz",
  "pending-wait",
  "stopping",
];

export const finishedCrawlStates: CrawlState[] = [
  "complete",
  "stopped_by_user",
  "stopped_quota_reached",
];

export const inactiveCrawlStates: CrawlState[] = [
  ...finishedCrawlStates,
  "canceled",
  "skipped_quota_reached",
  "failed",
];

export const DEFAULT_MAX_SCALE = 3;

export function isActive(state: CrawlState | null) {
  return state && activeCrawlStates.includes(state);
}

export function renderName(item: ArchivedItem | Workflow) {
  if (item.name) return html`<span class="truncate">${item.name}</span>`;
  if (item.firstSeed && item.seedCount) {
    const remainder = item.seedCount - 1;
    let nameSuffix: string | TemplateResult<1> = "";
    if (remainder) {
      if (remainder === 1) {
        nameSuffix = html`<span class="ml-1"
          >${msg(str`+${remainder} URL`)}</span
        >`;
      } else {
        nameSuffix = html`<span class="ml-1"
          >${msg(str`+${remainder} URLs`)}</span
        >`;
      }
    }
    return html`
      <div class="inline-flex overflow-hidden whitespace-nowrap">
        <span class="min-w-0 truncate">${item.firstSeed}</span>
        <span>${nameSuffix}</span>
      </div>
    `;
  }

  return html`<span class="truncate text-neutral-500"
    >${msg("(unnamed item)")}</span
  >`;
}
