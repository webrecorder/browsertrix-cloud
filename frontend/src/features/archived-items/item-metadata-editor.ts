import { localized, msg } from "@lit/localize";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import Fuse from "fuse.js";
import { customElement, property, state } from "lit/decorators.js";

import type {
  TagInputEvent,
  Tags,
  TagsChangeEvent,
} from "@/components/ui/tag-input";
import { type CollectionsChangeEvent } from "@/features/collections/collections-add";
import type { ArchivedItem } from "@/types/crawler";
import type { AuthState } from "@/utils/AuthService";
import { maxLengthValidator } from "@/utils/form";
import LiteElement, { html } from "@/utils/LiteElement";

/**
 * Usage:
 * ```ts
 * <btrix-item-metadata-editor
 *   .authState=${this.authState}
 *   .crawl=${this.crawl}
 *   ?open=${this.open}
 *   @request-close=${this.requestClose}
 *   @updated=${this.updated}
 * ></btrix-item-metadata-editor>
 * ```
 *
 * @event request-close
 * @event updated
 */
@localized()
@customElement("btrix-item-metadata-editor")
export class CrawlMetadataEditor extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  crawl?: ArchivedItem;

  @property({ type: Boolean })
  open = false;

  @state()
  private isSubmittingUpdate = false;

  @state()
  private isDialogVisible = false;

  @state()
  private includeName = false;

  @state()
  private tagOptions: Tags = [];

  @state()
  private tagsToSave: Tags = [];

  @state()
  private collectionsToSave: string[] = [];

  // For fuzzy search:
  private readonly fuse = new Fuse<string>([], {
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
  });

  private readonly validateCrawlDescriptionMax = maxLengthValidator(500);

  willUpdate(changedProperties: Map<string, never>) {
    if (changedProperties.has("open") && this.open) {
      void this.fetchTags();
    }
    if (changedProperties.has("crawl") && this.crawl) {
      this.includeName = this.crawl.type === "upload";
      this.tagsToSave = this.crawl.tags;
      this.collectionsToSave = this.crawl.collectionIds;
    }
  }

  render() {
    return html`
      <btrix-dialog
        .label=${msg("Edit Metadata")}
        .open=${this.open}
        @sl-show=${() => (this.isDialogVisible = true)}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
        @sl-request-close=${this.requestClose}
      >
        ${this.isDialogVisible ? this.renderEditMetadata() : ""}
      </btrix-dialog>
    `;
  }

  private renderEditMetadata() {
    if (!this.crawl) return;

    const { helpText, validate } = this.validateCrawlDescriptionMax;
    return html`
      <form
        id="crawlDetailsForm"
        @submit=${this.onSubmitMetadata}
        @reset=${this.requestClose}
      >
        ${this.includeName
          ? html`
              <div class="mb-3">
                <sl-input label="Name" name="name" value="${this.crawl.name}">
                </sl-input>
              </div>
            `
          : ``}
        <sl-textarea
          class="with-max-help-text mb-3"
          name="crawlDescription"
          label=${msg("Description")}
          value=${this.crawl.description || ""}
          rows="3"
          autocomplete="off"
          resize="auto"
          help-text=${helpText}
          @sl-input=${validate}
        ></sl-textarea>
        <btrix-tag-input
          .initialTags=${this.crawl.tags}
          .tagOptions=${this.tagOptions}
          @tag-input=${this.onTagInput}
          @tags-change=${(e: TagsChangeEvent) =>
            (this.tagsToSave = e.detail.tags)}
        ></btrix-tag-input>
        <div class="mt-4">
          <btrix-collections-add
            .authState=${this.authState ?? null}
            .initialCollections=${this.crawl.collectionIds}
            .orgId=${this.crawl.oid}
            .configId=${"temp"}
            label=${msg("Add to Collection")}
            @collections-change=${(e: CollectionsChangeEvent) =>
              (this.collectionsToSave = e.detail.collections)}
          >
          </btrix-collections-add>
        </div>
      </form>
      <div slot="footer" class="flex justify-between">
        <sl-button form="crawlDetailsForm" type="reset" size="small"
          >${msg("Cancel")}</sl-button
        >
        <sl-button
          form="crawlDetailsForm"
          variant="primary"
          type="submit"
          size="small"
          ?loading=${this.isSubmittingUpdate}
          ?disabled=${this.isSubmittingUpdate}
          >${msg("Save")}</sl-button
        >
      </div>
    `;
  }

  private requestClose() {
    this.dispatchEvent(new CustomEvent("request-close"));
  }

  private readonly onTagInput = (e: TagInputEvent) => {
    const { value } = e.detail;
    if (!value) return;
    this.tagOptions = this.fuse.search(value).map(({ item }) => item);
  };

  private async fetchTags() {
    if (!this.crawl) return;
    try {
      const tags = await this.apiFetch<string[]>(
        `/orgs/${this.crawl.oid}/crawlconfigs/tags`,
        this.authState!,
      );

      // Update search/filter collection
      this.fuse.setCollection(tags);
    } catch (e) {
      // Fail silently, since users can still enter tags
      console.debug(e);
    }
  }

  private async onSubmitMetadata(e: SubmitEvent) {
    e.preventDefault();
    if (!this.crawl) return;

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;
    const { crawlDescription, name } = serialize(formEl);

    const params: {
      collectionIds?: string[];
      tags?: string[];
      description?: string;
      name?: string;
    } = {};
    if (this.includeName && name && name !== this.crawl.name) {
      params.name = name as string;
    }
    if (
      crawlDescription &&
      crawlDescription !== (this.crawl.description ?? "")
    ) {
      params.description = crawlDescription as string;
    }
    if (JSON.stringify(this.tagsToSave) !== JSON.stringify(this.crawl.tags)) {
      params.tags = this.tagsToSave;
    }
    if (
      JSON.stringify(this.collectionsToSave) !==
      JSON.stringify(this.crawl.collectionIds)
    ) {
      params.collectionIds = this.collectionsToSave;
    }

    if (!Object.keys(params).length) {
      // No changes have been made
      this.requestClose();
      return;
    }

    this.isSubmittingUpdate = true;

    try {
      const data = await this.apiFetch<{ updated: boolean }>(
        `/orgs/${this.crawl.oid}/all-crawls/${this.crawl.id}`,
        this.authState!,
        {
          method: "PATCH",
          body: JSON.stringify(params),
        },
      );

      if (!data.updated) {
        throw data;
      }

      this.dispatchEvent(new CustomEvent("updated"));
      this.notify({
        message: msg("Successfully saved crawl details."),
        variant: "success",
        icon: "check2-circle",
      });
      this.requestClose();
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't save crawl details at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmittingUpdate = false;
  }

  async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }
}
