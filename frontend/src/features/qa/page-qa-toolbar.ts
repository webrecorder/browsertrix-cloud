import { localized, msg, str } from "@lit/localize";
import type { SlTextarea } from "@shoelace-style/shoelace";
import { css, html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { keyed } from "lit/directives/keyed.js";
import { when } from "lit/directives/when.js";

import { TailwindElement } from "@/classes/TailwindElement";
import type { Dialog } from "@/components/ui/dialog";
import { APIController } from "@/controllers/api";
import { NotifyController } from "@/controllers/notify";
import type {
  ArchivedItemPage,
  ArchivedItemPageComment,
} from "@/types/crawler";
import { type AuthState } from "@/utils/AuthService";

export type UpdateItemPageDetail = {
  id: ArchivedItemPage["id"];
  approved?: ArchivedItemPage["approved"];
  notes?: ArchivedItemPage["notes"];
};

/**
 * Manage crawl QA page review
 *
 * @fires btrix-update-item-page
 */
@localized()
@customElement("btrix-page-qa-toolbar")
export class PageQAToolbar extends TailwindElement {
  static styles = css`
    :host {
      --btrix-border: 1px solid var(--sl-color-neutral-300);
      --btrix-border-radius: var(--sl-border-radius-medium);
    }

    .btnGroup {
      display: flex;
      align-items: stretch;
      justify-content: stretch;
      outline: var(--btrix-border);
      outline-offset: -1px;
      box-shadow: var(--sl-shadow-x-small);
      border-radius: var(--sl-input-height-small);
      height: var(--sl-input-height-small);
      transition: var(--sl-transition-x-fast) background-color;
    }

    .btnGroup.approved {
      background-color: var(--sl-color-success-500);
    }

    .btnGroup.rejected {
      background-color: var(--sl-color-danger-500);
    }

    .btnGroup.disabled button {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .btnGroup button {
      display: flex;
      align-items: center;
      justify-content: center;
      height: var(--sl-input-height-small);
      width: 4rem;
      border-top: var(--btrix-border);
      border-bottom: var(--btrix-border);
      transition:
        var(--sl-transition-x-fast) background-color,
        var(--sl-transition-x-fast) border,
        var(--sl-transition-x-fast) border-radius,
        var(--sl-transition-x-fast) box-shadow,
        var(--sl-transition-x-fast) transform;
    }

    .btnGroup button:first-of-type {
      border-left: var(--btrix-border);
      border-right: 1px solid transparent;
      border-start-start-radius: var(--sl-input-height-small);
      border-end-start-radius: var(--sl-input-height-small);
    }

    .btnGroup button:nth-of-type(2) {
      border-left: 1px solid transparent;
      border-right: 1px solid transparent;
    }

    .btnGroup button:last-of-type {
      border-left: 1px solid transparent;
      border-right: var(--btrix-border);
      border-start-end-radius: var(--sl-input-height-small);
      border-end-end-radius: var(--sl-input-height-small);
    }

    .rate.active {
      color: var(--sl-color-neutral-0);
    }

    .rate.active:hover {
      background-color: rgba(255, 255, 255, 0.15);
    }

    .rate:not(.active),
    .comment {
      background-color: var(--sl-color-neutral-0);
    }

    .btnGroup:not(.disabled) .rate:not(.active):hover {
      border: var(--btrix-border);
      box-shadow: var(--sl-shadow-x-small);
      transform: scale(1.1);
    }

    .rate:first-of-type:not(.active):hover {
      border-start-end-radius: var(--sl-border-radius-large);
      border-end-end-radius: var(--sl-border-radius-large);
    }

    .rate:last-of-type:not(.active):hover {
      border-start-start-radius: var(--sl-border-radius-large);
      border-end-start-radius: var(--sl-border-radius-large);
    }

    .btnGroup:not(.disabled) .approve:not(.active):hover sl-icon {
      color: var(--sl-color-success-500);
    }

    .btnGroup:not(.disabled) .reject:not(.active):hover sl-icon {
      color: var(--sl-color-danger-500);
    }

    .btnGroup:not(.disabled) .comment:hover sl-icon {
      transform: scale(1.1);
      color: var(--sl-color-blue-500);
    }

    .comment.active sl-icon {
      color: var(--sl-color-blue-500);
    }

    .btnGroup:has(button.active:first-of-type) button:nth-of-type(2) {
      border-left: var(--btrix-border);
      border-start-start-radius: var(--btrix-border-radius);
      border-end-start-radius: var(--btrix-border-radius);
    }

    .btnGroup:has(button.active:last-of-type) button:nth-of-type(2) {
      border-right: var(--btrix-border);
      border-start-end-radius: var(--btrix-border-radius);
      border-end-end-radius: var(--btrix-border-radius);
    }

    .btnGroup button:nth-of-type(2) {
      border-left: var(--btrix-border);
      border-right: var(--btrix-border);
    }

    .btnGroup sl-icon {
      font-size: var(--font-size-base);
      transition:
        var(--sl-transition-x-fast) color,
        var(--sl-transition-x-fast) transform;
    }
  `;

  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  orgId?: string;

  @property({ type: String })
  itemId?: string;

  @property({ type: String })
  pageId?: string;

  @property({ type: Object })
  page?: ArchivedItemPage;

  @state()
  private showComments = false;

  @query("btrix-dialog")
  private readonly dialog!: Dialog;

  @query('sl-textarea[name="pageComment"]')
  private readonly textarea!: SlTextarea;

  private readonly api = new APIController(this);
  private readonly notify = new NotifyController(this);

  render() {
    const disabled = !this.page;
    const approved = this.page?.approved === true;
    const rejected = this.page?.approved === false;
    const commented = Boolean(this.page?.notes?.length);

    return html`
      <fieldset
        class=${classMap({
          btnGroup: true,
          approved: approved,
          commented: commented,
          rejected: rejected,
          disabled: disabled,
        })}
        aria-label=${msg("QA rating")}
        ?disabled=${disabled}
      >
        <button
          class=${classMap({
            rate: true,
            approve: true,
            active: approved,
          })}
          aria-checked=${approved}
          ?disabled=${disabled}
          @click=${async () =>
            this.submitReview({ approved: approved ? null : true })}
        >
          <sl-icon name="hand-thumbs-up" label=${msg("Approve")}></sl-icon>
        </button>
        <button
          role="checkbox"
          class=${classMap({
            comment: true,
            active: commented,
          })}
          aria-checked=${commented}
          ?disabled=${disabled}
          @click=${() => (this.showComments = true)}
        >
          <sl-icon name="chat-square-text" label=${msg("Comment")}></sl-icon>
        </button>
        <button
          class=${classMap({
            rate: true,
            reject: true,
            active: rejected,
          })}
          aria-checked=${rejected}
          ?disabled=${disabled}
          @click=${async () =>
            this.submitReview({ approved: rejected ? null : false })}
        >
          <sl-icon name="hand-thumbs-down" label=${msg("Reject")}></sl-icon>
        </button>
      </fieldset>

      <btrix-dialog
        label=${msg("Page Review Comments")}
        ?open=${this.showComments}
        @sl-hide=${() => (this.showComments = false)}
      >
        ${keyed(this.showComments, this.renderComments())}
        </p>
        <sl-button
          slot="footer"
          size="small"
          variant="primary"
          @click=${() => this.dialog.submit()}
        >
          ${msg("Submit Comment")}
        </sl-button>
      </btrix-dialog>
    `;
  }

  private renderComments() {
    const comments = this.page?.notes || [];
    return html`
      ${when(
        comments.length,
        () => html`
          <btrix-details>
            <span slot="title"
              >${msg(str`Comments (${comments.length.toLocaleString()})`)}</span
            >
            ${when(
              this.page?.notes,
              (notes) => html`
                <ul>
                  ${notes.map(
                    (comment) =>
                      html`<li class="mb-3">
                        <div
                          class="flex items-center justify-between rounded-t border bg-neutral-50 text-xs leading-none text-neutral-600"
                        >
                          <div class="p-2">
                            ${msg(
                              str`${comment.userName} commented on ${new Date(comment.created + "Z").toLocaleDateString()}`,
                            )}
                          </div>
                          <sl-icon-button
                            class="hover:text-danger"
                            name="trash3"
                            @click=${async () => this.deleteComment(comment.id)}
                          ></sl-icon-button>
                        </div>
                        <div class="rounded-b border-b border-l border-r p-2">
                          ${comment.text}
                        </div>
                      </li> `,
                  )}
                </ul>
              `,
              () => html`
                <p class="text-neutral-500">
                  ${msg("This page doesn't have any comments.")}
                </p>
              `,
            )}
          </btrix-details>
        `,
      )}
      <form @submit=${this.onSubmitComment}>
        <sl-textarea
          name="pageComment"
          label=${msg("Add a comment")}
          placeholder=${msg("Enter page feedback")}
          minlength="1"
          maxlength="500"
        ></sl-textarea>
      </form>
    `;
  }

  private async submitReview({
    approved,
  }: {
    approved: ArchivedItemPage["approved"];
  }) {
    if (!this.page) return;

    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/crawls/${this.itemId}/pages/${this.page.id}`,
        this.authState!,
        {
          method: "PATCH",
          body: JSON.stringify({ approved }),
        },
      );

      this.dispatchPageUpdate({ approved });
    } catch (e: unknown) {
      console.debug(e);
      this.notify.toast({
        message: msg("Sorry, couldn't submit page review at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async onSubmitComment(e: SubmitEvent) {
    e.preventDefault();
    const value = this.textarea.value;

    if (!value) return;

    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/crawls/${this.itemId}/pages/${this.pageId}/notes`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify({ text: value }),
        },
      );

      this.showComments = false;

      const comment: ArchivedItemPageComment = {
        id: "",
        created: "",
        modified: "",
        userName: "",
        text: value,
      };
      void this.dispatchPageUpdate({
        notes: this.page?.notes ? [...this.page.notes, comment] : [comment],
      });
    } catch (e: unknown) {
      console.debug(e);

      this.notify.toast({
        message: msg("Sorry, couldn't add comment at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async deleteComment(commentId: string): Promise<void> {
    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/crawls/${this.itemId}/pages/${this.pageId}/notes/delete`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify({ delete_list: [commentId] }),
        },
      );

      void this.dispatchPageUpdate({
        notes: this.page?.notes?.filter(({ id }) => id === commentId) || [],
      });
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't delete comment at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async dispatchPageUpdate(page: Partial<UpdateItemPageDetail>) {
    if (!this.pageId) return;

    this.dispatchEvent(
      new CustomEvent<UpdateItemPageDetail>("btrix-update-item-page", {
        detail: {
          id: this.pageId,
          ...page,
        },
      }),
    );
  }
}
