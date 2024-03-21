import { localized, msg, str } from "@lit/localize";
import type {
  SlMenu,
  SlMenuItem,
  SlPopup,
  SlTag,
} from "@shoelace-style/shoelace";
import inputCss from "@shoelace-style/shoelace/dist/components/input/input.styles.js";
import {
  css,
  html,
  LitElement,
  type CSSResultGroup,
  type PropertyValues,
} from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import debounce from "lodash/fp/debounce";

import type { UnderlyingFunction } from "@/types/utils";
import { dropdown } from "@/utils/css";

export type Tags = string[];
type TagsChangeEventDetail = {
  tags: string[];
};
export type TagsChangeEvent = CustomEvent<TagsChangeEventDetail>;
type TagInputEventDetail = {
  value: string;
};
export type TagInputEvent = CustomEvent<TagInputEventDetail>;

/**
 * Usage:
 * ```ts
 * <btrix-tag-input
 *   initialTags=${[]}
 *   @tags-change=${console.log}
 * ></btrix-tag-input>
 * ```
 *
 * @TODO consolidate with btrix-combobox
 *
 * @events tag-input
 * @events tags-change
 */
@customElement("btrix-tag-input")
@localized()
export class TagInput extends LitElement {
  static styles = [
    dropdown,
    inputCss,
    css`
      :host {
        --tag-height: 1.5rem;
      }

      .input {
        flex-wrap: wrap;
        height: auto;
        overflow: visible;
        min-height: calc(var(--tag-height) + 1rem);
      }

      .input__control {
        flex-grow: 1;
        flex-shrink: 0;
      }

      .input__control:not(:first-child) {
        padding-left: var(--sl-spacing-small);
        padding-right: var(--sl-spacing-small);
      }

      btrix-tag {
        margin-left: var(--sl-spacing-x-small);
        margin-top: calc(0.5rem - 1px);
        max-width: calc(
          100% - var(--sl-spacing-x-small) - var(--sl-spacing-x-small)
        );
      }

      sl-popup::part(popup) {
        z-index: 3;
      }

      .shake {
        animation: shake 0.82s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
        transform: translate3d(0, 0, 0);
        backface-visibility: hidden;
        perspective: 1000px;
      }

      @keyframes shake {
        10%,
        90% {
          transform: translate3d(-1px, 0, 0);
        }
        20%,
        80% {
          transform: translate3d(2px, 0, 0);
        }
        30%,
        50%,
        70% {
          transform: translate3d(-3px, 0, 0);
        }
        40%,
        60% {
          transform: translate3d(3px, 0, 0);
        }
      }
    `,
  ] as CSSResultGroup;

  @property({ type: Array })
  initialTags?: Tags;

  @property({ type: Array })
  tagOptions: Tags = [];

  @property({ type: Boolean })
  disabled = false;

  // TODO validate required
  @property({ type: Boolean })
  required = false;

  @state()
  private tags: Tags = [];

  @state()
  private inputValue = "";

  @state()
  private dropdownIsOpen?: boolean;

  @query(".form-control")
  private readonly formControl!: HTMLElement;

  @query("#input")
  private readonly input!: HTMLInputElement;

  @query("#dropdown")
  private readonly dropdown!: HTMLDivElement;

  @query("sl-menu")
  private readonly menu?: SlMenu;

  @query("sl-popup")
  private readonly combobox!: SlPopup;

  connectedCallback() {
    if (this.initialTags) {
      this.tags = this.initialTags;
    }
    super.connectedCallback();
  }

  willUpdate(changedProperties: PropertyValues<this> & Map<string, unknown>) {
    if (changedProperties.has("tags") && this.required) {
      if (this.tags.length) {
        this.removeAttribute("data-invalid");
      } else {
        this.setAttribute("data-invalid", "");
      }
    }
    if (changedProperties.has("dropdownIsOpen")) {
      if (this.dropdownIsOpen) {
        this.openDropdown();
      } else {
        this.closeDropdown();
      }
    }
  }

  reportValidity() {
    this.input.reportValidity();
  }

