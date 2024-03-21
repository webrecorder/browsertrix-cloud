import { localized } from "@lit/localize";
import { LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import humanizeDuration from "pretty-ms";

export type HumanizeOptions = {
  compact?: boolean;
  verbose?: boolean;
  unitCount?: number;
};

/**
 * Show time passed from date in human-friendly format
 *
 * Usage example:
 * ```ts
 * <btrix-relative-duration value=${value}></btrix-relative-duration>
 * ```
 */
@localized()
@customElement("btrix-relative-duration")
export class RelativeDuration extends LitElement {
  @property({ type: String })
  value?: string; // `new Date` compatible date format

  @property({ type: Number })
  tickSeconds?: number; // Enables ticks every specified seconds

  @property({ type: Number })
  endTime?: number = Date.now();

  @property({ type: Boolean })
  compact? = false;

  @property({ type: Boolean })
  verbose? = false;

  @property({ type: Number })
  unitCount?: number;

  @state()
  private timerId?: number;

  static humanize(duration: number, options: HumanizeOptions = {}) {
    return humanizeDuration(duration, {
      secondsDecimalDigits: 0,
      ...options,
    });
  }

  connectedCallback(): void {
    super.connectedCallback();
  }

  disconnectedCallback(): void {
    window.clearTimeout(this.timerId);
    super.disconnectedCallback();
  }

  protected updated(changedProperties: Map<string | number | symbol, unknown>) {
    if (changedProperties.has("tickSeconds")) {
      window.clearTimeout(this.timerId);
    }

    if (changedProperties.has("endTime") && this.tickSeconds) {
      this.tick(this.tickSeconds * 1000);
    }
  }

  private tick(timeoutMs: number) {
    window.clearTimeout(this.timerId);

    this.timerId = window.setTimeout(() => {
      this.endTime = Date.now();
    }, timeoutMs);
  }

  render() {
    if (!this.value) return "";

    return RelativeDuration.humanize(
      (this.endTime || Date.now()) - new Date(this.value).valueOf(),
      {
        compact: this.compact,
        verbose: this.verbose,
        unitCount: this.unitCount,
      },
    );
  }
}
