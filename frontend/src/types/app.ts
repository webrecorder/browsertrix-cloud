export type AppSettings = {
  registrationEnabled: boolean;
  jwtTokenLifetime: number;
  defaultBehaviorTimeSeconds: number;
  defaultPageLoadTimeSeconds: number;
  maxPagesPerCrawl: number;
  maxScale: number;
  billingEnabled: boolean;
  salesEmail: string;
};
