import { localized, msg, str } from "@lit/localize";
import { type SlDropdown } from "@shoelace-style/shoelace";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import type { Profile } from "./types";

import { isApiError } from "@/utils/api";
import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";

/**
 * Usage:
 * ```ts
 * <btrix-browser-profiles-detail
 *  authState=${authState}
 *  orgId=${orgId}
 *  profileId=${profileId}
 * ></btrix-browser-profiles-detail>
 * ```
 */
@localized()
@customElement("btrix-browser-profiles-detail")
export class BrowserProfilesDetail extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  profileId!: string;

  @state()
  private profile?: Profile;

  @state()
  private isBrowserLoading = false;

  @state()
  private isBrowserLoaded = false;

  @state()
  private isSubmittingBrowserChange = false;

  @state()
  private isSubmittingProfileChange = false;

  @state()
  private browserId?: string;

  @state()
  private isEditDialogOpen = false;

  @state()
  private isEditDialogContentVisible = false;

  disconnectedCallback() {
    if (this.browserId) {
      void this.deleteBrowser(this.browserId);
    }
  }

  firstUpdated() {
    void this.fetchProfile();
  }

  render() {
    return html`<div class="mb-7">
        <a
          class="text-sm font-medium text-neutral-500 hover:text-neutral-600"
          href=${`${this.orgBasePath}/browser-profiles`}
          @click=${this.navLink}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle"
            >${msg("Back to Browser Profiles")}</span
          >
        </a>
      </div>

      <header class="mb-3 items-center justify-between md:flex">
        <h2 class="mb-1 text-xl font-semibold md:h-9">
          ${this.profile?.name
            ? html`${this.profile.name}
                <sl-button
                  size="small"
                  variant="text"
                  @click=${() => (this.isEditDialogOpen = true)}
                >
                  ${msg("Edit")}
                </sl-button>`
            : html`<sl-skeleton class="w-80 md:h-9"></sl-skeleton>`}
        </h2>
        <div>
          ${this.profile
            ? this.renderMenu()
            : html`<sl-skeleton
                style="width: 6em; height: 2em;"
              ></sl-skeleton>`}
        </div>
      </header>

      <section class="mb-5 rounded border p-4">
        <dl class="grid grid-cols-3 gap-5">
          <div class="col-span-3 md:col-span-1">
            <dt class="text-sm text-0-600">${msg("Description")}</dt>
            <dd>
              ${this.profile
                ? this.profile.description ||
                  html`<span class="text-neutral-400">${msg("None")}</span>`
                : ""}
            </dd>
          </div>
          <div class="col-span-3 md:col-span-1">
            <dt class="text-sm text-0-600">
              <span class="inline-block align-middle"
                >${msg("Created at")}</span
              >
            </dt>
            <dd>
              ${this.profile
                ? html`
                    <sl-format-date
                      date=${`${this.profile.created}Z` /** Z for UTC */}
                      month="2-digit"
                      day="2-digit"
                      year="2-digit"
                      hour="numeric"
                      minute="numeric"
                      time-zone-name="short"
                    ></sl-format-date>
                  `
                : ""}
            </dd>
          </div>
          <div class="col-span-3 md:col-span-1">
            <dt class="text-sm text-0-600">
              <span class="inline-block align-middle"
                >${msg("Crawl Workflows")}</span
              >
              <sl-tooltip content=${msg("Crawl workflows using this profile")}>
                <sl-icon
                  class="inline-block align-middle"
                  name="info-circle"
                ></sl-icon>
              </sl-tooltip>
            </dt>
            <dd>
              <ul class="text-sm font-medium">
                ${this.profile?.crawlconfigs?.map(
                  ({ id, name }) => html`
                    <li>
                      <a
                        class="text-neutral-600 hover:underline"
                        href=${`/orgs/${
                          this.profile!.oid
                        }/workflows/crawl/${id}`}
                      >
                        ${name}
                      </a>
                    </li>
                  `,
                )}
              </ul>
            </dd>
          </div>
        </dl>
      </section>

      <div class="flex">
        <section class="flex-1">
          <header class="mb-2">
            <h3 class="text-lg font-medium">${msg("Browser Profile")}</h3>
          </header>
          ${when(
            this.browserId || this.isBrowserLoading,
            () => html`
              <div
                class="flex h-screen flex-col overflow-hidden rounded-lg border"
              >
                <btrix-profile-browser
                  class="flex-1"
                  .authState=${this.authState}
                  orgId=${this.orgId}
                  browserId=${ifDefined(this.browserId)}
                  .origins=${this.profile?.origins}
                  @load=${() => (this.isBrowserLoaded = true)}
                ></btrix-profile-browser>
                <div class="flex-0 border-t">
                  ${this.renderBrowserProfileControls()}
                </div>
              </div>
            `,
            () =>
              html`<div
                class="flex aspect-4/3 flex-col items-center justify-center rounded-lg border bg-neutral-50"
              >
                <p class="mb-4 max-w-prose text-neutral-600">
                  ${msg(
                    "Edit the profile to make changes or view its present configuration",
                  )}
                </p>
                <sl-button @click=${this.startBrowserPreview}
                  ><sl-icon slot="prefix" name="pencil-square"></sl-icon> ${msg(
                    "Edit Browser Profile",
                  )}</sl-button
                >
              </div>`,
          )}
        </section>
        ${when(
          !(this.browserId || this.isBrowserLoading),
          this.renderVisitedSites,
        )}
      </div>

      <btrix-dialog
        .label=${msg(str`Edit Profile`)}
        .open=${this.isEditDialogOpen}
        @sl-request-close=${() => (this.isEditDialogOpen = false)}
        @sl-show=${() => (this.isEditDialogContentVisible = true)}
        @sl-after-hide=${() => (this.isEditDialogContentVisible = false)}
      >
        ${this.isEditDialogContentVisible ? this.renderEditProfile() : ""}
      </btrix-dialog> `;
  }

  private readonly renderVisitedSites = () => {
    return html`
      <section class="flex-grow-1 flex flex-col lg:w-80 lg:pl-6">
        <header class="flex-0 mb-2">
          <h3 class="text-lg font-medium">${msg("Visited Sites")}</h3>
        </header>
        <div class="flex-1 overflow-auto rounded-lg border p-4">
          <ul class="font-monostyle text-neutral-800">
            ${this.profile?.origins.map((origin) => html`<li>${origin}</li>`)}
          </ul>
        </div>
      </section>
    `;
  };

  private renderBrowserProfileControls() {
    return html`
      <div class="flex justify-between p-4">
        <div class="max-w-prose">
          <p class="mx-1 text-xs text-neutral-500">
            ${msg(
              "Interact with the browsing tool to set up the browser profile.  Workflows that use this browser profile will behave as if they have logged into the same websites and have the same cookies that have been set here.",
            )}
          </p>
        </div>
        <div>
          <sl-button size="small" @click=${this.cancelEditBrowser}
            >${msg("Cancel")}</sl-button
          >
          <sl-button
            variant="primary"
            size="small"
            ?loading=${this.isSubmittingBrowserChange}
            ?disabled=${this.isSubmittingBrowserChange || !this.isBrowserLoaded}
            @click=${this.saveBrowser}
            >${msg("Save Browser Profile")}</sl-button
          >
        </div>
      </div>
    `;
  }

  private renderMenu() {
    return html`
      <sl-dropdown placement="bottom-end" distance="4">
        <sl-button size="small" slot="trigger" caret
          >${msg("Actions")}</sl-button
        >

        <ul
          class="whitespace-nowrap bg-white text-left text-sm text-neutral-800"
          role="menu"
        >
          <li
            class="cursor-pointer p-2 hover:bg-zinc-100"
            role="menuitem"
            @click=${(e: Event) => {
              void (e.target as HTMLElement)
                .closest<SlDropdown>("sl-dropdown")!
                .hide();
              this.isEditDialogOpen = true;
            }}
          >
            <sl-icon
              class="inline-block px-1 align-middle"
              name="pencil"
            ></sl-icon>
            <span class="inline-block pr-2 align-middle"
              >${msg("Edit Name & Description")}</span
            >
          </li>
          <li
            class="cursor-pointer p-2 hover:bg-zinc-100"
            role="menuitem"
            @click=${() => void this.duplicateProfile()}
          >
            <sl-icon
              class="inline-block px-1 align-middle"
              name="files"
            ></sl-icon>
            <span class="inline-block pr-2 align-middle"
              >${msg("Duplicate Profile")}</span
            >
          </li>
          <hr />
          <li
            class="cursor-pointer p-2 text-danger hover:bg-danger hover:text-white"
            role="menuitem"
            @click=${() => {
              void this.deleteProfile();
            }}
          >
            <sl-icon
              class="inline-block px-1 align-middle"
              name="trash3"
            ></sl-icon>
            <span class="inline-block pr-2 align-middle">${msg("Delete")}</span>
          </li>
        </ul>
      </sl-dropdown>
    `;
  }

  private renderEditProfile() {
    if (!this.profile) return;

    return html`
      <form @submit=${this.onSubmitEdit}>
        <div class="mb-5">
          <sl-input
            name="name"
            label=${msg("Name")}
            autocomplete="off"
            value=${this.profile.name}
            required
          ></sl-input>
        </div>

        <div class="mb-5">
          <sl-textarea
            name="description"
            label=${msg("Description")}
            rows="2"
            autocomplete="off"
            value=${this.profile.description || ""}
          ></sl-textarea>
        </div>

        <div class="flex justify-between">
          <sl-button
            variant="default"
            size="small"
            @click=${() => (this.isEditDialogOpen = false)}
            >${msg("Cancel")}</sl-button
          >
          <sl-button
            variant="primary"
            size="small"
            type="submit"
            ?disabled=${this.isSubmittingProfileChange}
            ?loading=${this.isSubmittingProfileChange}
            >${msg("Save Changes")}</sl-button
          >
        </div>
      </form>
    `;
  }

  private async startBrowserPreview() {
    if (!this.profile) return;

    this.isBrowserLoading = true;

    const url = this.profile.origins[0];

    try {
      const data = await this.createBrowser({ url });

      this.browserId = data.browserid;
      this.isBrowserLoading = false;
    } catch (e) {
      this.isBrowserLoading = false;

      this.notify({
        message: msg("Sorry, couldn't preview browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async cancelEditBrowser() {
    const prevBrowserId = this.browserId;

    this.isBrowserLoaded = false;
    this.browserId = undefined;

    if (prevBrowserId) {
      try {
        await this.deleteBrowser(prevBrowserId);
      } catch (e) {
        // TODO Investigate DELETE is returning 404
        console.debug(e);
      }
    }
  }

  private async duplicateProfile() {
    if (!this.profile) return;

    this.isBrowserLoading = true;

    const url = this.profile.origins[0];

    try {
      const data = await this.createBrowser({ url });

      this.notify({
        message: msg("Starting up browser with current profile..."),
        variant: "success",
        icon: "check2-circle",
      });

      this.navTo(
        `${this.orgBasePath}/browser-profiles/profile/browser/${
          data.browserid
        }?name=${window.encodeURIComponent(
          this.profile.name,
        )}&description=${window.encodeURIComponent(
          this.profile.description || "",
        )}&profileId=${window.encodeURIComponent(this.profile.id)}&navigateUrl=`,
      );
    } catch (e) {
      this.isBrowserLoading = false;

      this.notify({
        message: msg("Sorry, couldn't create browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async deleteProfile() {
    const profileName = this.profile!.name;

    try {
      const data = await this.apiFetch<Profile & { error: boolean }>(
        `/orgs/${this.orgId}/profiles/${this.profile!.id}`,
        this.authState!,
        {
          method: "DELETE",
        },
      );

      if (data.error && data.crawlconfigs) {
        this.notify({
          message: msg(
            html`Could not delete <strong>${profileName}</strong>, in use by
              <strong
                >${data.crawlconfigs.map(({ name }) => name).join(", ")}</strong
              >. Please remove browser profile from Workflow to continue.`,
          ),
          variant: "warning",
          icon: "exclamation-triangle",
          duration: 15000,
        });
      } else {
        this.navTo(`${this.orgBasePath}/browser-profiles`);

        this.notify({
          message: msg(html`Deleted <strong>${profileName}</strong>.`),
          variant: "success",
          icon: "check2-circle",
        });
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
      profileId: this.profile!.id,
    };

    return this.apiFetch<{ browserid: string }>(
      `/orgs/${this.orgId}/profiles/browser`,
      this.authState!,
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );
  }

  private async deleteBrowser(id: string) {
    return this.apiFetch(
      `/orgs/${this.orgId}/profiles/browser/${id}`,
      this.authState!,
      {
        method: "DELETE",
      },
    );
  }

  /**
   * Fetch browser profile and update internal state
   */
  private async fetchProfile(): Promise<void> {
    try {
      const data = await this.getProfile();

      this.profile = data;
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve browser profiles at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getProfile() {
    const data = await this.apiFetch<Profile>(
      `/orgs/${this.orgId}/profiles/${this.profileId}`,
      this.authState!,
    );

    return data;
  }

  private async saveBrowser() {
    if (!this.browserId) return;

    if (
      !window.confirm(
        msg(
          "Save browser changes to profile? You will need to re-load the browsing tool to make additional changes.",
        ),
      )
    ) {
      return;
    }

    this.isSubmittingBrowserChange = true;

    const params = {
      name: this.profile!.name,
      browserid: this.browserId,
    };

    try {
      const data = await this.apiFetch<{ updated: boolean }>(
        `/orgs/${this.orgId}/profiles/${this.profileId}`,
        this.authState!,
        {
          method: "PATCH",
          body: JSON.stringify(params),
        },
      );

      if (data.updated) {
        this.notify({
          message: msg("Successfully saved browser profile."),
          variant: "success",
          icon: "check2-circle",
        });

        this.browserId = undefined;
      } else {
        throw data;
      }
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't save browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmittingBrowserChange = false;
  }

  private async onSubmitEdit(e: SubmitEvent) {
    e.preventDefault;
    this.isSubmittingProfileChange = true;

    const formData = new FormData(e.target as HTMLFormElement);
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;

    const params = {
      name,
      description,
    };

    try {
      const data = await this.apiFetch<{ updated: boolean }>(
        `/orgs/${this.orgId}/profiles/${this.profileId}`,
        this.authState!,
        {
          method: "PATCH",
          body: JSON.stringify(params),
        },
      );

      if (data.updated) {
        this.notify({
          message: msg("Successfully saved browser profile."),
          variant: "success",
          icon: "check2-circle",
        });

        this.profile = {
          ...this.profile,
          ...params,
        } as Profile;
        this.isEditDialogOpen = false;
      } else {
        throw data;
      }
    } catch (e) {
      let message = msg("Sorry, couldn't save browser profile at this time.");

      if (isApiError(e) && e.statusCode === 403) {
        if (e.details === "storage_quota_reached") {
          message = msg(
            "Your org does not have enough storage to save this browser profile.",
          );
        } else {
          message = msg("You do not have permission to edit browser profiles.");
        }
      }

      this.notify({
        message: message,
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmittingProfileChange = false;
  }

  /**
   * Stop propgation of sl-select events.
   * Prevents bug where sl-dialog closes when dropdown closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: CustomEvent) {
    e.stopPropagation();
  }
}
