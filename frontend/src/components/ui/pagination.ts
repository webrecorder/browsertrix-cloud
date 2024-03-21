import { localized, msg, str } from "@lit/localize";
import { type SlInput } from "@shoelace-style/shoelace";
import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import { srOnly } from "@/utils/css";
import chevronLeft from "~assets/icons/chevron-left.svg";
import chevronRight from "~assets/icons/chevron-right.svg";

type PageChangeDetail = {
  page: number;
  pages: number;
};
export type PageChangeEvent = CustomEvent<PageChangeDetail>;

/**
 * Pagination
 *
 * Usage example:
 * ```ts
 * <btrix-pagination totalCount="11" @page-change=${this.console.log}>
 * </btrix-pagination>
 * ```
 *
 * @event page-change {PageChangeEvent}
 */
@customElement("btrix-pagination")
@localized()
export class Pagination extends LitElement {
  static styles = [
    srOnly,
    css`
      :host {
        --sl-input-height-small: var(--sl-font-size-x-large);
        --sl-input-color: var(--sl-color-neutral-500);
      }

      ul {
        align-items: center;
        list-style: none;
        margin: 0;
        padding: 0;
        color: var(--sl-input-color);
      }

      ul.compact {
        display: flex;
      }

      ul:not(.compact) {
        display: grid;
        grid-gap: var(--sl-spacing-x-small);
        grid-auto-flow: column;
        grid-auto-columns: min-content;
      }

      button {
        all: unset;
        display: flex;
        align-items: center;
        cursor: pointer;
      }

      sl-input::part(input) {
        text-align: center;
        padding: 0 0.5ch;
      }

      .currentPage {
        display: flex;
        align-items: center;
        width: fit-content;
        white-space: nowrap;
      }

      .pageInput {
        position: relative;
        margin-right: 0.5ch;
      }

      /* Use width of text to determine input width */
      .totalPages {
        padding: 0 1ch;
        height: var(--sl-input-height-small);
        min-width: 1ch;
        visibility: hidden;
      }

      .input {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
      }

      .navButton {
        display: grid;
        grid-template-columns: repeat(2, min-content);
        grid-gap: var(--sl-spacing-x-small);
        margin: 0 var(--sl-spacing-x-small);
        align-items: center;
        font-weight: 500;
        transition: opacity 0.2s;
        min-height: 1.5rem;
        min-width: 1.5rem;
      }

      .navButton[disabled] {
        opacity: 0.4;
      }

      .navButton:not([disabled]):hover {
        opacity: 0.8;
      }

      .chevron {
        display: block;
        width: var(--sl-spacing-medium);
        height: var(--sl-spacing-medium);
      }

      .compact .navButton {
        display: flex;
        justify-content: center;
      }
    `,
  ];

  @property({ type: Number })
  page = 1;

  @property({ type: Number })
  totalCount = 0;

  @property({ type: Number })
  size = 10;

  @property({ type: Boolean })
  compact = false;

  @state()
  private inputValue = "";

  @state()
  private pages = 0;

  connectedCallback() {
    this.inputValue = `${this.page}`;
    super.connectedCallback();
  }

