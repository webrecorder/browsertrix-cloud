import { localized, msg, str } from "@lit/localize";
import type { SlInput } from "@shoelace-style/shoelace";
import { type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

import type { CurrentUser, UserOrg } from "@/types/user";
import LiteElement, { html } from "@/utils/LiteElement";
import type { OrgData } from "@/utils/orgs";

@localized()
@customElement("btrix-orgs-list")
export class OrgsList extends LiteElement {
  @property({ type: Object })
  userInfo?: CurrentUser;

  @property({ type: Array })
  orgList?: OrgData[] = [];

  @property({ type: Boolean })
  skeleton? = false;

  @property({ type: Object })
  currOrg?: OrgData | null = null;

  render() {
    if (this.skeleton) {
      return this.renderSkeleton();
    }

    const defaultOrg = this.userInfo?.orgs.find((org) => org.default === true);

    return html`
      <ul class="overflow-hidden rounded-lg border">
        ${this.orgList?.map(this.renderOrg(defaultOrg))}
        ${this.renderOrgQuotas()}
      </ul>
    `;
  }

  private renderOrgQuotas() {
    if (!this.currOrg) {
      return html``;
    }

    return html`
      <btrix-dialog
        .label=${msg(str`Quotas for: ${this.currOrg.name}`)}
        .open=${!!this.currOrg}
        @sl-request-close=${() => (this.currOrg = null)}
      >
        ${Object.entries(this.currOrg.quotas).map(([key, value]) => {
          let label;
          switch (key) {
            case "maxConcurrentCrawls":
              label = msg("Max Concurrent Crawls");
              break;
            case "maxPagesPerCrawl":
              label = msg("Max Pages Per Crawl");
              break;
            case "storageQuota":
              label = msg("Org Storage Quota (GB)");
              value = Math.floor(value / 1e9);
              break;
            case "maxExecMinutesPerMonth":
              label = msg("Max Execution Minutes Per Month");
              break;
            case "extraExecMinutes":
              label = msg("Extra Execution Minutes");
              break;
            case "giftedExecMinutes":
              label = msg("Gifted Execution Minutes");
              break;
            default:
              label = msg("Unlabeled");
          }
          return html` <sl-input
            name=${key}
            label=${label}
            value=${value}
            type="number"
            @sl-input="${this.onUpdateQuota}"
          ></sl-input>`;
        })}
        <div slot="footer" class="flex justify-end">
          <sl-button
            size="small"
            @click="${this.onSubmitQuotas}"
            variant="primary"
            >${msg("Update Quotas")}
          </sl-button>
        </div>
      </btrix-dialog>
    `;
  }

  private onUpdateQuota(e: CustomEvent) {
    const inputEl = e.target as SlInput;
    const name = inputEl.name as keyof OrgData["quotas"];
    const quotas = this.currOrg?.quotas;
    if (quotas) {
      if (name === "storageQuota") {
        quotas[name] = Number(inputEl.value) * 1e9;
      } else {
        quotas[name] = Number(inputEl.value);
      }
    }
  }

  private onSubmitQuotas() {
    if (this.currOrg) {
      this.dispatchEvent(
        new CustomEvent("update-quotas", { detail: this.currOrg }),
      );
    }
    this.currOrg = null;
  }

  private showQuotas(org: OrgData) {
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.currOrg = org;
      return false;
    };

    return stop;
  }

  private readonly renderOrg = (defaultOrg?: UserOrg) => (org: OrgData) => {
    if (!this.userInfo) return;

    // There shouldn't really be a case where an org is in the org list but
    // not in user info, but disable clicking into the org just in case
    const isUserOrg = this.userInfo.orgs.some(({ id }) => id === org.id);

    let defaultLabel: TemplateResult | undefined;

    if (defaultOrg && org.id === defaultOrg.id) {
      defaultLabel = html`<sl-tag size="small" variant="primary" class="mr-2"
        >${msg("Default")}</sl-tag
      >`;
    }
    const memberCount = Object.keys(org.users || {}).length;

    return html`
      <li
        class="${isUserOrg
          ? ""
          : "select-none cursor-not-allowed opacity-50"} flex items-center justify-between border-t bg-white p-3 text-primary first:border-t-0 hover:text-indigo-400"
        role="button"
        @click=${this.makeOnOrgClick(org)}
        aria-disabled="${isUserOrg}"
      >
        <div class="mr-2 font-medium transition-colors">
          ${defaultLabel}${org.name}
        </div>
        <div class="flex flex-row items-center">
          <div class="text-s font-monostyle mr-4 text-neutral-400">
            ${memberCount === 1
              ? msg(`1 member`)
              : msg(str`${memberCount} members`)}
          </div>
          <sl-icon-button
            name="gear"
            slot="prefix"
            label=${msg("Edit org quotas")}
            @click="${this.showQuotas(org)}"
          ></sl-icon-button>
        </div>
      </li>
    `;
  };

  private renderSkeleton() {
    return html`
      <div class="overflow-hidden rounded-lg border">
        <div class="border-t bg-white p-3 text-primary first:border-t-0 md:p-6">
          <sl-skeleton class="h-6 w-80"></sl-skeleton>
        </div>
      </div>
    `;
  }

  private makeOnOrgClick(org: OrgData) {
    const navigate = () => this.navTo(`/orgs/${org.slug}`);

    if (typeof window.getSelection !== "undefined") {
      return () => {
        // Prevent navigation on user text selection
        if (window.getSelection()?.type === "Range") {
          return;
        }

        navigate();
      };
    }

    return navigate;
  }
}
