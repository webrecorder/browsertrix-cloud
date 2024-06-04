import { localized, msg } from "@lit/localize";
import { type SlSelect } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import capitalize from "lodash/fp/capitalize";

import type { CrawlerSocksProxyServer } from "@/pages/org/types";
import type { AuthState } from "@/utils/AuthService";
import LiteElement from "@/utils/LiteElement";

type SelectCrawlerSocksProxyServerChangeDetail = {
  value: string | undefined;
};

export type SelectCrawlerSocksProxyServerChangeEvent =
  CustomEvent<SelectCrawlerSocksProxyServerChangeDetail>;

type SelectCrawlerSocksProxyServerUpdateDetail = {
  show: boolean;
};

export type SelectCrawlerSocksProxyServerUpdateEvent =
  CustomEvent<SelectCrawlerSocksProxyServerUpdateDetail>;

type CrawlerSocksProxyServersAPIResponse = {
  servers: CrawlerSocksProxyServer[];
};

/**
 * Crawler socks proxy server select dropdown
 *
 * Usage example:
 * ```ts
 * <btrix-select-crawler-socks-proxy-server
 *   authState=${authState}
 *   orgId=${orgId}
 *   on-change=${({value}) => selectedCrawlerSocksProxyServer = value}
 * ></btrix-select-crawler-socks-proxy-server>
 * ```
 *
 * @event on-change
 */
@customElement("btrix-select-crawler-socks-proxy-server")
@localized()
export class SelectCrawlerSocksProxyServer extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  crawlerSocksProxyServer?: string | null;

  @state()
  private selectedSocksProxyServer?: CrawlerSocksProxyServer;

  @state()
  private crawlerSocksProxyServers?: CrawlerSocksProxyServer[];

  protected firstUpdated() {
    void this.fetchCrawlerSocksProxyServers();
  }
  // credit: https://dev.to/jorik/country-code-to-flag-emoji-a21
  private countryCodeToFlagEmoji(countryCode: String): String {
    return countryCode
      .toUpperCase()
      .split("")
      .map((char) => String.fromCodePoint(char.charCodeAt(0) + 127397))
      .join("");
  }

  render() {
    /*if (this.crawlerSocksProxyServers && this.crawlerSocksProxyServers.length < 2) {
      return html``;
    }*/

    return html`
      <sl-select
        name="crawlerSocksProxyServer-select"
        label=${msg("Crawler Proxy Server")}
        value=${this.selectedSocksProxyServer?.id || ""}
        placeholder=${msg("No Proxy")}
        hoist
        clearable
        @sl-change=${this.onChange}
        @sl-focus=${() => {
          // Refetch to keep list up to date
          void this.fetchCrawlerSocksProxyServers();
        }}
        @sl-hide=${this.stopProp}
        @sl-after-hide=${this.stopProp}
      >
        ${this.crawlerSocksProxyServers?.map(
          (server) =>
            html` <sl-option value=${server.id}>
              ${this.countryCodeToFlagEmoji(server.country_code)}
              ${capitalize(server.id)}
            </sl-option>`,
        )}
        ${this.selectedSocksProxyServer
          ? html`
              <div slot="help-text">
                ${msg("Connection:")}
                <span class="font-monospace"
                  >${this.selectedSocksProxyServer.username}@${this
                    .selectedSocksProxyServer.hostname}</span
                >
              </div>
            `
          : ``}
      </sl-select>
    `;
  }

  private onChange(e: Event) {
    this.stopProp(e);

    this.selectedSocksProxyServer = this.crawlerSocksProxyServers?.find(
      ({ id }) => id === (e.target as SlSelect).value,
    );

    this.dispatchEvent(
      new CustomEvent<SelectCrawlerSocksProxyServerChangeDetail>("on-change", {
        detail: {
          value: this.selectedSocksProxyServer?.id,
        },
      }),
    );
  }

  /**
   * Fetch crawler socks proxy servers and update internal state
   */
  private async fetchCrawlerSocksProxyServers(): Promise<void> {
    try {
      const servers = await this.getCrawlerSocksProxyServers();
      this.crawlerSocksProxyServers = servers;

      if (this.crawlerSocksProxyServer && !this.selectedSocksProxyServer?.id) {
        this.selectedSocksProxyServer = this.crawlerSocksProxyServers.find(
          ({ id }) => id === this.crawlerSocksProxyServer,
        );
      }

      if (!this.selectedSocksProxyServer) {
        this.crawlerSocksProxyServer = null;
        this.dispatchEvent(
          new CustomEvent("on-change", {
            detail: {
              value: null,
            },
          }),
        );
        this.selectedSocksProxyServer = this.crawlerSocksProxyServers.find(
          ({ id }) => id === this.crawlerSocksProxyServer,
        );
      }

      this.dispatchEvent(
        new CustomEvent<SelectCrawlerSocksProxyServerUpdateDetail>(
          "on-update",
          {
            detail: {
              show: this.crawlerSocksProxyServers.length > 1,
            },
          },
        ),
      );
    } catch (e) {
      this.notify({
        message: msg(
          "Sorry, couldn't retrieve socks proxy servers at this time.",
        ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCrawlerSocksProxyServers(): Promise<
    CrawlerSocksProxyServer[]
  > {
    const data: CrawlerSocksProxyServersAPIResponse =
      await this.apiFetch<CrawlerSocksProxyServersAPIResponse>(
        `/orgs/${this.orgId}/crawlconfigs/crawler-socks-proxy-servers`,
        this.authState!,
      );

    return data.servers;
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
