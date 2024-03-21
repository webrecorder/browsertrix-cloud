// cSpell:words wysimark

import { createWysimark } from "@wysimark/standalone";
import { html, LitElement, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { guard } from "lit/directives/guard.js";

import { getHelpText } from "@/utils/form";

type MarkdownChangeDetail = {
  value: string;
};
export type MarkdownChangeEvent = CustomEvent<MarkdownChangeDetail>;

/**
 * Edit and preview text in markdown
 *
 * @event on-change MarkdownChangeEvent
 */
@customElement("btrix-markdown-editor")
export class MarkdownEditor extends LitElement {
  @property({ type: String })
  initialValue = "";

  @property({ type: String })
  name = "markdown";

  @property({ type: Number })
  maxlength?: number;

  @state()
  value = "";

  createRenderRoot() {
    // Disable shadow DOM for styles to work
    return this;
  }

  protected updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("initialValue") && this.initialValue) {
      this.value = this.initialValue;
      this.initEditor();
    }
  }

  protected firstUpdated(): void {
    if (!this.initialValue) {
      this.initEditor();
    }
  }

  render() {
    const isInvalid = this.maxlength && this.value.length > this.maxlength;
    return html`
      <fieldset
        class="markdown-editor-wrapper with-max-help-text"
        ?data-invalid=${isInvalid}
        ?data-user-invalid=${isInvalid}
      >
        <input name=${this.name} type="hidden" value="${this.value}" />
        ${guard(
          [this.initialValue],
          () => html`
            <style>
              .markdown-editor-wrapper[data-user-invalid] {
                --select-editor-color: var(--sl-color-danger-400);
              }
              .markdown-editor-wrapper[data-user-invalid]
                .markdown-editor
                > div {
                border: 1px solid var(--sl-color-danger-400);
              }
              .markdown-editor {
                --blue-100: var(--sl-color-blue-100);
              }
              /* NOTE wysimark doesn't support customization or
              a way of selecting elements as of 2.2.15
              https://github.com/portive/wysimark/issues/10 */
              /* Editor container: */
              .markdown-editor > div {
                overflow: hidden;
                border-radius: var(--sl-input-border-radius-medium);
                font-family: var(--sl-font-sans);
                font-size: 1rem;
              }
              /* Hide unsupported button features */
              /* Table, images: */
              .markdown-editor > div > div > div > div:nth-child(9),
              .markdown-editor > div > div > div > div:nth-child(10) {
                display: none !important;
              }
              .markdown-editor div[role="textbox"] {
                font-size: var(--sl-font-size-medium);
                padding: var(--sl-spacing-small) var(--sl-spacing-medium);
              }
            </style>
            <div class="markdown-editor font-sm"></div>
          `,
        )}
        ${this.maxlength
          ? html`<div class="form-help-text">
              ${getHelpText(this.maxlength, this.value.length)}
            </div>`
          : ""}
      </fieldset>
    `;
  }

  private initEditor() {
    const editor = createWysimark(this.querySelector(".markdown-editor")!, {
      initialMarkdown: this.initialValue,
      minHeight: "12rem",
      onChange: async () => {
        const value = editor.getMarkdown();
        const input = this.querySelector<HTMLTextAreaElement>(
          `input[name=${this.name}]`,
        );
        input!.value = value;
        this.value = value;
        await this.updateComplete;
        this.dispatchEvent(
          new CustomEvent<MarkdownChangeDetail>("on-change", {
            detail: {
              value: value,
            },
          }),
        );
      },
    });
  }
}
