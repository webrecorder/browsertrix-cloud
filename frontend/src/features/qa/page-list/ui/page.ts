import { localized } from "@lit/localize";
import type { SlTooltip } from "@shoelace-style/shoelace";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query } from "lit/decorators.js";

import {
  iconFor,
  issueCounts,
  maxSeverity,
  severityFromMatch,
} from "../helpers";
import { approvalFromPage } from "../helpers/reviewStatus";
import { type SortableFieldNames } from "../page-list";

import { animateTo, shimKeyframesHeightAuto } from "./animate";
import { pageDetails } from "./page-details";

import { TailwindElement } from "@/classes/TailwindElement";
import { type ArchivedItemQAPage } from "@/types/qa";

@localized()
@customElement("btrix-qa-page")
export class QaPage extends TailwindElement {
  @property({ type: Object })
  page?: ArchivedItemQAPage;

  @property({ type: String })
  statusField: SortableFieldNames = "screenshotMatch";

  @property({ type: Boolean })
  selected = false;

  @query(".contentContainer")
  private contentContainer?: HTMLElement;

  @query("sl-tooltip")
  private tooltip?: SlTooltip;

  private select = async () => {
    if (this.selected) return;

    this.tooltip?.hide();
    this.dispatchEvent(
      new CustomEvent<string>("btrix-qa-page-select", {
        detail: this.page!.id,
        composed: true,
        bubbles: true,
      }),
    );
  };

  private animateExpand = async () => {
    if (!this.contentContainer) return;
    await animateTo(
      this.contentContainer,
      shimKeyframesHeightAuto(
        [
          {
            height: "0",
            opacity: "0",
            overflow: "hidden",
            transform: `translateY(-2px)`,
          },
          {
            height: "auto",
            opacity: "1",
            overflow: "hidden",
            transform: `translateY(0)`,
          },
        ],
        this.contentContainer.scrollHeight,
      ),
      { duration: 250, easing: "cubic-bezier(0.4, 0.0, 0.2, 1)" },
    );
  };

  private animateCollapse = async () => {
    if (!this.contentContainer) return;
    await animateTo(
      this.contentContainer,
      shimKeyframesHeightAuto(
        [
          {
            height: "auto",
            opacity: "1",
            overflow: "hidden",
            transform: `translateY(0)`,
          },
          {
            height: "0",
            opacity: "0",
            overflow: "hidden",
            transform: `translateY(-2px)`,
          },
        ],
        this.contentContainer.scrollHeight,
      ),
      { duration: 250, easing: "cubic-bezier(0.4, 0.0, 0.2, 1)" },
    );
  };

  protected async updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("selected")) {
      if (this.selected) {
        await this.animateExpand();
        this.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      } else if (changedProperties.get("selected") === true) {
        void this.animateCollapse();
      }
    }
  }

  render() {
    const page = this.page;
    if (!page) return;
    let { severe, moderate } = issueCounts(page);

    const statusIcon =
      approvalFromPage(page) ??
      {
        screenshotMatch: severityFromMatch(page.qa.screenshotMatch),
        textMatch: severityFromMatch(page.qa.textMatch),
        approved: approvalFromPage(page) ?? maxSeverity(page),
      }[this.statusField];

    if (statusIcon === "severe") severe--;
    if (statusIcon === "moderate") moderate--;

    return html`
      <div class="py-1.5 text-sm text-gray-600">
        <div
          class="relative z-20 ml-4 block flex-auto cursor-pointer select-none overflow-visible rounded border border-solid border-gray-300 bg-white px-4 py-2 pl-6 shadow-none outline-none transition-shadow  aria-selected:border-blue-500 aria-selected:bg-blue-50 aria-selected:shadow aria-selected:shadow-blue-800/20 aria-selected:transition-none"
          @click=${this.select}
          tabindex="0"
          aria-selected=${this.selected}
        >
          <sl-tooltip placement="left" hoist>
            <div slot="content" class="text-xs">${pageDetails(page)}</div>
            <div
              class="absolute -left-4 top-[50%] flex w-8 translate-y-[-50%] flex-col place-items-center gap-1 rounded-full border border-gray-300 bg-neutral-0 p-2 leading-[14px] shadow transition-transform hover:scale-110"
            >
              ${iconFor(statusIcon)}
              ${severe > 0
                ? html`<span class="text-[10px] font-semibold text-red-600"
                    >+${severe}</span
                  >`
                : moderate > 0
                  ? html`<span class="text-[10px] font-semibold text-yellow-600"
                      >+${moderate}</span
                    >`
                  : nothing}
              ${page.notes?.[0] &&
              html`<sl-icon
                name="chat-square-text-fill"
                class="text-blue-600"
              ></sl-icon>`}
            </div>
          </sl-tooltip>
          <h5 class="truncate text-sm font-semibold text-black">
            ${page.title}
          </h5>
          <div class="truncate text-xs leading-4 text-blue-600">
            ${page.url}
          </div>
        </div>
        <div
          class="contentContainer ${this.selected
            ? "h-auto"
            : "h-0"} overflow-hidden [contain:content] [content-visibility:auto]"
        >
          <div
            class="z-10 -mt-2 ml-6 mr-2 rounded-b-lg border border-solid border-gray-200 bg-neutral-0 px-4 pb-1 pt-4"
          >
            ${pageDetails(page)}
          </div>
        </div>
      </div>
    `;
  }
}
