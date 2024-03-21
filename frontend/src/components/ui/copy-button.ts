import { localized, msg } from "@lit/localize";
import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

/**
 * Copy text to clipboard on click
 *
 * Usage example:
 * ```ts
 * <btrix-copy-button .value=${value}></btrix-copy-button>
 * ```
 * Or:
 * ```ts
 * <btrix-copy-button .getValue=${() => value}></btrix-copy-button>
 * ```
 *
 * @event on-copied
 */
@localized()
@customElement("btrix-copy-button")
export class CopyButton extends LitElement {
  @property({ type: String })
  value?: string;

  @property({ type: String })
  name?: string;

  @property({ type: String })
  content?: string;

  @property({ attribute: false })
  getValue?: () => string | undefined;

  @property({ type: Boolean })
  hoist = false;

  @state()
  private isCopied = false;

  timeoutId?: number;

  static copyToClipboard(value: string) {
    void navigator.clipboard.writeText(value);
  }

  disconnectedCallback() {
    window.clearTimeout(this.timeoutId);
    super.disconnectedCallback();
  }

  render() {
    return html`
      <sl-tooltip
        content=${this.isCopied
          ? msg("Copied to clipboard!")
          : this.content
            ? this.content
            : msg("Copy")}
        ?hoist=${this.hoist}
        @sl-hide=${this.stopProp}
        @sl-after-hide=${this.stopProp}
      >
        <sl-icon-button
          name=${this.isCopied ? "check-lg" : this.name ? this.name : "copy"}
          label=${msg("Copy to clipboard")}
          @click=${this.onClick}
          ?disabled=${!this.value && !this.getValue}
        ></sl-icon-button>
      </sl-tooltip>
    `;
  }

  private onClick() {
    const value = (this.getValue ? this.getValue() : this.value) || "";
    CopyButton.copyToClipboard(value);

    this.isCopied = true;

    this.dispatchEvent(new CustomEvent("on-copied", { detail: value }));

    this.timeoutId = window.setTimeout(() => {
      this.isCopied = false;
      const button = this.shadowRoot?.querySelector("sl-icon-button");
      button?.blur(); // Remove focus from the button to set it back to its default state
    }, 3000);
  }

  /**
   * Stop propgation of sl-tooltip events.
   * Prevents bug where sl-dialog closes when tooltip closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: Event) {
    e.stopPropagation();
  }
}
