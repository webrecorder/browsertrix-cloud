import { localized, msg } from "@lit/localize";
import { type SlSelect } from "@shoelace-style/shoelace";
import { merge } from "immutable";
import { css, html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { type SelectEvent } from "@/components/ui/search-combobox";
import { CrawlStatus } from "@/features/archived-items/crawl-status";
import { finishedCrawlStates } from "@/utils/crawler";

export type FilterBy = Partial<Record<string, string>>;
export type SearchValues = {
  names: string[];
  firstSeeds: string[];
  descriptions: string[];
};
export type SortOptions = {
  field: string;
  label: string;
  defaultDirection: number;
}[];
export type SortBy = {
  field: string;
  direction: number;
};
export type FilterChangeEventDetail = FilterBy;
export type SortChangeEventDetail = Partial<SortBy>;

/**
 * @fires btrix-filter-change
 * @fires btrix-sort-change
 */
@localized()
@customElement("btrix-item-list-controls")
export class ItemListControls extends TailwindElement {
  static styles = css``;

  @property({ type: Array })
  searchKeys: ("name" | "firstSeed")[] = ["name"];

  @property({ type: Object })
  keyLabels?: { [key: string]: string };

  @property({ type: Object })
  searchValues?: SearchValues;

  @property({ type: Array })
  sortOptions: SortOptions = [];

  @property({ type: Object })
  sortBy?: SortBy;

  @property({ type: Object })
  filterBy: FilterBy = {};

  @state()
  private searchOptions: ({ name: string } | { firstSeed: string })[] = [];

  private get selectedSearchFilterKey() {
    return this.searchKeys.find((key) => Boolean(this.filterBy[key]));
  }

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("searchValues") && this.searchValues) {
      // Update search/filter collection
      const toSearchItem =
        <K extends PropertyKey>(key: K) =>
        (value: string) =>
          ({
            [key]: value,
          }) as { [key in K]: string };

      this.searchOptions = [
        ...this.searchValues.names.map(toSearchItem("name")),
        ...this.searchValues.firstSeeds.map(toSearchItem("firstSeed")),
      ];
    }
  }

  render() {
    return html`
      <div @sl-hide=${this.stopProp} @sl-after-hide=${this.stopProp}>
        <div class="flex flex-wrap items-center gap-x-5 gap-y-3 md:justify-end">
          <div class="flex-1">${this.renderSearch()}</div>
          ${this.renderSort()}
        </div>
      </div>
    `;
  }

  private renderSearch() {
    return html`
      <btrix-search-combobox
        .searchKeys=${this.searchKeys}
        .keyLabels=${this.keyLabels}
        .searchOptions=${this.searchOptions}
        selectedKey=${ifDefined(this.selectedSearchFilterKey)}
        placeholder=${msg("Filter by name")}
        @btrix-select=${(e: SelectEvent<string>) => {
          const { key, value } = e.detail;
          if (key) {
            this.dispatchEvent(
              new CustomEvent<FilterChangeEventDetail>("btrix-filter-change", {
                detail: merge(this.filterBy, { [key]: value }),
                composed: true,
              }),
            );
          }
        }}
        @btrix-clear=${() => {
          this.dispatchEvent(
            new CustomEvent<FilterChangeEventDetail>("btrix-filter-change", {
              detail: {},
              composed: true,
            }),
          );
        }}
      >
      </btrix-search-combobox>
    `;
  }

  private renderStatusFilter() {
    const viewOptions = finishedCrawlStates.map((state) => {
      const { icon, label } = CrawlStatus.getContent(state);
      return html`<sl-option value=${state}>${icon}${label}</sl-option>`;
    });

    return html`
      <div class="flex items-center gap-2">
        <div class="text-neutral-500">${msg("Status:")}</div>
        <sl-select
          class="flex-1 md:min-w-[15rem]"
          size="small"
          pill
          multiple
          placeholder=${msg("Any")}
          @sl-change=${async (_e: CustomEvent) => {}}
        >
          ${viewOptions}
        </sl-select>
      </div>
    `;
  }

  private renderSort() {
    if (!this.sortBy) {
      return;
    }

    return html`
      <div class="flex items-center gap-2">
        <div class="whitespace-nowrap text-neutral-500">${msg("Sort by:")}</div>
        <div class="flex grow">
          <sl-select
            class="flex-1"
            size="small"
            pill
            value=${this.sortBy.field}
            @sl-change=${(e: CustomEvent) => {
              e.stopPropagation();
              this.dispatchEvent(
                new CustomEvent<SortChangeEventDetail>("btrix-sort-change", {
                  detail: {
                    field: (e.target as SlSelect).value as string,
                  },
                  composed: true,
                }),
              );
            }}
          >
            ${this.sortOptions.map(
              ({ field, label }) => html`
                <sl-option value=${field}>${label}</sl-option>
              `,
            )}
          </sl-select>
          <sl-icon-button
            name="arrow-down-up"
            label=${msg("Reverse sort")}
            @click=${() => {
              this.dispatchEvent(
                new CustomEvent<SortChangeEventDetail>("btrix-sort-change", {
                  detail: {
                    direction: this.sortBy ? this.sortBy.direction * -1 : -1,
                  },
                  composed: true,
                }),
              );
            }}
          ></sl-icon-button>
        </div>
      </div>
    `;
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
