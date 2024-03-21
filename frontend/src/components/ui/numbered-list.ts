/**
 * Styled numbered list
 *
 * Usage example:
 * ```ts
 * <btrix-numbered-list>
 *   <btrix-numbered-list-item>
 *     <span slot="marker">1.</span> Content
 *   </btrix-numbered-list-item>
 * </btrix-numbered-list>
 * ```
 */
import { css, html, LitElement } from "lit";
import {
  customElement,
  property,
  queryAssignedElements,
} from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";

@customElement("btrix-numbered-list-item")
export class NumberedListItem extends LitElement {
  @property({ type: Boolean })
  isFirst = false;

  @property({ type: Boolean })
  isLast = false;

  @property({ type: Boolean })
  isEven = false;

  @property({ type: Boolean })
  selected = false;

  @property({ type: Boolean })
  hoverable = false;

  // postcss-lit-disable-next-line
  static styles = css`
    :host,
    .item {
      display: contents;
    }

    .content {
      border-left: var(--sl-panel-border-width) solid
        var(--sl-panel-border-color);
      border-right: var(--sl-panel-border-width) solid
        var(--sl-panel-border-color);
      padding: var(--sl-spacing-2x-small) var(--sl-spacing-x-small);
      line-height: 1;
      min-height: var(--item-height);
      box-sizing: border-box;
    }

    .marker {
      color: var(--sl-color-neutral-400);
      line-height: 1;
      font-size: var(--sl-font-size-medium);
      font-weight: var(--sl-font-weight-normal);
      text-align: right;
      white-space: nowrap;
    }

    .item.first .content {
      border-top: var(--sl-panel-border-width) solid
        var(--sl-panel-border-color);
      border-top-left-radius: var(--sl-border-radius-medium);
      border-top-right-radius: var(--sl-border-radius-medium);
    }

    .item.last .content {
      border-bottom: var(--sl-panel-border-width) solid
        var(--sl-panel-border-color);
      border-bottom-left-radius: var(--sl-border-radius-medium);
      border-bottom-right-radius: var(--sl-border-radius-medium);
    }

    .item.even .content {
      background-color: var(--sl-color-neutral-50);
    }

    .item.hoverable {
      cursor: pointer;
    }

    .item.selected .content,
    .item.hoverable:hover .content {
      background-color: var(--sl-color-blue-500);
      color: var(--sl-color-neutral-0);
    }
  `;

  render() {
    return html`
      <div
        class=${classMap({
          item: true,
          first: this.isFirst,
          last: this.isLast,
          even: this.isEven,
          selected: this.selected,
          hoverable: this.hoverable,
        })}
      >
        <div class="marker"><slot name="marker"></slot></div>
        <div class="content"><slot></slot></div>
      </div>
    `;
  }
}

@customElement("btrix-numbered-list-header")
export class NumberedListHeader extends LitElement {
  // postcss-lit-disable-next-line
  static styles = css`
    :host,
    header {
      display: contents;
    }

    .content {
      grid-column: 2 / -1;
      padding-bottom: var(--sl-spacing-x-small);
      color: var(--sl-color-neutral-600);
      font-size: var(--sl-font-size-x-small);
      line-height: 1rem;
    }
  `;

  render() {
    return html`<header>
      <div class="content"><slot></slot></div>
    </header>`;
  }
}

@customElement("btrix-numbered-list")
export class NumberedList extends LitElement {
  // postcss-lit-disable-next-line
  static styles = css`
    :host {
      display: block;
    }

    .list {
      display: grid;
      grid-template-columns: max-content 1fr;
      grid-column-gap: var(--sl-spacing-x-small);
      align-items: center;
    }

    ol {
      display: contents;
      font-family: var(--sl-font-mono);
      list-style-type: none;
      margin: 0;
      padding: 0;
    }
  `;

  @queryAssignedElements({ selector: "btrix-numbered-list-item" })
  listItems!: NumberedListItem[];

  render() {
    return html`
      <div class="list">
        <slot name="header"></slot>
        <ol>
          <slot @slotchange=${this.handleSlotchange}></slot>
        </ol>
      </div>
    `;
  }

  private handleSlotchange() {
    this.listItems.forEach((el, i) => {
      if (!el.attributes.getNamedItem("role")) {
        el.setAttribute("role", "listitem");
      }
      el.isFirst = i === 0;
      el.isLast = i === this.listItems.length - 1;
      el.isEven = i % 2 !== 0;
    });
  }
}
