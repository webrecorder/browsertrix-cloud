import { localized, msg } from "@lit/localize";
import { css, html, LitElement, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import startCase from "lodash/fp/startCase";

import type { CrawlState } from "@/types/crawler";
import { animatePulse } from "@/utils/css";

@localized()
@customElement("btrix-crawl-status")
export class CrawlStatus extends LitElement {
  @property({ type: String })
  state?: CrawlState | AnyString;

  @property({ type: Boolean })
  hideLabel = false;

  @property({ type: Boolean })
  isUpload = false;

  @property({ type: Boolean })
  stopping = false;

  static styles = [
    animatePulse,
    css`
      :host {
        display: inline-block;
        color: var(--sl-color-neutral-700);
      }

      .wrapper,
      .icon-only {
        display: flex;
        align-items: center;
      }

      sl-icon {
        font-size: 1rem;
      }

      .with-label sl-icon,
      :host:not(:last-child) .icon-only {
        margin-right: var(--sl-spacing-x-small);
      }

      .label {
        height: 1rem;
        line-height: 1rem;
      }

      sl-skeleton {
        width: 4em;
      }
    `,
  ];

  // TODO look into customizing sl-select multi-select
  // instead of separate utility function?
  static getContent(
    state?: CrawlState | AnyString,
    isUpload?: boolean,
  ): {
    icon: TemplateResult;
    label: string;
  } {
    let icon = html`<sl-icon
      name="circle"
      class="neutral"
      slot="prefix"
      style="color: var(--sl-color-neutral-400)"
    ></sl-icon>`;
    let label = "";

    switch (state) {
      case "starting":
        icon = html`<sl-icon
          name="dot"
          library="app"
          class="animatePulse"
          slot="prefix"
          style="color: var(--sl-color-purple-600)"
        ></sl-icon>`;
        label = msg("Starting");
        break;

      case "waiting_capacity":
      case "waiting_org_limit":
        icon = html`<sl-icon
          name="hourglass-split"
          class="animatePulse"
          slot="prefix"
          style="color: var(--sl-color-purple-600)"
        ></sl-icon>`;
        label =
          state === "waiting_capacity"
            ? msg("Waiting (At Capacity)")
            : msg("Waiting (Crawl Limit)");
        break;

      case "running":
        icon = html`<sl-icon
          name="dot"
          library="app"
          class="animatePulse"
          slot="prefix"
          style="color: var(--success)"
        ></sl-icon>`;
        label = msg("Running");
        break;

      case "stopping":
        icon = html`<sl-icon
          name="dot"
          library="app"
          class="animatePulse"
          slot="prefix"
          style="color: var(--sl-color-purple-600)"
        ></sl-icon>`;
        label = msg("Stopping");
        break;

      case "pending-wait":
        icon = html`<sl-icon
          name="dot"
          library="app"
          class="animatePulse"
          slot="prefix"
          style="color: var(--sl-color-purple-600)"
        ></sl-icon>`;
        label = msg("Finishing Crawl");
        break;

      case "generate-wacz":
        icon = html`<sl-icon
          name="dot"
          library="app"
          class="animatePulse"
          slot="prefix"
          style="color: var(--sl-color-purple-600)"
        ></sl-icon>`;
        label = msg("Generating WACZ");
        break;

      case "uploading-wacz":
        icon = html`<sl-icon
          name="dot"
          library="app"
          class="animatePulse"
          slot="prefix"
          style="color: var(--sl-color-purple-600)"
        ></sl-icon>`;
        label = msg("Uploading WACZ");
        break;

      case "complete":
        icon = html`<sl-icon
          name=${isUpload ? "upload" : "check-circle-fill"}
          slot="prefix"
          style="color: var(--success)"
        ></sl-icon>`;
        label = isUpload ? msg("Uploaded") : msg("Complete");
        break;

      case "failed":
        icon = html`<sl-icon
          name=${isUpload ? "upload" : "exclamation-triangle-fill"}
          slot="prefix"
          style="color: var(--danger)"
        ></sl-icon>`;
        label = msg("Failed");
        break;

      case "skipped_quota_reached":
        icon = html`<sl-icon
          name="exclamation-triangle-fill"
          slot="prefix"
          style="color: var(--danger)"
        ></sl-icon>`;
        label = msg("Skipped: Storage Quota Reached");
        break;

      case "stopped_by_user":
        icon = html`<sl-icon
          name="dash-square-fill"
          slot="prefix"
          style="color: var(--warning)"
        ></sl-icon>`;
        label = msg("Stopped");
        break;

      case "stopped_quota_reached":
        icon = html`<sl-icon
          name="exclamation-square-fill"
          slot="prefix"
          style="color: var(--warning)"
        ></sl-icon>`;
        label = msg("Stopped: Time Quota Reached");
        break;

      case "canceled":
        icon = html`<sl-icon
          name="x-octagon-fill"
          slot="prefix"
          style="color: var(--sl-color-orange-600)"
        ></sl-icon>`;
        label = msg("Canceled");
        break;

      default:
        if (typeof state === "string" && state.length) {
          // Handle unknown status
          label = startCase(state);
        }
        break;
    }
    return { icon, label };
  }

  render() {
    const state =
      this.stopping && this.state === "running" ? "stopping" : this.state;
    const { icon, label } = CrawlStatus.getContent(state, this.isUpload);
    if (this.hideLabel) {
      return html`<div class="icon-only">
        <sl-tooltip content=${label}
          ><div class="wrapper">${icon}</div></sl-tooltip
        >
      </div>`;
    }
    if (label) {
      return html`<div class="wrapper with-label">
        ${icon}<span class="label">${label}</span>
      </div>`;
    }
    return html`<div class="wrapper with-label">
      ${icon}<sl-skeleton></sl-skeleton>
    </div>`;
  }
}
