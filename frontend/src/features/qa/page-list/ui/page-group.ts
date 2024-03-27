import { localized } from "@lit/localize";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import { createRef, ref, type Ref } from "lit/directives/ref.js";

import { animateTo, shimKeyframesHeightAuto } from "./animate";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

@localized()
@customElement("btrix-qa-page-group")
export class QaPageGroup extends TailwindElement {
  @property({ type: Boolean, reflect: true })
  expanded = false;

  @property({ type: Boolean })
  isRemainderGroup = false;

  contentContainer: Ref<HTMLElement> = createRef();

  handleClick = () => {
    if (!this.isRemainderGroup) this.expanded = !this.expanded;
  };

  animateExpand = async () => {
    if (this.contentContainer.value == null) return;
    await animateTo(
      this.contentContainer.value,
      shimKeyframesHeightAuto(
        [
          {
            height: "0",
            opacity: "0",
            overflow: "hidden",
            transform: `translateY(-2px)`,
          },
          { height: "auto", opacity: "1", overflow: "hidden" },
        ],
        this.contentContainer.value.scrollHeight,
      ),
      { duration: 250, easing: "cubic-bezier(0.4, 0.0, 0.2, 1)" },
    );
  };

  animateCollapse = async () => {
    if (this.contentContainer.value == null) return;
    await animateTo(
      this.contentContainer.value,
      shimKeyframesHeightAuto(
        [
          {
            height: "auto",
            opacity: "1",
            overflow: "hidden",
          },
          {
            height: "0",
            opacity: "0",
            overflow: "hidden",
            transform: `translateY(-2px)`,
          },
        ],
        this.contentContainer.value.scrollHeight,
      ),
      { duration: 200, easing: "cubic-bezier(0.4, 0.0, 0.2, 1)" },
    );
  };

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("expanded")) {
      if (this.expanded) {
        void this.animateExpand();
      } else {
        void this.animateCollapse();
      }
    }
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.contentContainer.value?.classList.add(
      !this.isRemainderGroup && this.expanded ? tw`h-auto` : tw`h-0`,
    );
  }

  render() {
    return html`
      <div class="text-sm text-gray-600">
        <div
          class="sticky top-0 z-30 flex cursor-pointer select-none items-center gap-2 border-b bg-gradient-to-b from-white to-white/85 py-1 backdrop-blur-sm"
          @click=${this.handleClick}
          tabindex="0"
        >
          ${!this.isRemainderGroup
            ? html`
                <svg
                  class="${clsx(
                    !this.expanded && "-rotate-90",
                    "w-4 h-4 transition-transform ease-[cubic-bezier(.4,0,.2,1)]",
                  )}"
                  viewBox="0 0 16 16"
                >
                  <path
                    d="M11.0148 5H4.98521C4.1639 5 3.69279 5.93526 4.18165 6.59523L7.19644 10.6652C7.59622 11.2049 8.40378 11.2049 8.80356 10.6652L11.8183 6.59523C12.3072 5.93526 11.8361 5 11.0148 5Z"
                    fill="currentColor"
                  />
                </svg>
              `
            : null}
          <slot name="header"></slot>
        </div>
        <div
          class="${this.expanded
            ? "h-auto"
            : "h-0"} overflow-hidden [contain:content] [content-visibility:auto]"
          ${ref(this.contentContainer)}
        >
          <slot></slot>
        </div>
      </div>
    `;
  }
}
