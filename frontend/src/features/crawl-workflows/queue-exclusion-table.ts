import { localized, msg, str } from "@lit/localize";
import { type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import RegexColorize from "regex-colorize";

import type { Exclusion } from "./queue-exclusion-form";

import { type PageChangeEvent } from "@/components/ui/pagination";
import type { SeedConfig } from "@/pages/org/types";
import LiteElement, { html } from "@/utils/LiteElement";
import { regexEscape, regexUnescape } from "@/utils/string";

export type ExclusionChangeEvent = CustomEvent<{
  index: number;
  regex: string;
}>;

export type ExclusionRemoveEvent = CustomEvent<{
  index: number;
  regex: string;
}>;

type SLInputElement = HTMLInputElement & { invalid: boolean };

const MIN_LENGTH = 2;

function formatValue(type: Exclusion["type"], value: Exclusion["value"]) {
  return type == "text" ? regexEscape(value) : value;
}

/**
 * Crawl queue exclusion table
 *
 * Usage example:
 * ```ts
 * <btrix-queue-exclusion-table
 *   .exclusions=${this.workflow.config.exclude}
 * >
 * </btrix-queue-exclusion-table>
 * ```
 *
 * @event on-change ExclusionChangeEvent
 * @event on-remove ExclusionRemoveEvent
 */
@customElement("btrix-queue-exclusion-table")
@localized()
export class QueueExclusionTable extends LiteElement {
  @property({ type: Array })
  exclusions?: SeedConfig["exclude"];

  // TODO switch to LitElement & slotted label
  @property({ type: String })
  label?: string;
  @property({ type: String })
  labelClassName?: string;

  @property({ type: Number })
  pageSize = 5;

  @property({ type: Boolean })
  editable = false;

  @property({ type: Boolean })
  removable = false;

  @state()
  private results: Exclusion[] = [];

  @state()
  private page = 1;

  @state()
  private exclusionToRemove?: string;

  private get total() {
    return this.exclusions?.length;
  }

  willUpdate(changedProperties: PropertyValues<this> & Map<string, unknown>) {
    if (changedProperties.get("exclusions") && this.exclusions) {
      if (
        changedProperties.get("exclusions")!.toString() ===
        this.exclusions.toString()
      ) {
        // Check list equality
        return;
      }
      this.exclusionToRemove = undefined;
      const prevVal = changedProperties.get("exclusions");
      if (prevVal) {
        const prevTotal = prevVal.length;
        const lastPage = Math.ceil(this.total! / this.pageSize);
        if (this.total! < prevTotal) {
          this.page = Math.min(this.page, lastPage);
        } else if (this.total! > prevTotal) {
          this.page = lastPage;
        }
      }
      this.updatePageResults();
    } else if (changedProperties.get("page") && this.page) {
      this.updatePageResults();
    }
  }

  firstUpdated() {
    if (this.exclusions) {
      this.updatePageResults();
    }
  }

  private updatePageResults() {
    if (!this.exclusions) return;

    this.results = this.exclusions
      .slice((this.page - 1) * this.pageSize, this.page * this.pageSize)
      .map((str: string) => {
        // if escaped version of string, with '\' removed matches string, then consider it
        // to be matching text, otherwise, regex
        const isText = regexEscape(str.replace(/\\/g, "")) === str;
        return {
          type: isText ? "text" : "regex",
          value: isText ? regexUnescape(str) : str,
        };
      });
  }

  render() {
    const [typeColClass, valueColClass, actionColClass] =
      this.getColumnClassNames(0, this.results.length, true);

    return html`
      <style>
        btrix-queue-exclusion-table sl-input {
          --sl-input-border-radius-medium: 0;
          --sl-input-font-family: var(--sl-font-mono);
          --sl-input-spacing-medium: var(--sl-spacing-small);
        }

        btrix-queue-exclusion-table sl-input:not([data-invalid]) {
          --sl-input-border-width: 0;
        }
      </style>
      <div class="mb-2 flex items-center justify-between leading-tight">
        <div class=${ifDefined(this.labelClassName)}>
          ${this.label ?? msg("Exclusions")}
        </div>
        ${this.total && this.total > this.pageSize
          ? html`<btrix-pagination
              page=${this.page}
              size=${this.pageSize}
              totalCount=${this.total}
              compact
              @page-change=${(e: PageChangeEvent) => {
                this.page = e.detail.page;
              }}
            >
            </btrix-pagination>`
          : ""}
      </div>
      <table
        class="w-full border-separate leading-none"
        style="border-spacing: 0;"
      >
        <thead class="font-mono text-xs uppercase text-neutral-600">
          <tr class="h-10 text-left">
            <th class="${typeColClass} w-40 bg-slate-50 px-2 font-normal">
              ${msg("Exclusion Type")}
            </th>
            <th class="${valueColClass} bg-slate-50 px-2 font-normal">
              ${msg("Exclusion Value")}
            </th>
            <th class="${actionColClass} w-10 bg-slate-50 px-2 font-normal">
              <span class="sr-only">Row actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          ${this.results.map(this.renderItem)}
        </tbody>
      </table>
    `;
  }

  private readonly renderItem = (
    exclusion: Exclusion,
    pageIndex: number,
    arr: Exclusion[],
  ) => {
    const index = (this.page - 1) * this.pageSize + pageIndex;
    const [typeColClass, valueColClass, actionColClass] =
      this.getColumnClassNames(pageIndex + 1, arr.length);

    return html`
      <tr
        class="${this.exclusionToRemove === exclusion.value
          ? "text-neutral-200"
          : "text-neutral-600"} h-10"
      >
        <td class="${typeColClass} whitespace-nowrap">
          ${this.renderType({ exclusion, index })}
        </td>
        <td class="${valueColClass} font-mono">
          ${this.renderValue({ exclusion, index })}
        </td>
        <td class="${actionColClass} text-center text-[1rem]">
          <btrix-button
            icon
            @click=${() => this.removeExclusion(exclusion, index)}
          >
            <sl-icon name="trash3"></sl-icon>
          </btrix-button>
        </td>
      </tr>
    `;
  };

  private renderType({
    exclusion,
    index,
  }: {
    exclusion: Exclusion;
    index: number;
  }) {
    let typeLabel: string = exclusion.type;

    if (exclusion.type === "text") typeLabel = msg("Matches Text");
    if (exclusion.type === "regex") typeLabel = msg("Regex");

    if (this.editable) {
      return html`
        <sl-select
          placeholder=${msg("Select Type")}
          size="small"
          .value=${exclusion.type}
          @sl-hide=${this.stopProp}
          @sl-after-hide=${this.stopProp}
          @sl-change=${(e: Event) => {
            this.updateExclusion({
              type: (e.target as HTMLSelectElement).value as Exclusion["type"],
              value: exclusion.value,
              index,
            });
          }}
          hoist
        >
          <sl-option value="text">${msg("Matches Text")}</sl-option>
          <sl-option value="regex">${msg("Regex")}</sl-option>
        </sl-select>
      `;
    }

    return typeLabel;
  }

  private renderValue({
    exclusion,
    index,
  }: {
    exclusion: Exclusion;
    index: number;
  }) {
    let value: string | TemplateResult = exclusion.value;

    if (this.editable) {
      return html`
        <sl-input
          name="exclusion-${index}"
          placeholder=${msg("Enter value")}
          class="m-0"
          value=${exclusion.value}
          autocomplete="off"
          autocorrect="off"
          minlength=${MIN_LENGTH}
          @sl-clear=${() => {
            this.updateExclusion({
              type: exclusion.type,
              value: "",
              index,
            });
          }}
          @sl-input=${(e: CustomEvent) => {
            const inputElem = e.target as SLInputElement;
            const validityMessage = this.getInputValidity(inputElem) || "";

            inputElem.classList.remove("invalid");
            inputElem.setCustomValidity(validityMessage);

            this.checkSiblingRowValidity(e);
          }}
          @sl-change=${(e: CustomEvent) => {
            const inputElem = e.target as SLInputElement;
            const values = this.getCurrentValues(inputElem);
            const params = {
              type: values.type || exclusion.type,
              value: values.value,
              index,
            };

            if (!inputElem.checkValidity()) {
              inputElem.classList.add("invalid");
            }
            inputElem.reportValidity();

            this.updateExclusion(params);
          }}
        ></sl-input>
      `;
    }

    if (exclusion.type === "regex") {
      value = staticHtml`<span class="regex">${unsafeStatic(
        new RegexColorize().colorizeText(exclusion.value) as string,
      )}</span>`;
    }

    return value;
  }

  private getColumnClassNames(
    index: number,
    count: number,
    isHeader?: boolean,
  ) {
    let typeColClass = "border-t border-x";
    let valueColClass = "border-t border-r";
    let actionColClass = "border-t border-r";

    if (index === 0) {
      typeColClass += " rounded-tl";

      if (this.removable) {
        actionColClass += " rounded-tr";
      } else {
        valueColClass += " rounded-tr";
      }
    }

    if (index === count) {
      typeColClass += " border-b rounded-bl";

      if (this.removable) {
        valueColClass += " border-b";
        actionColClass += " border-b rounded-br";
      } else {
        valueColClass += " border-b rounded-br";
      }
    }

    if (!this.removable) {
      actionColClass += " hidden";
    }

    if (!isHeader) {
      if (this.editable) {
        typeColClass += " px-[3px]";
      } else {
        typeColClass += " py-2 px-3";
        valueColClass += " p-2";
      }
    }

    return [typeColClass, valueColClass, actionColClass];
  }

  private getCurrentValues(inputElem: SLInputElement) {
    // Get latest exclusion type value from select
    const typeSelectElem = inputElem.closest("tr")?.querySelector("sl-select");
    const exclusionType = typeSelectElem?.value;
    return {
      type: exclusionType as Exclusion["type"] | undefined,
      value: inputElem.value,
    };
  }

  private getInputDuplicateValidity(inputElem: SLInputElement) {
    const siblingElems = inputElem
      .closest("table")
      ?.querySelectorAll(`sl-input:not([name="${inputElem.name}"])`);
    if (!siblingElems) {
      console.debug("getInputDuplicateValidity no matching siblings");
      return;
    }
    const siblingValues = Array.from(siblingElems).map(
      (elem) => (elem as SLInputElement).value,
    );
    const { type, value } = this.getCurrentValues(inputElem);
    const formattedValue = formatValue(type!, value);
    if (siblingValues.includes(formattedValue)) {
      return msg("Exclusion already exists. Please edit or remove to continue");
    }
  }

  private getInputValidity(inputElem: SLInputElement): string | void {
    const { type, value } = this.getCurrentValues(inputElem);
    if (!value) return;

    if (value.length < MIN_LENGTH) {
      return msg(str`Please enter ${MIN_LENGTH} or more characters`);
    }

    if (type === "regex") {
      try {
        // Check if valid regex
        new RegExp(value);
      } catch (err) {
        return msg(
          "Please enter a valid Regular Expression constructor pattern",
        );
      }
    }

    return this.getInputDuplicateValidity(inputElem);
  }

  private checkSiblingRowValidity(e: CustomEvent) {
    // Check if any sibling inputs are now valid
    // after fixing duplicate values
    const inputElem = e.target as HTMLInputElement;
    const table = inputElem.closest("table")!;
    Array.from(table.querySelectorAll("sl-input[data-invalid]")).map((elem) => {
      if (elem !== inputElem) {
        const validityMessage =
          this.getInputDuplicateValidity(elem as SLInputElement) || "";
        (elem as SLInputElement).setCustomValidity(validityMessage);
        (elem as SLInputElement).reportValidity();
      }
    });
  }

  private removeExclusion({ value, type }: Exclusion, index: number) {
    this.exclusionToRemove = value;

    this.dispatchEvent(
      new CustomEvent("on-remove", {
        detail: {
          regex: formatValue(type, value),
          index,
        },
      }) as ExclusionRemoveEvent,
    );
  }

  private updateExclusion({
    type,
    value,
    index,
  }: {
    type: Exclusion["type"];
    value: Exclusion["value"];
    index: number;
  }) {
    this.dispatchEvent(
      new CustomEvent("on-change", {
        detail: {
          index,
          regex: formatValue(type, value),
        },
      }) as ExclusionChangeEvent,
    );
  }

  /**
   * Stop propagation of sl-select events.
   * Prevents bug where sl-dialog closes when dropdown closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: CustomEvent) {
    e.stopPropagation();
  }
}