  async willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("totalCount") || changedProperties.has("size")) {
      this.calculatePages();
    }

    if (changedProperties.get("page") && this.page) {
      this.inputValue = `${this.page}`;
    }
  }

  render() {
    if (this.pages < 2) {
      return;
    }

    return html`
      <div role="navigation">
        <ul class=${classMap({ compact: this.compact })}>
          <li>
            <button
              class="navButton"
              ?disabled=${this.page === 1}
              @click=${this.onPrev}
            >
              <img class="chevron" src=${chevronLeft} />
              <span class=${classMap({ srOnly: this.compact })}
                >${msg("Previous")}</span
              >
            </button>
          </li>
          ${when(this.compact, this.renderInputPage, this.renderPages)}
          <li>
            <button
              class="navButton"
              ?disabled=${this.page === this.pages}
              @click=${this.onNext}
            >
              <span class=${classMap({ srOnly: this.compact })}
                >${msg("Next")}</span
              >
              <img class="chevron" src=${chevronRight} />
            </button>
          </li>
        </ul>
      </div>
    `;
  }

  private readonly renderInputPage = () => html`
    <li class="currentPage" role="presentation">
      ${msg(html` ${this.renderInput()} of ${this.pages} `)}
    </li>
  `;

  private renderInput() {
    return html`
      <div class="pageInput">
        <div class="totalPages" role="none">${this.pages}</div>
        <sl-input
          class="input"
          inputmode="numeric"
          size="small"
          value=${this.inputValue}
          aria-label=${msg(str`Current page, page ${this.page}`)}
          aria-current="page"
          autocomplete="off"
          min="1"
          max=${this.pages}
          @keydown=${(e: KeyboardEvent) => {
            // Prevent typing non-numeric keys
            if (e.key.length === 1 && /\D/.test(e.key)) {
              e.preventDefault();
            }
          }}
          @keyup=${(e: KeyboardEvent) => {
            const { key } = e;

            if (key === "ArrowUp" || key === "ArrowRight") {
              this.inputValue = `${Math.min(+this.inputValue + 1, this.pages)}`;
            } else if (key === "ArrowDown" || key === "ArrowLeft") {
              this.inputValue = `${Math.max(+this.inputValue - 1, 1)}`;
            } else {
              this.inputValue = (e.target as SlInput).value;
            }
          }}
          @sl-change=${(e: Event) => {
            const page = +(e.target as HTMLInputElement).value;
            let nextPage = page;

            if (page < 1) {
              nextPage = 1;
            } else if (page > this.pages) {
              nextPage = this.pages;
            } else {
              nextPage = page;
            }

            this.onPageChange(nextPage);
          }}
          @focus=${(e: Event) => {
            // Select text on focus for easy typing
            (e.target as SlInput).select();
          }}
        ></sl-input>
      </div>
    `;
  }

  private readonly renderPages = () => {
    const pages = Array.from({ length: this.pages }).map((_, i) => i + 1);
    const middleVisible = 3;
    const middlePad = Math.floor(middleVisible / 2);
    const middleEnd = middleVisible * 2 - 1;
    const endsVisible = 2;
    if (this.pages > middleVisible + middleEnd) {
      const currentPageIdx = pages.indexOf(this.page);
      const firstPages = pages.slice(0, endsVisible);
      const lastPages = pages.slice(-1 * endsVisible);
      let middlePages = pages.slice(endsVisible, middleEnd);
      if (currentPageIdx > middleVisible) {
        middlePages = pages.slice(
          Math.min(currentPageIdx - middlePad, this.pages - middleEnd),
          Math.min(currentPageIdx + middlePad + 1, this.pages - endsVisible),
        );
      }

      return html`
        ${firstPages.map(this.renderPageButton)}
        ${when(
          middlePages[0] > firstPages[firstPages.length - 1] + 1,
          () => html`...`,
        )}
        ${middlePages.map(this.renderPageButton)}
        ${when(
          lastPages[0] > middlePages[middlePages.length - 1] + 1,
          () => html`...`,
        )}
        ${lastPages.map(this.renderPageButton)}
      `;
    }
    return html`${pages.map(this.renderPageButton)}`;
  };

  private readonly renderPageButton = (page: number) => {
    const isCurrent = page === this.page;
    return html`<li aria-current=${ifDefined(isCurrent ? "page" : undefined)}>
      <btrix-navigation-button
        icon
        .active=${isCurrent}
        .size=${"small"}
        .align=${"center"}
        @click=${() => this.onPageChange(page)}
        aria-disabled=${isCurrent}
        >${page}</btrix-navigation-button
      >
    </li>`;
  };

  private onPrev() {
    this.onPageChange(this.page > 1 ? this.page - 1 : 1);
  }

  private onNext() {
    this.onPageChange(this.page < this.pages ? this.page + 1 : this.pages);
  }

  private onPageChange(page: number) {
    this.dispatchEvent(
      new CustomEvent<PageChangeDetail>("page-change", {
        detail: { page: page, pages: this.pages },
        composed: true,
      }),
    );
  }

  private calculatePages() {
    if (this.totalCount && this.size) {
      this.pages = Math.ceil(this.totalCount / this.size);
    } else {
      this.pages = 0;
    }
  }
}
