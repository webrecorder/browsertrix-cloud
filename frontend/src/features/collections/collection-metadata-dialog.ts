import { localized, msg, str } from "@lit/localize";
import { type SlInput } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { customElement, property, queryAsync, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import type { Dialog } from "@/components/ui/dialog";
import type { Collection } from "@/types/collection";
import { isApiError } from "@/utils/api";
import type { AuthState } from "@/utils/AuthService";
import { maxLengthValidator } from "@/utils/form";
import LiteElement, { html } from "@/utils/LiteElement";

export type CollectionSavedEvent = CustomEvent<{
  id: string;
}>;

/**
 * @fires btrix-collection-saved CollectionSavedEvent Fires
 */
@localized()
@customElement("btrix-collection-metadata-dialog")
export class CollectionMetadataDialog extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: Object })
  collection?: Collection;

  @property({ type: Boolean })
  open = false;

  @state()
  private isSubmitting = false;

  @queryAsync("#collectionForm")
  private readonly form!: Promise<HTMLFormElement>;

  private readonly validateNameMax = maxLengthValidator(50);

  render() {
    return html` <btrix-dialog
      label=${this.collection
        ? msg("Edit Collection Metadata")
        : msg("Create a New Collection")}
      ?open=${this.open}
      style="--width: 46rem"
    >
      <form id="collectionForm" @reset=${this.onReset} @submit=${this.onSubmit}>
        <sl-input
          class="with-max-help-text mb-2"
          id="collectionForm-name-input"
          name="name"
          label=${msg("Collection Name")}
          value=${this.collection?.name || ""}
          placeholder=${msg("My Collection")}
          autocomplete="off"
          required
          help-text=${this.validateNameMax.helpText}
          @sl-input=${this.validateNameMax.validate}
          autofocus
        ></sl-input>

        <fieldset>
          <label class="form-label">${msg("Description")}</label>
          <btrix-markdown-editor
            name="description"
            initialValue=${this.collection?.description || ""}
            maxlength=${4000}
          ></btrix-markdown-editor>
        </fieldset>
        ${when(
          !this.collection,
          () => html`
            <label>
              <sl-switch name="isPublic"
                >${msg("Publicly Accessible")}</sl-switch
              >
              <sl-tooltip
                content=${msg(
                  "Enable public access to make Collections shareable. Only people with the shared link can view your Collection.",
                )}
                hoist
                @sl-hide=${this.stopProp}
                @sl-after-hide=${this.stopProp}
                ><sl-icon
                  class="ml-1 inline-block align-middle text-slate-500"
                  name="info-circle"
                ></sl-icon
              ></sl-tooltip>
            </label>
          `,
        )}

        <input class="invisible h-0 w-0" type="submit" />
      </form>
      <div slot="footer" class="flex items-center justify-end gap-3">
        <sl-button
          class="mr-auto"
          size="small"
          @click=${async () => {
            // Using reset method instead of type="reset" fixes
            // incorrect getRootNode in Chrome
            (await this.form).reset();
          }}
          >${msg("Cancel")}</sl-button
        >
        ${when(
          !this.collection,
          () => html`
            <aside class="text-xs text-neutral-500">
              ${msg("You can rename your collection later")}
            </aside>
          `,
        )}

        <sl-button
          variant="primary"
          size="small"
          ?loading=${this.isSubmitting}
          ?disabled=${this.isSubmitting}
          @click=${async () => {
            // Using submit method instead of type="submit" fixes
            // incorrect getRootNode in Chrome
            const form = await this.form;
            const submitInput = form.querySelector<HTMLInputElement>(
              'input[type="submit"]',
            );
            form.requestSubmit(submitInput);
          }}
          >${this.collection
            ? msg("Save")
            : msg("Create Collection")}</sl-button
        >
      </div>
    </btrix-dialog>`;
  }

  private async hideDialog() {
    void (await this.form).closest<Dialog>("btrix-dialog")!.hide();
  }

  private onReset() {
    void this.hideDialog();
  }

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    event.stopPropagation();

    const form = event.target as HTMLFormElement;
    const nameInput = form.querySelector<SlInput>('sl-input[name="name"]');
    if (!nameInput?.checkValidity()) {
      return;
    }

    const { name, description, isPublic } = serialize(form);
    this.isSubmitting = true;
    try {
      const body = JSON.stringify({
        name,
        description,
        isPublic: Boolean(isPublic),
      });
      let path = `/orgs/${this.orgId}/collections`;
      let method = "POST";
      if (this.collection) {
        path = `/orgs/${this.orgId}/collections/${this.collection.id}`;
        method = "PATCH";
      }
      const data = await this.apiFetch<Collection>(path, this.authState!, {
        method,
        body,
      });

      this.dispatchEvent(
        new CustomEvent("btrix-collection-saved", {
          detail: {
            id: this.collection?.id || data.id,
          },
        }) as CollectionSavedEvent,
      );
      this.notify({
        message: msg(
          str`Successfully saved "${data.name || name}" Collection.`,
        ),
        variant: "success",
        icon: "check2-circle",
      });
      void this.hideDialog();
    } catch (e) {
      let message = isApiError(e) && e.message;
      if (message === "collection_name_taken") {
        message = msg("This name is already taken.");
      }
      this.notify({
        message: message || msg("Something unexpected went wrong"),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmitting = false;
  }

  /**
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: CustomEvent) {
    e.stopPropagation();
  }
}
