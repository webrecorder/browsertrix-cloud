import { localized, msg } from "@lit/localize";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

import seededCrawlSvg from "~assets/images/new-crawl-config_Seeded-Crawl.svg";
import urlListSvg from "~assets/images/new-crawl-config_URL-List.svg";

export type SelectJobTypeEvent = CustomEvent<"url-list" | "seed-crawl">;

/**
 * @event select-job-type SelectJobTypeEvent
 */
@localized()
@customElement("btrix-new-workflow-dialog")
export class NewWorkflowDialog extends LitElement {
  // postcss-lit-disable-next-line
  static styles = css`
    .title,
    .container {
      margin: var(--sl-spacing-large) 0;
    }

    .container {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sl-spacing-4x-large);
      justify-content: center;
    }

    .heading {
      font-size: var(--sl-font-size-large);
      font-weight: var(--sl-font-weight-semibold);
      margin-top: 0;
      margin-bottom: var(--sl-spacing-small);
      line-height: 1;
    }

    .description {
      color: var(--sl-color-neutral-500);
      margin: 0;
    }

    .jobTypeButton {
      padding: 0.25rem;
      display: block;
      width: 16.5rem;
      cursor: pointer;
      background: none;
      text-align: left;
      border: none;
      border-radius: 0.75rem;
    }

    figure {
      margin: 0;
      padding: 0;
    }

    .jobTypeButton:hover .jobTypeImg {
      transform: scale(1.05);
    }

    .jobTypeImg {
      width: 100%;
      max-height: 9rem;
      transition-property: transform;
      transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
      transition-duration: 150ms;
      margin-bottom: var(--sl-spacing-small);
    }
  `;

  @property({ type: String })
  orgId!: string;

  @property({ type: Boolean })
  open = false;

  render() {
    return html`
      <btrix-dialog
        .label=${msg("Choose New Workflow Type")}
        .open=${this.open}
        style="--width: 46rem"
      >
        <div class="container">
          <button
            tabindex="2"
            class="jobTypeButton"
            @click=${() => {
              this.dispatchEvent(
                new CustomEvent("select-job-type", {
                  detail: "url-list",
                }) as SelectJobTypeEvent,
              );
            }}
          >
            <figure>
              <img class="jobTypeImg" src=${urlListSvg} />
              <figcaption>
                <div class="heading">${msg("URL List")}</div>
                <p class="description">
                  ${msg(
                    "The crawler visits every URL specified in a list, and optionally every URL linked on those pages.",
                  )}
                </p>
              </figcaption>
            </figure>
          </button>
          <button
            tabindex="1"
            class="jobTypeButton"
            @click=${() => {
              this.dispatchEvent(
                new CustomEvent("select-job-type", {
                  detail: "seed-crawl",
                }) as SelectJobTypeEvent,
              );
            }}
          >
            <figure>
              <img class="jobTypeImg" src=${seededCrawlSvg} />
              <figcaption>
                <div class="heading">${msg("Seeded Crawl")}</div>
                <p class="description">
                  ${msg(
                    "The crawler automatically discovers and archives pages starting from a single seed URL.",
                  )}
                </p>
              </figcaption>
            </figure>
          </div>
        </button>
      </btrix-dialog>
    `;
  }
}
