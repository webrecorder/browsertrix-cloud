export enum SubscriptionStatus {
  Active = "active",
  PausedPaymentFailed = "paused_payment_failed",
  Cancelled = "cancelled",
}

export type Subscription = {
  status: SubscriptionStatus | null;
  portalUrl: string | null;
};
