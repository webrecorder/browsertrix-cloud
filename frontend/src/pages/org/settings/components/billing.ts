import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import { css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { columns } from "../ui/columns";

import { TailwindElement } from "@/classes/TailwindElement";
import { APIController } from "@/controllers/api";
import { SubscriptionStatus, type Plan } from "@/types/billing";
import type { OrgQuotas } from "@/types/org";
import type { Auth, AuthState } from "@/utils/AuthService";
import { humanizeSeconds } from "@/utils/executionTimeFormatter";
import { formatNumber } from "@/utils/localization";
import { pluralOf } from "@/utils/pluralize";

@localized()
@customElement("btrix-org-settings-billing")
export class OrgSettingsBilling extends TailwindElement {
  static styles = css`
    .form-label {
      font-size: var(--sl-input-label-font-size-small);
    }
  `;

  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String, noAccessor: true })
  orgId?: string;

  @property({ type: Object })
  quotas?: OrgQuotas;

  @property({ type: String, noAccessor: true })
  salesEmail?: string;

  private readonly api = new APIController(this);

  private readonly planTask = new Task(this, {
    task: async ([orgId, authState]) => {
      if (!orgId || !authState) throw new Error("Missing args");
      try {
        return await this.getPlan({ orgId, auth: authState });
      } catch (e) {
        console.debug(e);

        throw new Error(
          msg("Sorry, couldn't retrieve current plan at this time."),
        );
      }
    },
    args: () => [this.orgId, this.authState] as const,
  });

  get manageLinkLabel() {
    let label = msg("Contact Sales");

    const subscription = this.planTask.value?.subscription;

    if (subscription?.portalUrl) {
      switch (subscription.status) {
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
              ${this.planTask.render({
                complete: (plan) => html`
                  <btrix-card>
                    <div slot="title" class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        ${this.renderPlanDetails(plan)}
                      </div>
                      ${when(
                        plan.subscription?.portalUrl ||
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
                    ${when(this.quotas, this.renderQuotas)}
                  </btrix-card>
                `,
                error: (err) => html`
                  <btrix-alert variant="danger">
                    ${err instanceof Error ? err.message : err}
                  </btrix-alert>
                `,
              })}
            `,
            html`
              <p class="mb-3">
                ${msg(
                  "Hosted plan status, features, and add-ons, if applicable.",
                )}
              </p>
              ${this.planTask.render({
                complete: (plan) => html`
                  <p class="leading-normal">
                    ${plan.subscription
                      ? msg(
                          str`You can view plan details, update payment methods, and update billing information by clicking “${this.manageLinkLabel}”. This will redirect you to our payment processor in a new tab.`,
                        )
                      : this.salesEmail
                        ? msg(
                            str`Contact us at ${this.salesEmail} to make changes to your plan.`,
                          )
                        : msg(
                            str`Contact your Browsertrix host administrator to make changes to your plan.`,
                          )}
                  </p>
                `,
              })}
            `,
          ],
        ])}
      </div>
    `;
  }

  private readonly renderPlanDetails = (plan: Plan) => {
    let tierLabel;
    let statusLabel;

    if (plan.subscription) {
      tierLabel = html`
        <sl-icon class="text-neutral-500" name="nut"></sl-icon>
        ${msg("Starter")}
      `;

      switch (plan.subscription.status) {
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

  private readonly renderQuotas = (quotas: OrgQuotas) => html`
    <ul class="leading-relaxed text-neutral-700">
      <li>
        ${msg(
          str`${quotas.maxPagesPerCrawl ? formatNumber(quotas.maxPagesPerCrawl) : msg("Unlimited")} ${pluralOf("pages", quotas.maxPagesPerCrawl)} per crawl`,
        )}
      </li>
      <li>
        ${msg(
          html`${quotas.storageQuota
            ? html`<sl-format-bytes
                value=${quotas.storageQuota}
              ></sl-format-bytes>`
            : msg("Unlimited")}
          base disk space`,
        )}
      </li>
      <li>
        ${msg(
          str`${quotas.maxConcurrentCrawls ? formatNumber(quotas.maxConcurrentCrawls) : msg("Unlimited")} concurrent ${pluralOf("crawls", quotas.maxConcurrentCrawls)}`,
        )}
      </li>
      <li>
        ${msg(
          str`${quotas.maxExecMinutesPerMonth ? humanizeSeconds(quotas.maxExecMinutesPerMonth, undefined, undefined, "long") : msg("Unlimited minutes")} of base crawling time per month`,
        )}
      </li>
    </ul>
  `;

  private async getPlan({
    orgId,
    auth,
  }: {
    orgId: string;
    auth: Auth;
  }): Promise<Plan> {
    // TODO replace with real data
    console.log(orgId, auth);
    return Promise.resolve({
      // subscription: {
      //   status: SubscriptionStatus.Active,
      //   portalUrl: "",
      // },
      subscription: null,
    });
    // return this.api.fetch(`/orgs/${orgId}/billing`, auth);
  }
}
