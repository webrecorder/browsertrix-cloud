import { localized, msg } from "@lit/localize";
import { type SlSelect } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import capitalize from "lodash/fp/capitalize";

import type { CrawlerChannel } from "@/pages/org/types";
import type { AuthState } from "@/utils/AuthService";
import LiteElement from "@/utils/LiteElement";

type SelectCrawlerChangeDetail = {
  value: string | undefined;
};

export type SelectCrawlerChangeEvent = CustomEvent<SelectCrawlerChangeDetail>;

type SelectCrawlerUpdateDetail = {
  show: boolean;
};

export type SelectCrawlerUpdateEvent = CustomEvent<SelectCrawlerUpdateDetail>;

type CrawlerChannelsAPIResponse = {
  channels: CrawlerChannel[];
};

/**
 * Crawler channel select dropdown
 *
 * Usage example:
 * ```ts
 * <btrix-select-crawler
 *   authState=${authState}
 *   orgId=${orgId}
 *   on-change=${({value}) => selectedCrawler = value}
 * ></btrix-select-crawler>
 * ```
 *
 * @event on-change
 */
@customElement("btrix-select-crawler")
@localized()
export class SelectCrawler extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  crawlerChannel?: string;

  @state()
  private selectedCrawler?: CrawlerChannel;

  @state()
  private crawlerChannels?: CrawlerChannel[];

  protected firstUpdated() {
    void this.fetchCrawlerChannels();
  }

  render() {
    if (this.crawlerChannels && this.crawlerChannels.length < 2) {
      return html``;
    }

    return html`
      <sl-select
        name="crawlerChannel-select"
        label=${msg("Crawler Release Channel")}
        value=${this.selectedCrawler?.id || ""}
        placeholder=${msg("Latest")}
        hoist
        @sl-change=${this.onChange}
        @sl-focus=${() => {
          // Refetch to keep list up to date
          void this.fetchCrawlerChannels();
        }}
        @sl-hide=${this.stopProp}
        @sl-after-hide=${this.stopProp}
      >
        ${this.crawlerChannels?.map(
          (crawler) =>
            html` <sl-option value=${crawler.id}>
              ${capitalize(crawler.id)}
            </sl-option>`,
        )}
        ${this.selectedCrawler
          ? html`
              <div slot="help-text">
                ${msg("Version:")}
                <span class="font-monospace"
                  >${this.selectedCrawler.image}</span
                >
              </div>
            `
          : ``}
      </sl-select>
    `;
  }

  private onChange(e: Event) {
    this.stopProp(e);

    this.selectedCrawler = this.crawlerChannels?.find(
      ({ id }) => id === (e.target as SlSelect).value,
    );

    this.dispatchEvent(
      new CustomEvent<SelectCrawlerChangeDetail>("on-change", {
        detail: {
          value: this.selectedCrawler?.id,
        },
      }),
    );
  }

  /**
   * Fetch crawler channels and update internal state
   */
  private async fetchCrawlerChannels(): Promise<void> {
    try {
      const channels = await this.getCrawlerChannels();
      this.crawlerChannels = channels;

      if (this.crawlerChannel && !this.selectedCrawler) {
        this.selectedCrawler = this.crawlerChannels.find(
          ({ id }) => id === this.crawlerChannel,
        );
      }

      if (!this.selectedCrawler) {
        this.crawlerChannel = "default";
        this.dispatchEvent(
          new CustomEvent("on-change", {
            detail: {
              value: "default",
            },
          }),
        );
        this.selectedCrawler = this.crawlerChannels.find(
          ({ id }) => id === this.crawlerChannel,
        );
      }

      this.dispatchEvent(
        new CustomEvent<SelectCrawlerUpdateDetail>("on-update", {
          detail: {
            show: this.crawlerChannels.length > 1,
          },
        }),
      );
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawler channels at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCrawlerChannels(): Promise<CrawlerChannel[]> {
    const data: CrawlerChannelsAPIResponse =
      await this.apiFetch<CrawlerChannelsAPIResponse>(
        `/orgs/${this.orgId}/crawlconfigs/crawler-channels`,
        this.authState!,
      );

    return data.channels;
  }

  /**
   * Stop propgation of sl-select events.
   * Prevents bug where sl-dialog closes when dropdown closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: Event) {
    e.stopPropagation();
  }
}
