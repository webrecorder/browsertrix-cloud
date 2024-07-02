import { localized, msg, str } from "@lit/localize";
import { css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { columns } from "../ui/columns";

import { TailwindElement } from "@/classes/TailwindElement";
import { SubscriptionStatus, type Subscription } from "@/types/billing";
import type { OrgQuotas } from "@/types/org";
import { formatBytes, formatNumber } from "@/utils/localization";

@localized()
@customElement("btrix-org-settings-billing")
export class OrgSettingsBilling extends TailwindElement {
  static styles = css`
    .form-label {
      font-size: var(--sl-input-label-font-size-small);
    }
  `;

  @property({ type: Object })
  subscription?: Subscription;

  @property({ type: Object })
  quotas?: OrgQuotas;

  @property({ type: String, noAccessor: true })
  salesEmail?: string;

  get manageLinkLabel() {
    let label = msg("Contact Sales");

    if (this.subscription?.portalUrl) {
      switch (this.subscription.status) {
        case SubscriptionStatus.PausedPaymentFailed: {
          label = msg("Update Billing");
          break;
        }
        case SubscriptionStatus.Cancelled: {
          label = msg("Choose Plan");
          break;
        }
        default: {
          label = msg("Manage Plan");
          break;
        }
      }
    }

    return label;
  }

  render() {
    return html`
      <div class="rounded-lg border">
        ${columns([
          [
            html`
              <h4 class="form-label text-neutral-800">
                ${msg("Current Plan")}
              </h4>
              <btrix-card>
                <div slot="title" class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    ${when(this.subscription, this.renderPlanDetails)}
                  </div>
                  ${when(
                    this.subscription?.portalUrl ||
                      (this.salesEmail && `mailto:${this.salesEmail}`),
                    (href) => html`
                      <a
                        class="transition-color flex items-center gap-2 px-2 py-1 text-sm leading-none text-primary hover:text-primary-500"
                        href=${href}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                      >
                        ${this.manageLinkLabel}
                        <sl-icon slot="suffix" name="arrow-right"></sl-icon>
                      </a>
                    `,
                  )}
                </div>
                ${when(
                  this.quotas,
                  (quotas) => html`
                    <ul class="leading-relaxed text-neutral-700">
                      <li>
                        ${msg(
                          str`${quotas.maxPagesPerCrawl ? formatNumber(quotas.maxPagesPerCrawl) : msg("Unlimited")} pages per crawl`,
                        )}
                      </li>
                      <li>
                        ${msg(
                          str`${quotas.storageQuota ? formatBytes(quotas.storageQuota) : msg("Unlimited")} base disk space`,
                        )}
                      </li>
                      <li>
                        ${msg(
                          str`${quotas.maxConcurrentCrawls ? formatNumber(quotas.maxConcurrentCrawls) : msg("Unlimited")} concurrent crawls`,
                        )}
                      </li>
                      <li>
                        ${msg(
                          str`${quotas.maxExecMinutesPerMonth ? formatNumber(quotas.maxExecMinutesPerMonth) : msg("Unlimited")} minutes of base crawling time per month`,
                        )}
                      </li>
                    </ul>
                  `,
                )}
              </btrix-card>
            `,
            html`
              <p class="mb-3">
                ${msg(
                  "Hosted plan status, features, and add-ons, if applicable.",
                )}
              </p>
              ${when(
                this.subscription,
                (sub) => html`
                  <p class="leading-normal">
                    ${sub.status
                      ? msg(
                          str`You can view plan details, update payment methods, and update billing information by clicking “${this.manageLinkLabel}”. This will redirect you to our payment processor in a new tab.`,
                        )
                      : msg(
                          str`Contact us at ${this.salesEmail} to make changes to your plan.`,
                        )}
                  </p>
                `,
              )}
            `,
          ],
        ])}
      </div>
    `;
  }

  private readonly renderPlanDetails = (subscription: Subscription) => {
    let tierLabel;
    let statusLabel;

    if (subscription.portalUrl) {
      tierLabel = html`
        <sl-icon class="text-neutral-500" name="nut"></sl-icon>
        ${msg("Starter")}
      `;

      switch (subscription.status) {
        case SubscriptionStatus.Active: {
          statusLabel = html`
            <span class="text-success-700">${msg("Active")}</span>
          `;
          break;
        }
        case SubscriptionStatus.PausedPaymentFailed: {
          statusLabel = html`
            <span class="text-warning-600">
              ${msg("Paused due to failed payment")}
            </span>
          `;
          break;
        }
        case SubscriptionStatus.Cancelled: {
          statusLabel = html`
            <span class="text-danger-700">${msg("Canceled")}</span>
          `;
          break;
        }
        default:
          break;
      }
    } else {
      tierLabel = html`
        <sl-icon class="text-neutral-500" name="rocket-takeoff"></sl-icon>
        ${msg("Pro")}
      `;
    }

    return html`${tierLabel}${statusLabel
      ? html`<hr class="h-5 border-l" aria-orientation="vertical" />
          <span class="text-sm font-medium">${statusLabel}</span>`
      : nothing}`;
  };
}
