import { css, html, LitElement } from "lit";
import {
  customElement,
  property,
  queryAssignedElements,
} from "lit/decorators.js";

import { truncate } from "@/utils/css";

type FileRemoveDetail = {
  file: File;
};
export type FileRemoveEvent = CustomEvent<FileRemoveDetail>;

/**
 * @event on-remove FileRemoveEvent
 */
@customElement("btrix-file-list-item")
export class FileListItem extends LitElement {
  static styles = [
    truncate,
    css`
      .item {
        overflow: hidden;
        border-top: var(--item-border-top, 0);
        border-left: var(--item-border-left, 0);
        border-right: var(--item-border-right, 0);
        border-bottom: var(--item-border-bottom, 0);
        border-radius: var(--item-border-radius, 0);
        box-shadow: var(--item-box-shadow, none);
        color: var(--sl-color-neutral-700);
      }

      .file {
        display: flex;
      }

      .details {
        flex: 1 1 0%;
        min-width: 0;
        padding: var(--sl-spacing-x-small);
      }

      .name {
        word-break: break-all;
      }

      .size {
        font-size: var(--sl-font-size-x-small);
        font-family: var(--font-monostyle-family);
        font-variation-settings: var(--font-monostyle-variation);
        color: var(--sl-color-neutral-500);
      }

      .actions {
        padding: var(--sl-spacing-3x-small);
      }

      .progress {
        padding: 0 var(--sl-spacing-x-small) var(--sl-spacing-x-small);
      }
    `,
  ];

  @property({ attribute: false })
  file?: File | null = null;

  @property({ type: Number })
  progressValue?: number;

  @property({ type: Boolean })
  progressIndeterminate?: boolean;

  render() {
    if (!this.file) return;
    return html`<div class="item">
      <div class="file">
        <div class="details">
          <div class="name">${this.file.name}</div>
          <div class="size">
            ${this.progressValue !== undefined
              ? html`<sl-format-bytes
                    value=${(this.progressValue / 100) * this.file.size}
                  ></sl-format-bytes>
                  / `
              : ""}<sl-format-bytes value=${this.file.size}></sl-format-bytes>
          </div>
        </div>
        <div class="actions">
          ${this.progressValue || this.progressIndeterminate
            ? ""
            : html`<sl-icon-button
                name="trash3"
                @click=${this.onRemove}
              ></sl-icon-button>`}
        </div>
      </div>
      ${this.progressValue || this.progressIndeterminate
        ? html`<div class="progress">
            <sl-progress-bar
              value=${this.progressValue || 0}
              ?indeterminate=${this.progressIndeterminate}
              style="--height: 0.25rem;"
            ></sl-progress-bar>
          </div>`
        : ""}
    </div>`;
  }

  private readonly onRemove = async () => {
    if (!this.file) return;
    await this.updateComplete;
    this.dispatchEvent(
      new CustomEvent<FileRemoveDetail>("on-remove", {
        detail: {
          file: this.file,
        },
      }),
    );
  };
}

@customElement("btrix-file-list")
export class FileList extends LitElement {
  static styles = [
    css`
      ::slotted(btrix-file-list-item) {
        --border: 1px solid var(--sl-panel-border-color);
        --item-border-top: var(--border);
        --item-border-left: var(--border);
        --item-border-right: var(--border);
        --item-border-bottom: var(--border);
        --item-box-shadow: var(--sl-shadow-x-small);
        --item-border-radius: var(--sl-border-radius-medium);
        display: block;
      }

      ::slotted(btrix-file-list-item:not(:last-of-type)) {
        margin-bottom: var(--sl-spacing-x-small);
      }
    `,
  ];

  @queryAssignedElements({ selector: "btrix-file-list-item" })
  listItems!: HTMLElement[];

  render() {
    return html`<div class="list" role="list">
      <slot @slotchange=${this.handleSlotchange}></slot>
    </div>`;
  }

  private handleSlotchange() {
    this.listItems.map((el) => {
      if (!el.attributes.getNamedItem("role")) {
        el.setAttribute("role", "listitem");
      }
    });
  }
}