  render() {
    const placeholder = msg("Tags separated by comma");
    return html`
      <div class="form-control form-control--has-label">
        <label
          class="form-control__label"
          part="form-control-label"
          for="input"
        >
          <slot name="label">${msg("Tags")}</slot>
        </label>
        <div
          class="input input--medium input--standard"
          tabindex="-1"
          @click=${this.onInputWrapperClick}
          @focusout=${(e: FocusEvent) => {
            const currentTarget = e.currentTarget as SlMenuItem | null;
            const relatedTarget = e.relatedTarget as HTMLElement | null;
            if (
              this.dropdownIsOpen &&
              !currentTarget?.contains(relatedTarget)
            ) {
              this.dropdownIsOpen = false;
            }
          }}
        >
          ${this.renderTags()}
          <sl-popup
            placement="bottom-start"
            strategy="fixed"
            skidding="4"
            distance="-4"
            active
          >
            <input
              slot="anchor"
              id="input"
              class="input__control"
              style="min-width: ${placeholder.length}ch"
              @focus=${this.onFocus}
              @blur=${this.onBlur}
              @input=${this.onInput as UnderlyingFunction<typeof this.onInput>}
              @keydown=${this.onKeydown}
              @keyup=${this.onKeyup}
              @paste=${this.onPaste}
              ?required=${this.required && !this.tags.length}
              placeholder=${placeholder}
              role="combobox"
              aria-controls="dropdown"
              aria-expanded="${this.dropdownIsOpen === true}"
            />
            <div
              id="dropdown"
              class="dropdown hidden"
              @animationend=${(e: AnimationEvent) => {
                const el = e.target as HTMLDivElement;
                if (e.animationName === "dropdownShow") {
                  el.classList.remove("animateShow");
                }
                if (e.animationName === "dropdownHide") {
                  el.classList.add("hidden");
                  el.classList.remove("animateHide");
                }
              }}
            >
              <sl-menu
                role="listbox"
                @keydown=${(e: KeyboardEvent) => {
                  e.stopPropagation();
                }}
                @keyup=${(e: KeyboardEvent) => {
                  e.stopPropagation();
                  if (e.key === "Escape") {
                    this.dropdownIsOpen = false;
                    this.input.focus();
                  }
                }}
                @sl-select=${this.onSelect}
              >
                ${this.tagOptions
                  .slice(0, 3)
                  .map(
                    (tag) => html`
                      <sl-menu-item role="option" value=${tag}
                        >${tag}</sl-menu-item
                      >
                    `,
                  )}
                ${this.tagOptions.length ? html`<sl-divider></sl-divider>` : ""}

                <sl-menu-item role="option" value=${this.inputValue}>
                  ${msg(str`Add “${this.inputValue.toLocaleLowerCase()}”`)}
                </sl-menu-item>
              </sl-menu>
            </div>
          </sl-popup>
        </div>
      </div>
    `;
  }

  private renderTags() {
    return this.tags.map(this.renderTag);
  }

  private readonly renderTag = (content: string) => {
    const removeTag = (e: CustomEvent | KeyboardEvent) => {
      this.tags = this.tags.filter((v) => v !== content);
      void this.dispatchChange();

      const tag = e.currentTarget as SlTag;
      const focusTarget = tag.previousElementSibling as HTMLElement | null;
      (focusTarget || this.input).focus();
    };
    const onKeydown = (e: KeyboardEvent) => {
      const el = e.currentTarget as SlTag;
      switch (e.key) {
        // TODO localize, handle RTL
        case "ArrowLeft": {
          const focusTarget = el.previousElementSibling as HTMLElement | null;
          focusTarget?.focus();
          break;
        }
        case "ArrowRight": {
          let focusTarget = el.nextElementSibling as HTMLElement | null;
          if (!focusTarget) return;
          if (focusTarget === this.combobox) {
            focusTarget = (this.input as HTMLInputElement | null) || null;
          }
          focusTarget?.focus();
          break;
        }
        case "Backspace":
        case "Delete": {
          removeTag(e);
          break;
        }
        default:
          break;
      }
    };
    return html`
      <btrix-tag
        .variant=${"primary"}
        .removable=${true}
        @sl-remove=${removeTag}
        title=${content}
        tabindex="-1"
        @keydown=${onKeydown}
        @animationend=${(e: AnimationEvent) => {
          if (e.animationName === "shake") {
            (e.target as SlTag).classList.remove("shake");
          }
        }}
      >
        ${content}
      </btrix-tag>
    `;
  };

  private openDropdown() {
    this.combobox.reposition();
    this.dropdown.classList.add("animateShow");
    this.dropdown.classList.remove("hidden");
  }

  private closeDropdown() {
    this.combobox.reposition();
    this.dropdown.classList.add("animateHide");
  }

