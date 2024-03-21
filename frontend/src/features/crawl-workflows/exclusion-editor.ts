import { localized, msg } from "@lit/localize";
import { type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import type {
  ExclusionAddEvent,
  ExclusionChangeEvent,
} from "./queue-exclusion-form";
import type { ExclusionRemoveEvent } from "./queue-exclusion-table";

import type { SeedConfig } from "@/pages/org/types";
import { isApiError } from "@/utils/api";
import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";

type URLs = string[];
type ResponseData = {
  total: number;
  matched: URLs;
};

/**
 * Crawl queue exclusion editor
 *
 * Usage example:
 * ```ts
 * <btrix-exclusion-editor
 *   orgId=${this.crawl.oid}
 *   crawlId=${this.crawl.id}
 *   .config=${this.workflow.config}
 *   .authState=${this.authState}
 *   ?isActiveCrawl=${isActive}
 * >
 * </btrix-exclusion-editor>
 * ```
 *
 * @event on-success On successful edit
 */
@localized()
@customElement("btrix-exclusion-editor")
export class ExclusionEditor extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  orgId?: string;

  @property({ type: String })
  crawlId?: string;

  @property({ attribute: false })
  config?: SeedConfig;

  @property({ type: Boolean })
  isActiveCrawl = false;

  @state()
  private isSubmitting = false;

  @state()
  private exclusionFieldErrorMessage = "";

  @state()
  /** `new RegExp` constructor string */
  private regex = "";

  @state()
  matchedURLs: URLs | null = null;

  @state()
  private isLoading = false;

  willUpdate(changedProperties: PropertyValues<this> & Map<string, unknown>) {
    if (
      changedProperties.has("authState") ||
      changedProperties.has("orgId") ||
      changedProperties.has("crawlId") ||
      changedProperties.has("regex")
    ) {
      void this.fetchQueueMatches();
    }
  }

  render() {
    return html`
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div class="col-span-1">${this.renderTable()}</div>
        <div class="col-span-1">
          ${this.isActiveCrawl && this.regex
            ? html` <section class="mt-5">${this.renderPending()}</section> `
            : ""}
          ${this.isActiveCrawl
            ? html` <section class="mt-5">${this.renderQueue()}</section> `
            : ""}
        </div>
      </div>
    `;
  }

  private renderTable() {
    return html`
      ${this.config
        ? html`<btrix-queue-exclusion-table
            ?removable=${this.isActiveCrawl}
            .exclusions=${this.config.exclude || []}
            @on-remove=${this.deleteExclusion}
          >
          </btrix-queue-exclusion-table>`
        : html`
            <div class="my-9 flex items-center justify-center text-xl">
              <sl-spinner></sl-spinner>
            </div>
          `}
      ${this.isActiveCrawl
        ? html`<div class="mt-2">
            <btrix-queue-exclusion-form
              ?isSubmitting=${this.isSubmitting}
              fieldErrorMessage=${this.exclusionFieldErrorMessage}
              @on-change=${this.handleRegexChange}
              @on-add=${this.handleAddRegex}
            >
            </btrix-queue-exclusion-form>
          </div>`
        : ""}
    `;
  }

  private renderPending() {
    return html`
      <btrix-crawl-pending-exclusions
        .matchedURLs=${this.matchedURLs}
      ></btrix-crawl-pending-exclusions>
    `;
  }

  private renderQueue() {
    return html`<btrix-crawl-queue
      orgId=${this.orgId!}
      crawlId=${this.crawlId!}
      .authState=${this.authState}
      regex=${this.regex}
      .exclusions=${this.config?.exclude || []}
      matchedTotal=${this.matchedURLs?.length || 0}
    ></btrix-crawl-queue>`;
  }

  private handleRegexChange(e: ExclusionChangeEvent) {
    const { value, valid } = e.detail;

    if (valid) {
      this.regex = value;
    } else {
      this.regex = "";
    }
  }

  private async deleteExclusion(e: ExclusionRemoveEvent) {
    const { regex } = e.detail;

    try {
      const params = new URLSearchParams({ regex });
      const data = await this.apiFetch<{ success: boolean }>(
        `/orgs/${this.orgId}/crawls/${
          this.crawlId
        }/exclusions?${params.toString()}`,
        this.authState!,
        {
          method: "DELETE",
        },
      );

      if (data.success) {
        this.notify({
          message: msg(html`Removed exclusion: <code>${regex}</code>`),
          variant: "success",
          icon: "check2-circle",
        });

        this.dispatchEvent(new CustomEvent("on-success"));
      } else {
        throw data;
      }
    } catch (e) {
      this.notify({
        message:
          isApiError(e) && e.message === "crawl_running_cant_deactivate"
            ? msg("Cannot remove exclusion when crawl is no longer running.")
            : msg("Sorry, couldn't remove exclusion at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async fetchQueueMatches() {
    if (!this.regex) {
      this.matchedURLs = null;
      return;
    }

    this.isLoading = true;

    try {
      const { matched } = await this.getQueueMatches();
      this.matchedURLs = matched;
    } catch (e) {
      if (isApiError(e) && e.message === "invalid_regex") {
        this.exclusionFieldErrorMessage = msg("Invalid Regex");
      } else {
        this.notify({
          message: msg(
            "Sorry, couldn't fetch pending exclusions at this time.",
          ),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }

    this.isLoading = false;
  }

  private async getQueueMatches() {
    const regex = this.regex;
    const params = new URLSearchParams({ regex });
    const data = await this.apiFetch<ResponseData>(
      `/orgs/${this.orgId}/crawls/${
        this.crawlId
      }/queueMatchAll?${params.toString()}`,
      this.authState!,
    );

    return data;
  }

  async handleAddRegex(e?: ExclusionAddEvent) {
    this.isSubmitting = true;

    let regex = null;
    let onSuccess = null;

    if (e) {
      ({ regex, onSuccess } = e.detail);
    } else {
      // if not provided, use current regex, if set
      if (!this.regex) {
        return;
      }
      regex = this.regex;
    }

    try {
      const params = new URLSearchParams({ regex });
      const data = await this.apiFetch<{ success: boolean }>(
        `/orgs/${this.orgId}/crawls/${
          this.crawlId
        }/exclusions?${params.toString()}`,
        this.authState!,
        {
          method: "POST",
        },
      );

      if (data.success) {
        this.notify({
          message: msg("Exclusion added."),
          variant: "success",
          icon: "check2-circle",
        });

        this.regex = "";
        this.matchedURLs = null;
        await this.updateComplete;

        if (onSuccess) {
          onSuccess();
        }
        this.dispatchEvent(new CustomEvent("on-success"));
      } else {
        throw data;
      }
    } catch (e) {
      if (isApiError(e)) {
        if (e.message === "exclusion_already_exists") {
          this.exclusionFieldErrorMessage = msg("Exclusion already exists");
        } else if (e.message === "invalid_regex") {
          this.exclusionFieldErrorMessage = msg("Invalid Regex");
        }
      } else {
        this.notify({
          message: msg("Sorry, couldn't add exclusion at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }

    this.isSubmitting = false;
  }

  async onClose() {
    if (this.regex && this.isActiveCrawl) {
      await this.handleAddRegex();
    }
  }
}
