import { state, property, queryAsync, customElement } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import type { SlInput } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";

import { maxLengthValidator } from "@/utils/form";
import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";
import type { Dialog } from "../dialog";

@localized()
@customElement("btrix-new-collection-dialog")
export class NewCollectionDialog extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: Boolean })
  open = false;

  @state()
  private isSubmitting = false;

  @queryAsync("#collectionForm")
  private form!: Promise<HTMLFormElement>;

  private validateNameMax = maxLengthValidator(50);

  render() {
    return html` <btrix-dialog
      label=${msg(str`Create a New Collection`)}
      ?open=${this.open}
      style="--width: 46rem"
      @sl-initial-focus=${async (e: CustomEvent) => {
        const nameInput = (await this.form).querySelector(
          'sl-input[name="name"]'
        ) as SlInput;
        if (nameInput) {
          e.preventDefault();
          nameInput.focus();
        }
      }}
    >
      <form id="collectionForm" @reset=${this.onReset} @submit=${this.onSubmit}>
        <sl-input
          class="mb-2 with-max-help-text"
          id="collectionForm-name-input"
          name="name"
          label=${msg("Collection Name")}
          placeholder=${msg("My Collection")}
          autocomplete="off"
          required
          help-text=${this.validateNameMax.helpText}
          @sl-input=${this.validateNameMax.validate}
        ></sl-input>

        <fieldset>
          <label class="form-label">${msg("Description")}</label>
          <btrix-markdown-editor
            name="description"
            maxlength=${4000}
          ></btrix-markdown-editor>
        </fieldset>
        <label>
          <sl-switch name="isPublic">${msg("Publicly Accessible")}</sl-switch>
          <sl-tooltip
            content=${msg(
              "Enable public access to make Collections shareable. Only people with the shared link can view your Collection."
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
        <input class="invisible h-0 w-0" type="submit" />
      </form>
      <div slot="footer" class="flex gap-3 items-center justify-end">
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
        <aside class="text-xs text-neutral-500">
          ${msg("You can rename your collection later")}
        </aside>
        <sl-button
          variant="primary"
          size="small"
          ?loading=${this.isSubmitting}
          ?disabled=${this.isSubmitting}
          @click=${async () => {
            // Using submit method instead of type="submit" fixes
            // incorrect getRootNode in Chrome
            const form = await this.form;
            const submitInput = form.querySelector(
              'input[type="submit"]'
            ) as HTMLInputElement;
            form.requestSubmit(submitInput);
          }}
          >${msg("Create Collection")}</sl-button
        >
      </div>
    </btrix-dialog>`;
  }

  private async hideDialog() {
    ((await this.form).closest("btrix-dialog") as Dialog).hide();
  }

  private onReset() {
    this.hideDialog();
  }

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    event.stopPropagation();

    const form = event.target as HTMLFormElement;
    const nameInput = form.querySelector('sl-input[name="name"]') as SlInput;
    if (!nameInput.checkValidity()) {
      return;
    }

    const { name, description, isPublic } = serialize(form);
    this.isSubmitting = true;
    try {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/collections`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify({
            name,
            description,
            isPublic: Boolean(isPublic),
          }),
        }
      );

      this.navTo(`${this.orgBasePath}/collections/edit/${data.id}#crawls`);
      this.notify({
        message: msg(str`Successfully created "${data.name}" Collection.`),
        variant: "success",
        icon: "check2-circle",
      });
      this.hideDialog();
    } catch (e: any) {
      this.notify({
        message:
          (e?.isApiError && e?.message) ||
          msg("Something unexpected went wrong"),
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
