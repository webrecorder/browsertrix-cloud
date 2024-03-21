import { localized, msg } from "@lit/localize";
import { nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import type { Profile } from "./types";

import type { SelectNewDialogEvent } from ".";

import type { APIPaginatedList } from "@/types/api";
import type { Browser } from "@/types/browser";
import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";

/**
 * Usage:
 * ```ts
 * <btrix-browser-profiles-list
 *  authState=${authState}
 *  orgId=${orgId}
 * ></btrix-browser-profiles-list>
 * ```
 */
@localized()
@customElement("btrix-browser-profiles-list")
export class BrowserProfilesList extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @state()
  browserProfiles?: Profile[];

  firstUpdated() {
    void this.fetchBrowserProfiles();
  }

  render() {
    return html`<header>
        <div class="mb-4 flex h-8 w-full justify-between">
          <h1 class="text-xl font-semibold">${msg("Browser Profiles")}</h1>
          <sl-button
            variant="primary"
            size="small"
            @click=${() => {
              this.dispatchEvent(
                new CustomEvent("select-new-dialog", {
                  detail: "browser-profile",
                }) as SelectNewDialogEvent,
              );
            }}
          >
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            ${msg("New Browser Profile")}
          </sl-button>
        </div>
      </header>
      <div class="overflow-auto px-2 pb-1">${this.renderTable()}</div>`;
  }

  private renderTable() {
    return html`
      <btrix-table
        style="grid-template-columns: min-content [clickable-start] 60ch repeat(2, auto) [clickable-end] min-content; --btrix-cell-padding-left: var(--sl-spacing-x-small); --btrix-cell-padding-right: var(--sl-spacing-x-small);"
      >
        <btrix-table-head class="mb-2">
          <btrix-table-header-cell>
            <span class="sr-only">${msg("Backed up status")}</span>
          </btrix-table-header-cell>
          <btrix-table-header-cell class="pl-0">
            ${msg("Name")}
          </btrix-table-header-cell>
          <btrix-table-header-cell>
            ${msg("Date Created")}
          </btrix-table-header-cell>
          <btrix-table-header-cell>
            ${msg("Visited URLs")}
          </btrix-table-header-cell>
          <btrix-table-header-cell>
            <span class="sr-only">${msg("Row Actions")}</span>
          </btrix-table-header-cell>
        </btrix-table-head>
        ${this.browserProfiles?.length
          ? html`
              <btrix-table-body
                style="--btrix-row-gap: var(--sl-spacing-x-small); --btrix-cell-padding-top: var(--sl-spacing-2x-small); --btrix-cell-padding-bottom: var(--sl-spacing-2x-small);"
              >
                ${this.browserProfiles.map(this.renderItem)}
              </btrix-table-body>
            `
          : nothing}
      </btrix-table>
      ${this.browserProfiles?.length
        ? nothing
        : html`
            <div class="border-b border-t py-5">
              <p class="text-center text-0-500">
                ${msg("No browser profiles yet.")}
              </p>
            </div>
          `}
    `;
  }

  private readonly renderItem = (data: Profile) => {
    const isBackedUp = data.resource && data.resource.replicas.length > 0;
    return html`
      <btrix-table-row
        class="cursor-pointer select-none rounded border shadow transition-all focus-within:bg-neutral-50 hover:bg-neutral-50 hover:shadow-none"
      >
        <btrix-table-cell class="p-3">
          <sl-tooltip
            content=${isBackedUp ? msg("Backed up") : msg("Not backed up")}
          >
            <sl-icon
              name=${isBackedUp ? "clouds-fill" : "cloud-slash-fill"}
              class="${isBackedUp ? "text-success" : "text-neutral-500"}"
            ></sl-icon>
          </sl-tooltip>
        </btrix-table-cell>
        <btrix-table-cell
          class="flex-col items-start justify-center pl-0"
          rowClickTarget="a"
        >
          <a
            class="flex items-center gap-3"
            href=${`${this.orgBasePath}/browser-profiles/profile/${data.id}`}
            @click=${this.navLink}
          >
            ${data.name}
          </a>
          <div class="w-full text-xs text-neutral-500">
            <div class="truncate">
              ${data.description} ${data.description} ${data.description}
              ${data.description} ${data.description} ${data.description}
              ${data.description}
            </div>
          </div>
        </btrix-table-cell>
        <btrix-table-cell class="whitespace-nowrap">
          <sl-format-date
            date=${`${data.created}Z`}
            month="2-digit"
            day="2-digit"
            year="2-digit"
            hour="2-digit"
            minute="2-digit"
          ></sl-format-date>
        </btrix-table-cell>
        <btrix-table-cell>${data.origins.join(", ")}</btrix-table-cell>
        <btrix-table-cell class="px-1"
          >${this.renderActions(data)}</btrix-table-cell
        >
      </btrix-table-row>
    `;
  };

  private renderActions(data: Profile) {
    return html`
      <btrix-overflow-dropdown @click=${(e: Event) => e.preventDefault()}>
        <sl-menu>
          <sl-menu-item
            @click=${() => {
              void this.duplicateProfile(data);
            }}
          >
            <sl-icon slot="prefix" name="files"></sl-icon>
            ${msg("Duplicate Profile")}
          </sl-menu-item>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${() => {
              void this.deleteProfile(data);
            }}
          >
            <sl-icon slot="prefix" name="trash3"></sl-icon>
            ${msg("Delete")}
          </sl-menu-item>
        </sl-menu>
      </btrix-overflow-dropdown>
    `;
  }

  private async duplicateProfile(profile: Profile) {
    const url = profile.origins[0];

    try {
      const data = await this.createBrowser({ url });

      this.notify({
        message: msg("Starting up browser with selected profile..."),
        variant: "success",
        icon: "check2-circle",
      });

      this.navTo(
        `${this.orgBasePath}/browser-profiles/profile/browser/${
          data.browserid
        }?name=${window.encodeURIComponent(
          profile.name,
        )}&description=${window.encodeURIComponent(
          profile.description || "",
        )}&profileId=${window.encodeURIComponent(profile.id)}&navigateUrl=`,
      );
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't create browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async deleteProfile(profile: Profile) {
    try {
      const data = await this.apiFetch<Profile & { error?: boolean }>(
        `/orgs/${this.orgId}/profiles/${profile.id}`,
        this.authState!,
        {
          method: "DELETE",
        },
      );

      if (data.error && data.crawlconfigs) {
        this.notify({
          message: msg(
            html`Could not delete <strong>${profile.name}</strong>, in use by
              <strong
                >${data.crawlconfigs.map(({ name }) => name).join(", ")}</strong
              >. Please remove browser profile from Workflow to continue.`,
          ),
          variant: "warning",
          icon: "exclamation-triangle",
          duration: 15000,
        });
      } else {
        this.notify({
          message: msg(html`Deleted <strong>${profile.name}</strong>.`),
          variant: "success",
          icon: "check2-circle",
        });

        this.browserProfiles = this.browserProfiles!.filter(
          (p) => p.id !== profile.id,
        );
      }
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't delete browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async createBrowser({ url }: { url: string }) {
    const params = {
      url,
    };

    return this.apiFetch<Browser>(
      `/orgs/${this.orgId}/profiles/browser`,
      this.authState!,
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );
  }

  /**
   * Fetch browser profiles and update internal state
   */
  private async fetchBrowserProfiles(): Promise<void> {
    try {
      const data = await this.getProfiles();

      this.browserProfiles = data;
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve browser profiles at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getProfiles() {
    const data = await this.apiFetch<APIPaginatedList<Profile>>(
      `/orgs/${this.orgId}/profiles`,
      this.authState!,
    );

    return data.items;
  }
}
