import { localized, msg, str } from "@lit/localize";
import type { SlCheckbox } from "@shoelace-style/shoelace";
import { nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { guard } from "lit/directives/guard.js";
import { repeat } from "lit/directives/repeat.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import type { PageChangeEvent } from "@/components/ui/pagination";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import type { Collection } from "@/types/collection";
import type { ArchivedItem, Crawl, CrawlState, Upload } from "@/types/crawler";
import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";

const ABORT_REASON_THROTTLE = "throttled";
const DESCRIPTION_MAX_HEIGHT_PX = 200;
const INITIAL_ITEMS_PAGE_SIZE = 20;
const TABS = ["replay", "items"] as const;
export type Tab = (typeof TABS)[number];

@localized()
@customElement("btrix-collection-detail")
export class CollectionDetail extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  userId!: string;

  @property({ type: String })
  collectionId!: string;

  @property({ type: String })
  collectionTab?: Tab = TABS[0];

  @property({ type: Boolean })
  isCrawler?: boolean;

  @state()
  private collection?: Collection;

  @state()
  private archivedItems?: APIPaginatedList<ArchivedItem>;

  @state()
  private openDialogName?: "delete" | "editMetadata" | "editItems";

  @state()
  private isDescriptionExpanded = false;

  @state()
  private showShareInfo = false;

  // Use to cancel requests
  private getArchivedItemsController: AbortController | null = null;

  // TODO localize
  private readonly numberFormatter = new Intl.NumberFormat(undefined, {
    notation: "compact",
  });

  private readonly tabLabels: Record<
    Tab,
    { icon: { name: string; library: string }; text: string }
  > = {
    replay: {
      icon: { name: "link-replay", library: "app" },
      text: msg("Replay"),
    },
    items: {
      icon: { name: "list-ul", library: "default" },
      text: msg("Archived Items"),
    },
  };

  protected async willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("orgId")) {
      this.collection = undefined;
      void this.fetchCollection();
    }
    if (changedProperties.has("collectionId")) {
      void this.fetchArchivedItems({ page: 1 });
    }
  }

  protected async updated(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ) {
    if (changedProperties.has("collection") && this.collection) {
      void this.checkTruncateDescription();
    }
  }

  render() {
    return html`${this.renderHeader()}
      <header class="items-center gap-2 pb-3 md:flex">
        <div class="mb-2 flex w-full items-center gap-2 md:mb-0">
          ${this.collection?.isPublic
            ? html`
                <sl-tooltip content=${msg("Shareable")}>
                  <sl-icon
                    class="text-lg text-success-600"
                    name="people-fill"
                  ></sl-icon>
                </sl-tooltip>
              `
            : html`
                <sl-tooltip content=${msg("Private")}>
                  <sl-icon class="text-lg" name="eye-slash-fill"></sl-icon>
                </sl-tooltip>
              `}
          <h1 class="min-w-0 flex-1 truncate text-xl font-semibold leading-7">
            ${this.collection?.name ||
            html`<sl-skeleton class="w-96"></sl-skeleton>`}
          </h1>
        </div>
        ${when(
          this.isCrawler || this.collection?.isPublic,
          () => html`
            <sl-button
              variant=${this.collection?.crawlCount ? "primary" : "default"}
              size="small"
              @click=${() => (this.showShareInfo = true)}
            >
              <sl-icon name="box-arrow-up" slot="prefix"></sl-icon>
              ${msg("Share")}
            </sl-button>
          `,
        )}
        ${when(this.isCrawler, this.renderActions)}
      </header>
      <div class="mb-3 rounded-lg border px-4 py-2">
        ${this.renderInfoBar()}
      </div>
      <div class="mb-3 flex items-center justify-between">
        ${this.renderTabs()}
        ${when(
          this.isCrawler,
          () => html`
            <sl-button
              variant=${!this.collection || this.collection.crawlCount
                ? "default"
                : "primary"}
              size="small"
              @click=${() => (this.openDialogName = "editItems")}
              ?disabled=${!this.collection}
            >
              <sl-icon name="ui-checks" slot="prefix"></sl-icon>
              ${msg("Select Items")}
            </sl-button>
          `,
        )}
      </div>
      ${choose(
        this.collectionTab,
        [
          ["replay", () => guard([this.collection], this.renderReplay)],
          [
            "items",
            () => guard([this.archivedItems], this.renderArchivedItems),
          ],
        ],

        () => html`<btrix-not-found></btrix-not-found>`,
      )}
      <div class="my-7">${this.renderDescription()}</div>

      <btrix-dialog
        label=${msg("Delete Collection?")}
        ?open=${this.openDialogName === "delete"}
        @sl-hide=${() => (this.openDialogName = undefined)}
      >
        ${msg(
          html`Are you sure you want to delete
            <strong>${this.collection?.name}</strong>?`,
        )}
        <div slot="footer" class="flex justify-between">
          <sl-button
            size="small"
            @click=${() => (this.openDialogName = undefined)}
            >${msg("Cancel")}</sl-button
          >
          <sl-button
            size="small"
            variant="primary"
            @click=${async () => {
              await this.deleteCollection();
              this.openDialogName = undefined;
            }}
            >${msg("Delete Collection")}</sl-button
          >
        </div>
      </btrix-dialog>
      <btrix-collection-items-dialog
        orgId=${this.orgId}
        userId=${this.userId}
        collectionId=${this.collectionId}
        collectionName=${this.collection?.name || ""}
        .authState=${this.authState}
        ?isCrawler=${this.isCrawler}
        ?open=${this.openDialogName === "editItems"}
        @sl-hide=${() => (this.openDialogName = undefined)}
        @btrix-collection-saved=${() => {
          void this.fetchCollection();
          void this.fetchArchivedItems();
        }}
      >
      </btrix-collection-items-dialog>
      ${when(
        this.collection,
        () => html`
          <btrix-collection-metadata-dialog
            orgId=${this.orgId}
            .authState=${this.authState}
            .collection=${this.collection!}
            ?open=${this.openDialogName === "editMetadata"}
            @sl-hide=${() => (this.openDialogName = undefined)}
            @btrix-collection-saved=${() => void this.fetchCollection()}
          >
          </btrix-collection-metadata-dialog>
        `,
      )}
      ${this.renderShareDialog()}`;
  }

  private getPublicReplayURL() {
    return new URL(
      `/api/orgs/${this.orgId}/collections/${this.collectionId}/public/replay.json`,
      window.location.href,
    ).href;
  }

  private renderShareDialog() {
    return html`
      <btrix-dialog
        .label=${msg("Share Collection")}
        .open=${this.showShareInfo}
        @sl-hide=${() => (this.showShareInfo = false)}
        style="--width: 32rem;"
      >
        ${
          this.collection?.isPublic
            ? ""
            : html`<p class="mb-3">
                ${msg(
                  "Make this collection shareable to enable a public viewing link.",
                )}
              </p>`
        }
        ${when(
          this.isCrawler,
          () => html`
            <div class="mb-5">
              <sl-switch
                ?checked=${this.collection?.isPublic}
                @sl-change=${(e: CustomEvent) =>
                  void this.onTogglePublic((e.target as SlCheckbox).checked)}
                >${msg("Collection is Shareable")}</sl-switch
              >
            </div>
          `,
        )}
        </div>
        ${when(this.collection?.isPublic, this.renderShareInfo)}
        <div slot="footer" class="flex justify-end">
          <sl-button size="small" @click=${() => (this.showShareInfo = false)}
            >${msg("Done")}</sl-button
          >
        </div>
      </btrix-dialog>
    `;
  }

  private readonly renderShareInfo = () => {
    const replaySrc = this.getPublicReplayURL();
    const encodedReplaySrc = encodeURIComponent(replaySrc);
    const publicReplayUrl = `https://replayweb.page?source=${encodedReplaySrc}`;
    const embedCode = `<replay-web-page source="${replaySrc}"></replay-web-page>`;
    const importCode = `importScripts("https://replayweb.page/sw.js");`;

    return html` <btrix-section-heading
        >${msg("Link to Share")}</btrix-section-heading
      >
      <section class="mb-5 mt-3">
        <p class="mb-3">
          ${msg("This collection can be viewed by anyone with the link.")}
        </p>

        <btrix-copy-field
          class="mb-2"
          .value="${publicReplayUrl}"
          hideContentFromScreenReaders
        >
          <sl-tooltip slot="prefix" content=${msg("Open in New Tab")}>
            <sl-icon-button
              href=${publicReplayUrl}
              name="box-arrow-up-right"
              target="_blank"
            >
            </sl-icon-button>
          </sl-tooltip>
        </btrix-copy-field>
      </section>
      <btrix-section-heading>${msg("Embed Collection")}</btrix-section-heading>
      <section class="mt-3">
        <p class="mb-3">
          ${msg(
            html`Share this collection by embedding it into an existing webpage.`,
          )}
        </p>
        <p class="mb-3">
          ${msg(html`Add the following embed code to your HTML page:`)}
        </p>
        <div class="relative mb-5 rounded border bg-slate-50 p-3 pr-9">
          <btrix-code value=${embedCode}></btrix-code>
          <div
            class="absolute right-1.5 top-1.5 rounded border bg-white shadow-sm"
          >
            <btrix-copy-button
              .getValue=${() => embedCode}
              content=${msg("Copy Embed Code")}
            ></btrix-copy-button>
          </div>
        </div>
        <p class="mb-3">
          ${msg(
            html`Add the following JavaScript to your
              <code class="text-[0.9em]">/replay/sw.js</code>:`,
          )}
        </p>
        <div class="relative mb-5 rounded border bg-slate-50 p-3 pr-9">
          <btrix-code language="javascript" value=${importCode}></btrix-code>
          <div
            class="absolute right-1.5 top-1.5 rounded border bg-white shadow-sm"
          >
            <btrix-copy-button
              .getValue=${() => importCode}
              content=${msg("Copy JS")}
            ></btrix-copy-button>
          </div>
        </div>
        <p>
          ${msg(
            html`See
              <a
                class="text-primary"
                href="https://replayweb.page/docs/embedding"
                target="_blank"
              >
                our embedding guide</a
              >
              for more details.`,
          )}
        </p>
      </section>`;
  };

  private readonly renderHeader = () => html`
    <nav class="mb-7">
      <a
        class="text-sm font-medium text-gray-600 hover:text-gray-800"
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

  private readonly renderTabs = () => {
    return html`
      <nav class="flex gap-2">
        ${TABS.map((tabName) => {
          const isSelected = tabName === this.collectionTab;
          return html`
            <btrix-navigation-button
              .active=${isSelected}
              aria-selected="${isSelected}"
              href=${`${this.orgBasePath}/collections/view/${this.collectionId}/${tabName}`}
              @click=${this.navLink}
            >
              <sl-icon
                name=${this.tabLabels[tabName].icon.name}
                library=${this.tabLabels[tabName].icon.library}
              ></sl-icon>
              ${this.tabLabels[tabName].text}</btrix-navigation-button
            >
          `;
        })}
      </nav>
    `;
  };

  private readonly renderActions = () => {
    const authToken = this.authState!.headers.Authorization.split(" ")[1];

    return html`
      <sl-dropdown distance="4">
        <sl-button slot="trigger" size="small" caret
          >${msg("Actions")}</sl-button
        >
        <sl-menu>
          <sl-menu-item @click=${() => (this.openDialogName = "editMetadata")}>
            <sl-icon name="pencil" slot="prefix"></sl-icon>
            ${msg("Edit Metadata")}
          </sl-menu-item>
          <sl-menu-item @click=${() => (this.openDialogName = "editItems")}>
            <sl-icon name="ui-checks" slot="prefix"></sl-icon>
            ${msg("Select Archived Items")}
          </sl-menu-item>
          <sl-divider></sl-divider>
          ${!this.collection?.isPublic
            ? html`
                <sl-menu-item
                  style="--sl-color-neutral-700: var(--success)"
                  @click=${() => void this.onTogglePublic(true)}
                >
                  <sl-icon name="people-fill" slot="prefix"></sl-icon>
                  ${msg("Make Shareable")}
                </sl-menu-item>
              `
            : html`
                <sl-menu-item style="--sl-color-neutral-700: var(--success)">
                  <sl-icon name="box-arrow-up-right" slot="prefix"></sl-icon>
                  <a
                    target="_blank"
                    slot="prefix"
                    href="https://replayweb.page?source=${this.getPublicReplayURL()}"
                  >
                    Visit Shareable URL
                  </a>
                </sl-menu-item>
                <sl-menu-item
                  style="--sl-color-neutral-700: var(--warning)"
                  @click=${() => void this.onTogglePublic(false)}
                >
                  <sl-icon name="eye-slash" slot="prefix"></sl-icon>
                  ${msg("Make Private")}
                </sl-menu-item>
              `}
          <!-- Shoelace doesn't allow "href" on menu items,
              see https://github.com/shoelace-style/shoelace/issues/1351 -->
          <a
            href=${`/api/orgs/${this.orgId}/collections/${this.collectionId}/download?auth_bearer=${authToken}`}
            class="flex items-center gap-2 whitespace-nowrap px-6 py-[0.6rem] hover:bg-neutral-100"
            @click=${(e: MouseEvent) => {
              void (e.target as HTMLAnchorElement)
                .closest("sl-dropdown")
                ?.hide();
            }}
          >
            <sl-icon name="cloud-download" slot="prefix"></sl-icon>
            ${msg("Download Collection")}
          </a>
          <sl-divider></sl-divider>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${this.confirmDelete}
          >
            <sl-icon name="trash3" slot="prefix"></sl-icon>
            ${msg("Delete Collection")}
          </sl-menu-item>
        </sl-menu>
      </sl-dropdown>
    `;
  };

  private renderInfoBar() {
    return html`
      <btrix-desc-list horizontal>
        ${this.renderDetailItem(msg("Archived Items"), (col) =>
          col.crawlCount === 1
            ? msg("1 item")
            : msg(str`${this.numberFormatter.format(col.crawlCount)} items`),
        )}
        ${this.renderDetailItem(
          msg("Total Size"),
          (col) =>
            html`<sl-format-bytes
              value=${col.totalSize || 0}
              display="narrow"
            ></sl-format-bytes>`,
        )}
        ${this.renderDetailItem(msg("Total Pages"), (col) =>
          col.pageCount === 1
            ? msg("1 page")
            : msg(str`${this.numberFormatter.format(col.pageCount)} pages`),
        )}
        ${this.renderDetailItem(
          msg("Last Updated"),
          (col) =>
            html`<sl-format-date
              date=${`${col.modified}Z`}
              month="2-digit"
              day="2-digit"
              year="2-digit"
              hour="2-digit"
              minute="2-digit"
            ></sl-format-date>`,
        )}
      </btrix-desc-list>
    `;
  }

  private renderDetailItem(
    label: string | TemplateResult,
    renderContent: (collection: Collection) => TemplateResult | string,
  ) {
    return html`
      <btrix-desc-list-item label=${label}>
        ${when(
          this.collection,
          () => renderContent(this.collection!),
          () => html`<sl-skeleton class="w-full"></sl-skeleton>`,
        )}
      </btrix-desc-list-item>
    `;
  }

  private renderDescription() {
    return html`
      <section>
        <header class="flex items-center justify-between">
          <h2 class="mb-1 h-8 min-h-fit text-lg font-semibold leading-none">
            ${msg("Description")}
          </h2>
          ${when(
            this.isCrawler,
            () => html`
              <sl-icon-button
                class="text-base"
                name="pencil"
                @click=${() => (this.openDialogName = "editMetadata")}
                label=${msg("Edit description")}
              ></sl-icon-button>
            `,
          )}
        </header>
        <main>
          ${when(
            this.collection,
            () => html`
              <main class="rounded-lg border">
                ${this.collection?.description
                  ? html`<div
                        class="description mx-auto max-w-prose overflow-hidden py-5 transition-all"
                        style=${`max-height: ${DESCRIPTION_MAX_HEIGHT_PX}px`}
                      >
                        <btrix-markdown-viewer
                          value=${this.collection.description}
                        ></btrix-markdown-viewer>
                      </div>
                      <div
                        role="button"
                        class="descriptionExpandBtn hidden border-t p-2 text-right font-medium text-neutral-500 transition-colors hover:bg-neutral-50"
                        @click=${this.toggleTruncateDescription}
                      >
                        <span class="mr-1 inline-block align-middle"
                          >${this.isDescriptionExpanded
                            ? msg("Less")
                            : msg("More")}</span
                        >
                        <sl-icon
                          class="inline-block align-middle text-base"
                          name=${this.isDescriptionExpanded
                            ? "chevron-double-up"
                            : "chevron-double-down"}
                        ></sl-icon>
                      </div> `
                  : html`<div class="p-5 text-center text-neutral-400">
                      ${msg("No description added.")}
                    </div>`}
              </main>
            `,
            () =>
              html`<div
                class="flex items-center justify-center rounded border text-3xl"
                style=${`max-height: ${DESCRIPTION_MAX_HEIGHT_PX}px`}
              >
                <sl-spinner></sl-spinner>
              </div>`,
          )}
        </main>
      </section>
    `;
  }

  private readonly renderArchivedItems = () =>
    html`<section>
      ${when(
        this.archivedItems,
        () => {
          const { items, page, total, pageSize } = this.archivedItems!;
          const hasItems = items.length;
          return html`
            <section>
              ${hasItems
                ? this.renderArchivedItemsList()
                : this.renderEmptyState()}
            </section>
            ${when(
              hasItems || page > 1,
              () => html`
                <footer class="mt-6 flex justify-center">
                  <btrix-pagination
                    page=${page}
                    totalCount=${total}
                    size=${pageSize}
                    @page-change=${async (e: PageChangeEvent) => {
                      await this.fetchArchivedItems({
                        page: e.detail.page,
                      });

                      // Scroll to top of list
                      // TODO once deep-linking is implemented, scroll to top of pushstate
                      this.scrollIntoView({ behavior: "smooth" });
                    }}
                  ></btrix-pagination>
                </footer>
              `,
            )}
          `;
        },
        () => html`
          <div class="my-12 flex w-full items-center justify-center text-2xl">
            <sl-spinner></sl-spinner>
          </div>
        `,
      )}
    </section>`;

  private renderArchivedItemsList() {
    if (!this.archivedItems) return;

    return html`
      <btrix-archived-item-list>
        <btrix-table-header-cell slot="actionCell" class="px-1">
          <span class="sr-only">${msg("Row actions")}</span>
        </btrix-table-header-cell>
        ${repeat(
          this.archivedItems.items,
          ({ id }) => id,
          this.renderArchivedItem,
        )}
      </btrix-archived-item-list>
    `;
  }

  private renderEmptyState() {
    return html`
      <div class="rounded border p-5">
        <p class="text-center text-neutral-500">
          ${this.archivedItems?.page && this.archivedItems.page > 1
            ? msg("Page not found.")
            : msg("This Collection doesn’t have any archived items, yet.")}
        </p>
      </div>
    `;
  }

  private readonly renderArchivedItem = (
    item: ArchivedItem,
    idx: number,
  ) => html`
    <btrix-archived-item-list-item
      href=${`/orgs/${this.appState.orgSlug}/items/${item.type}/${item.id}?collectionId=${this.collectionId}`}
      .item=${item}
    >
      <btrix-crawl-status
        slot="namePrefix"
        state=${item.state}
        hideLabel
        ?isUpload=${item.type === "upload"}
      ></btrix-crawl-status>
      ${this.isCrawler
        ? html`
            <btrix-table-cell slot="actionCell" class="px-1">
              <btrix-overflow-dropdown
                @click=${(e: MouseEvent) => {
                  // Prevent navigation to detail view
                  e.preventDefault();
                  e.stopImmediatePropagation();
                }}
              >
                <sl-menu>
                  <sl-menu-item
                    style="--sl-color-neutral-700: var(--warning)"
                    @click=${() => void this.removeArchivedItem(item.id, idx)}
                  >
                    <sl-icon name="folder-minus" slot="prefix"></sl-icon>
                    ${msg("Remove from Collection")}
                  </sl-menu-item>
                </sl-menu>
              </btrix-overflow-dropdown>
            </btrix-table-cell>
          `
        : nothing}
    </btrix-archived-item-list-item>
  `;

  private readonly renderReplay = () => {
    if (!this.collection?.crawlCount) {
      return this.renderEmptyState();
    }

    const replaySource = `/api/orgs/${this.orgId}/collections/${this.collectionId}/replay.json`;
    const headers = this.authState?.headers;
    const config = JSON.stringify({ headers });

    return html`<section>
      <main>
        <div class="aspect-4/3 overflow-hidden rounded-lg border">
          <replay-web-page
            source=${replaySource}
            replayBase="/replay/"
            config="${config}"
            noSandbox="true"
            noCache="true"
          ></replay-web-page>
        </div>
      </main>
    </section>`;
  };

  private async checkTruncateDescription() {
    await this.updateComplete;
    window.requestAnimationFrame(() => {
      const description = this.querySelector<HTMLElement>(".description");
      if (description?.scrollHeight ?? 0 > (description?.clientHeight ?? 0)) {
        this.querySelector(".descriptionExpandBtn")?.classList.remove("hidden");
      }
    });
  }

  private readonly toggleTruncateDescription = () => {
    const description = this.querySelector<HTMLElement>(".description");
    if (!description) {
      console.debug("no .description");
      return;
    }
    this.isDescriptionExpanded = !this.isDescriptionExpanded;
    if (this.isDescriptionExpanded) {
      description.style.maxHeight = `${description.scrollHeight}px`;
    } else {
      description.style.maxHeight = `${DESCRIPTION_MAX_HEIGHT_PX}px`;
      description.closest("section")?.scrollIntoView({
        behavior: "smooth",
      });
    }
  };

  private async onTogglePublic(isPublic: boolean) {
    const res = await this.apiFetch<{ updated: boolean }>(
      `/orgs/${this.orgId}/collections/${this.collectionId}`,
      this.authState!,
      {
        method: "PATCH",
        body: JSON.stringify({ isPublic }),
      },
    );

    if (res.updated && this.collection) {
      this.collection = { ...this.collection, isPublic };
    }
  }

  private readonly confirmDelete = () => {
    this.openDialogName = "delete";
  };

  private async deleteCollection(): Promise<void> {
    if (!this.collection) return;

    try {
      const name = this.collection.name;
      const _data: Crawl | Upload = await this.apiFetch(
        `/orgs/${this.orgId}/collections/${this.collection.id}`,
        this.authState!,
        {
          method: "DELETE",
        },
      );

      this.navTo(`${this.orgBasePath}/collections`);

      this.notify({
        message: msg(html`Deleted <strong>${name}</strong> Collection.`),
        variant: "success",
        icon: "check2-circle",
      });
    } catch {
      this.notify({
        message: msg("Sorry, couldn't delete Collection at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async fetchCollection() {
    try {
      this.collection = await this.getCollection();
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve Collection at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCollection() {
    const data = await this.apiFetch<Collection>(
      `/orgs/${this.orgId}/collections/${this.collectionId}/replay.json`,
      this.authState!,
    );

    return data;
  }

  /**
   * Fetch web captures and update internal state
   */
  private async fetchArchivedItems(params?: APIPaginationQuery): Promise<void> {
    this.cancelInProgressGetArchivedItems();
    try {
      this.archivedItems = await this.getArchivedItems(params);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        console.debug("Fetch web captures aborted to throttle");
      } else {
        this.notify({
          message: msg("Sorry, couldn't retrieve web captures at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private cancelInProgressGetArchivedItems() {
    if (this.getArchivedItemsController) {
      this.getArchivedItemsController.abort(ABORT_REASON_THROTTLE);
      this.getArchivedItemsController = null;
    }
  }

  private async getArchivedItems(
    params?: Partial<{
      state: CrawlState[];
    }> &
      APIPaginationQuery &
      APISortQuery,
  ) {
    const query = queryString.stringify(
      {
        ...params,
        page: params?.page || this.archivedItems?.page || 1,
        pageSize:
          params?.pageSize ||
          this.archivedItems?.pageSize ||
          INITIAL_ITEMS_PAGE_SIZE,
      },
      {
        arrayFormat: "comma",
      },
    );
    const data = await this.apiFetch<APIPaginatedList<Crawl | Upload>>(
      `/orgs/${this.orgId}/all-crawls?collectionId=${this.collectionId}&${query}`,
      this.authState!,
    );

    return data;
  }

  private async removeArchivedItem(id: string, _pageIndex: number) {
    try {
      await this.apiFetch(
        `/orgs/${this.orgId}/collections/${this.collectionId}/remove`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify({ crawlIds: [id] }),
        },
      );

      const { page, items } = this.archivedItems!;

      this.notify({
        message: msg(str`Successfully removed item from Collection.`),
        variant: "success",
        icon: "check2-circle",
      });
      void this.fetchCollection();
      void this.fetchArchivedItems({
        // Update page if last item
        page: items.length === 1 && page > 1 ? page - 1 : page,
      });
    } catch (e) {
      console.debug((e as Error | undefined)?.message);
      this.notify({
        message: msg(
          "Sorry, couldn't remove item from Collection at this time.",
        ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }
}
