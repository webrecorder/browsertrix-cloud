import SlBadge from "@shoelace-style/shoelace/dist/components/badge/badge.component.js";
import badgeStyles from "@shoelace-style/shoelace/dist/components/badge/badge.styles.js";
import { css } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Show numeric value in a label
 *
 * Usage example:
 * ```ts
 * <btrix-badge aria-describedby="text">10</btrix-badge>
 * ```
 */
@customElement("btrix-badge")
export class Badge extends SlBadge {
  static styles = [
    badgeStyles,
    css`
      .badge {
        border-color: rgba(255, 255, 255, 0.5);
        line-height: 1rem;
        padding: 0 1ch;
      }
    `,
  ];

  @property({ type: String, reflect: true })
  role: string | null = "status";
}
