import { state, property, customElement } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import difference from "lodash/fp/difference";

import type { CollectionSubmitEvent } from "@/components/collection-editor";
import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";
import type { Collection } from "@/types/collection";
import "@/components/collection-editor";

@localized()
@customElement("btrix-collection-edit")
export class CollectionEdit extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  collectionId!: string;

  @property({ type: Boolean })
  isCrawler?: boolean;

  @state()
  private collection?: Collection;

  @state()
  private isSubmitting = false;

  @state()
  private serverError?: string;

  protected async willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("orgId")) {
      this.collection = undefined;
      this.fetchCollection();
    }
  }

  render() {
    return html`${this.renderHeader()}
      <h2 class="text-xl font-semibold mb-6">${this.collection?.name}</h2>
      ${when(
        this.collection,
        () => html`
          <btrix-collection-editor
            .authState=${this.authState}
            orgId=${this.orgId}
            collectionId=${this.collectionId}
            .metadataValues=${this.collection}
            ?isSubmitting=${this.isSubmitting}
            ?isCrawler=${this.isCrawler}
            @on-submit=${this.onSubmit}
          ></btrix-collection-editor>
        `
      )} `;
  }

  private renderHeader = () => html`
    <nav class="mb-5">
      <a
        class="text-gray-600 hover:text-gray-800 text-sm font-medium"
        href=${`${this.orgBasePath}/collections/view/${this.collectionId}`}
        @click=${this.navLink}
      >
        <sl-icon name="arrow-left" class="inline-block align-middle"></sl-icon>
        <span class="inline-block align-middle"
          >${msg(
            str`Back to ${this.collection?.name || msg("Collection")}`
          )}</span
        >
      </a>
    </nav>
  `;

  private renderLoading = () => html`<div
    class="w-full flex items-center justify-center my-24 text-3xl"
  >
    <sl-spinner></sl-spinner>
  </div>`;

  private async onSubmit(e: CollectionSubmitEvent) {
    this.isSubmitting = true;
    const { name, description, crawlIds, oldCrawlIds, isPublic } =
      e.detail.values;

    try {
      if (crawlIds && oldCrawlIds) {
        await this.saveCrawlSelection({
          crawlIds,
          oldCrawlIds,
        });
      } else {
        await this.saveMetadata({
          name,
          description,
          isPublic,
        });
      }

      this.notify({
        message: msg(
          html`Successfully updated <strong>${name}</strong> Collection.`
        ),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e: any) {
      if (e?.isApiError) {
        this.serverError = e?.message as string;
      } else {
        this.serverError = msg("Something unexpected went wrong");
      }

      this.notify({
        message: this.serverError,
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmitting = false;
  }

  private saveMetadata(values: {
    name: string;
    description: string | null;
    isPublic: boolean;
  }) {
    return this.apiFetch(
      `/orgs/${this.orgId}/collections/${this.collectionId}`,
      this.authState!,
      {
        method: "PATCH",
        body: JSON.stringify(values),
      }
    );
  }

  private saveCrawlSelection({
    crawlIds,
    oldCrawlIds,
  }: {
    crawlIds: string[];
    oldCrawlIds: string[];
  }) {
    const remove = difference(oldCrawlIds)(crawlIds);
    const add = difference(crawlIds)(oldCrawlIds);
    const requests = [];
    if (add.length) {
      requests.push(
        this.apiFetch(
          `/orgs/${this.orgId}/collections/${this.collectionId}/add`,
          this.authState!,
          {
            method: "POST",
            body: JSON.stringify({ crawlIds: add }),
          }
        )
      );
    }
    if (remove.length) {
      requests.push(
        this.apiFetch(
          `/orgs/${this.orgId}/collections/${this.collectionId}/remove`,
          this.authState!,
          {
            method: "POST",
            body: JSON.stringify({ crawlIds: remove }),
          }
        )
      );
    }

    if (requests.length) {
      return Promise.all(requests).then(([data]) => data);
    }

    return Promise.resolve(this.collection);
  }

  private async fetchCollection() {
    try {
      this.collection = await this.getCollection();
    } catch (e: any) {
      this.notify({
        message: msg("Sorry, couldn't retrieve Collection at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCollection(): Promise<Collection> {
    const data = await this.apiFetch(
      `/orgs/${this.orgId}/collections/${this.collectionId}`,
      this.authState!
    );

    return data;
  }
}
