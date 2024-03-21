import { localized, msg } from "@lit/localize";
import { type SlInput, type SlSelect } from "@shoelace-style/shoelace";
import { type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import debounce from "lodash/fp/debounce";

import type { UnderlyingFunction } from "@/types/utils";
import LiteElement, { html } from "@/utils/LiteElement";
import { regexEscape } from "@/utils/string";

export type Exclusion = {
  type: "text" | "regex";
  value: string;
};

export type ExclusionChangeEvent = CustomEvent<{
  value: string;
  valid: boolean;
}>;

export type ExclusionAddEvent = CustomEvent<{
  regex: string;
  onSuccess: () => void;
}>;

const MIN_LENGTH = 2;

/**
 * Crawl queue exclusion form
 *
 * Usage example:
 * ```ts
 * <btrix-queue-exclusion-form
 *  @on-change=${this.handleExclusionChange}
 *  @on-add=${this.handleExclusionAdd}
 * ></btrix-queue-exclusion-form>
 * ```
 *
 * @event on-change ExclusionChangeEvent
 * @event on-add ExclusionAddEvent
 */
@localized()
@customElement("btrix-queue-exclusion-form")
export class QueueExclusionForm extends LiteElement {
  @property({ type: Boolean })
  isSubmitting = false;

  @property({ type: String })
  fieldErrorMessage = "";

  @state()
  private selectValue: Exclusion["type"] = "text";

  @state()
  private inputValue = "";

  @state()
  private isRegexInvalid = false;

  async willUpdate(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ) {
    if (
      changedProperties.get("selectValue") ||
      (changedProperties.has("inputValue") &&
        changedProperties.get("inputValue") !== undefined)
    ) {
      this.fieldErrorMessage = "";
      this.checkInputValidity();
      void this.dispatchChangeEvent();
    }
  }

  disconnectedCallback(): void {
    this.onInput.cancel();
    super.disconnectedCallback();
  }

  render() {
    return html`
      <fieldset>
        <div class="flex">
          <div class="flex-0 w-40 px-1">
            <sl-select
              placeholder=${msg("Select Type")}
              size="small"
              value=${this.selectValue}
              @sl-hide=${this.stopProp}
              @sl-after-hide=${this.stopProp}
              @sl-change=${(e: Event) => {
                this.selectValue = (e.target as SlSelect).value as
                  | "text"
                  | "regex";
              }}
            >
              <sl-option value="text">${msg("Matches Text")}</sl-option>
              <sl-option value="regex">${msg("Regex")}</sl-option>
            </sl-select>
          </div>
          <div class="flex flex-1 pl-1">
            <div class="mb-2 mr-1 flex-1 md:mb-0">
              <sl-input
                class=${this.fieldErrorMessage ? "invalid" : ""}
                size="small"
                autocomplete="off"
                minlength=${MIN_LENGTH}
                placeholder=${this.selectValue === "text"
                  ? "/skip-this-page"
                  : "example.com/skip.*"}
                .value=${this.inputValue}
                ?disabled=${this.isSubmitting}
                @keydown=${this.onKeyDown}
                @sl-input=${this.onInput as UnderlyingFunction<
                  typeof this.onInput
                >}
              >
                ${this.fieldErrorMessage
                  ? html`
                      <div slot="help-text">
                        ${this.isRegexInvalid
                          ? html`
                              <p class="text-danger">
                                ${msg(
                                  html`Regular Expression syntax error:
                                    <code>${this.fieldErrorMessage}</code>`,
                                )}
                              </p>
                              <p>
                                ${msg(
                                  html`Please enter a valid constructor string
                                    pattern. See
                                    <a
                                      class="underline hover:no-underline"
                                      href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp"
                                      target="_blank"
                                      rel="noopener noreferrer nofollow"
                                      ><code>RegExp</code> docs</a
                                    >.`,
                                )}
                              </p>
                            `
                          : html`<p class="text-danger">
                              ${this.fieldErrorMessage}
                            </p>`}
                      </div>
                    `
                  : ""}
              </sl-input>
            </div>
            <div class="flex-0 w-10 pt-1 text-center">
              <btrix-button
                variant="primary"
                raised
                icon
                ?disabled=${!this.inputValue ||
                this.isRegexInvalid ||
                this.isSubmitting}
                ?loading=${this.isSubmitting}
                @click=${this.onButtonClick}
              >
                <sl-icon name="plus-lg"></sl-icon>
              </btrix-button>
            </div>
          </div>
        </div>
      </fieldset>
    `;
  }

  private readonly onInput = debounce(200)((e: Event) => {
    this.inputValue = (e.target as SlInput).value;
  });

  private onButtonClick() {
    void this.handleAdd();
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      void this.handleAdd();
    }
  };

  private checkInputValidity(): void {
    let isValid = true;

    if (!this.inputValue || this.inputValue.length < MIN_LENGTH) {
      isValid = false;
    } else if (this.selectValue === "regex") {
      try {
        // Check if valid regex
        new RegExp(this.inputValue);
      } catch (err) {
        this.fieldErrorMessage = (err as Error).message;
        isValid = false;
      }
    }

    this.isRegexInvalid = !isValid;
  }

  private async dispatchChangeEvent() {
    await this.updateComplete;
    this.dispatchEvent(
      new CustomEvent("on-change", {
        detail: {
          value:
            this.selectValue === "text"
              ? regexEscape(this.inputValue)
              : this.inputValue,
          valid: !this.isRegexInvalid,
        },
      }) as ExclusionChangeEvent,
    );
  }

  private async handleAdd() {
    this.onInput.flush();
    await this.updateComplete;
    if (!this.inputValue) return;

    let regex = this.inputValue;
    if (this.selectValue === "text") {
      regex = regexEscape(this.inputValue);
    }

    this.dispatchEvent(
      new CustomEvent("on-add", {
        detail: {
          regex,
          onSuccess: () => {
            this.inputValue = "";
          },
        },
      }) as ExclusionAddEvent,
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
