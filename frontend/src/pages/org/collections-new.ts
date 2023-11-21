import { state, property, customElement } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { CollectionSubmitEvent } from "@/components/collections/collection-editor";
import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";
import type { Collection } from "@/types/collection";
import "@/components/collections/collection-editor";

@localized()
@customElement("btrix-collections-new")
export class CollectionsNew extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: Boolean })
  isCrawler?: boolean;

  @property({ type: String })
  name?: string;

  @state()
  private collection?: Collection;

  @state()
  private isSubmitting = false;

  @state()
  private serverError?: string;

  render() {
    return html`${this.renderHeader()}
      <h2 class="text-xl font-semibold mb-6">
        ${msg("New Collection")}${this.name ? html` &mdash; ${this.name}` : ""}
      </h2>
      <btrix-collection-editor
        .authState=${this.authState}
        orgId=${this.orgId}
        .metadataValues=${{
          name: this.name || "",
        }}
        ?isSubmitting=${this.isSubmitting}
        ?isCrawler=${this.isCrawler}
        @on-submit=${this.onSubmit}
      ></btrix-collection-editor>`;
  }

  private renderHeader = () => html`
    <nav class="mb-7">
      <a
        class="text-gray-600 hover:text-gray-800 text-sm font-medium"
        href=${`${this.orgBasePath}/collections`}
        @click=${this.navLink}
      >
        <sl-icon name="arrow-left" class="inline-block align-middle"></sl-icon>
        <span class="inline-block align-middle"
          >${msg("Back to Collections")}</span
        >
      </a>
    </nav>
  `;

  private async onSubmit(e: CollectionSubmitEvent) {
    this.isSubmitting = true;

    try {
      const { name, description, crawlIds, isPublic } = e.detail.values;
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/collections`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify({
            name,
            description,
            crawlIds,
            isPublic,
          }),
        }
      );

      this.notify({
        message: msg(str`Successfully created "${data.name}" Collection.`),
        variant: "success",
        icon: "check2-circle",
      });

      this.navTo(`${this.orgBasePath}/collections/view/${data.id}`);
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
}