  private onSelect(e: CustomEvent<{ item: { value: string } }>) {
    void this.addTags([e.detail.item.value]);
    this.input.focus();
  }

  private onFocus(e: FocusEvent) {
    const input = e.target as HTMLInputElement;
    input.parentElement!.classList.add("input--focused");
    if (input.value) {
      this.dropdownIsOpen = true;
    }
  }

  private onBlur(e: FocusEvent) {
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget) {
      if (this.menu?.contains(relatedTarget)) {
        // Keep focus on form control if moving to menu selection
        return;
      }
      if (
        relatedTarget.tagName.includes("BUTTON") &&
        relatedTarget.getAttribute("type") === "reset"
      ) {
        // Don't add tag if resetting form
        return;
      }
    }
    const input = e.target as HTMLInputElement;
    input.parentElement!.classList.remove("input--focused");
    void this.addTags([input.value]);
  }

  // TODO consolidate with btrix-combobox
  private onKeydown(e: KeyboardEvent) {
    if (this.dropdownIsOpen && (e.key === "ArrowDown" || e.key === "Tab")) {
      e.preventDefault();
      const menuItem = this.menu?.querySelector("sl-menu-item");
      if (this.menu && menuItem) {
        // Reset roving tabindex set by shoelace
        this.menu.setCurrentItem(menuItem);
        menuItem.focus();
      }
      return;
    }
    switch (e.key) {
      case "Backspace":
      case "Delete":
      // TODO localize, handle RTL
      // falls through
      case "ArrowLeft": {
        if (this.input.selectionStart! > 0) return;
        e.preventDefault();
        const focusTarget = this.combobox
          .previousElementSibling as HTMLElement | null;
        focusTarget?.focus();
        break;
      }
      case "ArrowRight": {
        // if (isInputEl && this.input!.selectionEnd! > this.input!.value.length)
        //   return;
        break;
      }
      case ",":
      case "Enter": {
        e.preventDefault();
        const input = e.target as HTMLInputElement;
        const value = input.value.trim();
        if (value) {
          void this.addTags([value]);
        }
        break;
      }
      default:
        break;
    }
  }

  private readonly onInput = debounce(200)(() => {
    const input = this.input;
    this.inputValue = input.value;
    if (input.value.length) {
      this.dropdownIsOpen = true;
    } else {
      this.dropdownIsOpen = false;
    }
    this.dispatchEvent(
      new CustomEvent<TagInputEventDetail>("tag-input", {
        detail: { value: input.value },
      }),
    );
  });

  // TODO consolidate with btrix-combobox
  private onKeyup(e: KeyboardEvent) {
    const input = e.target as HTMLInputElement;
    if (e.key === "Escape") {
      input.parentElement!.classList.remove("input--focused");
      this.dropdownIsOpen = false;
      this.inputValue = "";
      input.value = "";
    }
  }

  private onPaste(e: ClipboardEvent) {
    const input = e.target as HTMLInputElement;
    if (!input.value) {
      e.preventDefault();
      const text = e.clipboardData
        ?.getData("text")
        // Remove zero-width characters
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim();
      if (text) {
        void this.addTags(text.split(","));
      }
    }
  }

  private onInputWrapperClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      this.input.focus();
    }
  }

  private async addTags(tags: Tags) {
    await this.updateComplete;
    const repeatTags: Tags = [];
    const uniqueTags: Tags = [...this.tags];

    tags.forEach((str) => {
      const tag = str // Remove zero-width characters
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim()
        .toLocaleLowerCase();
      if (tag) {
        if (uniqueTags.includes(tag)) {
          repeatTags.push(tag);
        } else {
          uniqueTags.push(tag);
        }
      }
    });
    this.tags = uniqueTags;
    void this.dispatchChange();
    this.dropdownIsOpen = false;
    this.input.value = "";
    if (repeatTags.length) {
      repeatTags.forEach(this.shakeTag);
    }
  }

  private readonly shakeTag = (tag: string) => {
    const tagEl = this.formControl.querySelector(`btrix-tag[title="${tag}"]`);
    tagEl?.classList.add("shake");
  };

  private async dispatchChange() {
    await this.updateComplete;
    this.dispatchEvent(
      new CustomEvent<TagsChangeEventDetail>("tags-change", {
        detail: { tags: this.tags },
      }),
    );
  }
}
