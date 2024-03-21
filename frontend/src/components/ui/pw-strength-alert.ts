import { localized, msg } from "@lit/localize";
import type { Score, ZxcvbnResult } from "@zxcvbn-ts/core";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

/**
 * Show results of password strength estimate
 *
 * Usage example:
 * ```ts
 * <btrix-pw-strength-alert .result=${this.zxcvbnResult}></btrix-pw-strength-alert>
 * ```
 */
@customElement("btrix-pw-strength-alert")
@localized()
export class PasswordStrengthAlert extends LitElement {
  @property({ attribute: false })
  result?: ZxcvbnResult;

  /** Minimum acceptable score */
  @property({ type: Number })
  min: Score = 1;

  /** Optimal score */
  @property({ type: Number })
  optimal: Score = 4;

  // postcss-lit-disable-next-line
  static styles = css`
    sl-alert::part(message) {
      /* Decrease padding size: */
      --sl-spacing-large: var(--sl-spacing-small);
    }

    sl-alert[variant="danger"] .icon {
      color: var(--sl-color-danger-600);
    }

    sl-alert[variant="warning"] .icon {
      color: var(--sl-color-warning-600);
    }

    sl-alert[variant="primary"] .icon {
      color: var(--sl-color-primary-600);
    }

    sl-alert[variant="success"] .icon {
      color: var(--sl-color-success-600);
    }

    p,
    ul {
      margin: 0;
      padding: 0;
    }

    ul {
      list-style-position: inside;
    }

    .score {
      display: flex;
      gap: var(--sl-spacing-x-small);
      align-items: center;
    }

    .icon {
      font-size: var(--sl-font-size-large);
    }

    .label {
      color: var(--sl-color-neutral-900);
      font-weight: var(--sl-font-weight-semibold);
    }

    .feedback {
      color: var(--sl-color-neutral-700);
      margin-left: var(--sl-spacing-x-large);
    }

    .text {
      margin-top: var(--sl-spacing-small);
    }
  `;

  render() {
    if (!this.result) return;

    const { score, feedback } = this.result;
    let scoreProps: {
      icon: string;
      label: string;
      variant: "primary" | "neutral" | "danger" | "success" | "warning";
    } = {
      icon: "exclamation-triangle",
      label: msg("Very weak password"),
      variant: "danger",
    };
    switch (score) {
      case 2:
        scoreProps = {
          icon: "exclamation-circle",
          label: msg("Weak password"),
          variant: "warning",
        };
        break;
      case 3:
        scoreProps = {
          icon: "shield-check",
          label: msg("Acceptably strong password"),
          variant: "primary",
        };
        break;
      case 4:
        scoreProps = {
          icon: "shield-fill-check",
          label: msg("Very strong password"),
          variant: "success",
        };
        break;
      default:
        break;
    }
    if (score < this.min) {
      scoreProps.label = msg("Please choose a stronger password");
    }
    return html`
      <sl-alert variant=${scoreProps.variant} open>
        <div class="score">
          <sl-icon class="icon" name=${scoreProps.icon}></sl-icon>
          <p class="label">${scoreProps.label}</p>
        </div>

        <div class="feedback">
          ${when(
            feedback.warning,
            () => html` <p class="text">${feedback.warning}</p> `,
          )}
          ${when(feedback.suggestions.length, () =>
            feedback.suggestions.length === 1
              ? html`<p class="text">
                  ${msg("Suggestion:")} ${feedback.suggestions[0]}
                </p>`
              : html`<p class="text">${msg("Suggestions:")}</p>
                  <ul>
                    ${feedback.suggestions.map(
                      (text) => html`<li>${text}</li>`,
                    )}
                  </ul>`,
          )}
          ${when(
            score >= this.min && score < this.optimal,
            () => html`
              <p class="text">
                ${msg(
                  "Tip: To generate very strong passwords, consider using a password manager.",
                )}
              </p>
            `,
          )}
        </div>
      </sl-alert>
    `;
  }
}
