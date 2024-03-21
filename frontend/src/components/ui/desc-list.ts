import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";

/**
 * Styled <dl>, <dt> and <dd> for displaying data
 * as a list of key-value pair.
 *
 * Usage example:
 * ```ts
 * <btrix-desc-list>
 *   <btrix-desc-list-item label="Color">
 *     Red
 *   </btrix-desc-list-item>
 *   <btrix-desc-list-item label="Size">
 *     Large
 *   </btrix-desc-list-item>
 * </btrix-desc-list>
 * ```
 */
@customElement("btrix-desc-list-item")
export class DescListItem extends LitElement {
  // postcss-lit-disable-next-line
  static styles = css`
    :host {
      display: contents;
    }

    dt {
      color: var(--sl-color-neutral-500);
      font-size: var(--sl-font-size-x-small);
      line-height: 1rem;
      margin: var(--sl-spacing-3x-small) 0;
    }

    dd {
      margin: 0;
      padding: 0 0 var(--sl-spacing-2x-small);
      color: var(--sl-color-neutral-700);
      font-size: var(--sl-font-size-medium);
      font-family: var(--font-monostyle-family);
      font-variation-settings: var(--font-monostyle-variation);
      line-height: 1rem;
    }

    .item {
      display: flex;
      justify-content: var(--justify-item, initial);
      border-right: var(--border-right, 0px);
    }

    .content {
      width: var(--width-full, initial);
    }
  `;

  @property({ type: String })
  label = "";

  render() {
    return html`<div class="item">
      <div class="content">
        <dt>${this.label}</dt>
        <dd><slot></slot></dd>
      </div>
    </div>`;
  }
}

@customElement("btrix-desc-list")
export class DescList extends LitElement {
  // postcss-lit-disable-next-line
  static styles = css`
    dl {
      display: grid;
      margin: 0;
    }

    .vertical {
      grid-template-columns: 100%;
      gap: 1rem;
      --width-full: 100%;
    }

    .horizontal {
      --justify-item: center;
      --border-right: 1px solid var(--sl-panel-border-color);
      grid-auto-flow: column;
    }

    /* Although this only applies to .horizontal, apply to any last child
    since we can't do complex selectors with ::slotted */
    ::slotted(*:last-of-type) {
      --border-right: 0px;
    }
  `;

  @property({ type: Boolean })
  horizontal = false;

  render() {
    return html`<dl
      class=${classMap({
        vertical: !this.horizontal,
        horizontal: this.horizontal,
      })}
    >
      <slot></slot>
    </dl>`;
  }
}
