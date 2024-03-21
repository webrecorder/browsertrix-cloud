export const ROUTES = {
  home: "/",
  join: "/join/:token",
  signUp: "/sign-up",
  acceptInvite: "/invite/accept/:token",
  verify: "/verify",
  login: "/log-in",
  loginWithRedirect: "/log-in?redirectUrl",
  forgotPassword: "/log-in/forgot-password",
  resetPassword: "/reset-password",
  accountSettings: "/account/settings",
  orgs: "/orgs",
  org: [
    "/orgs/:slug",
    // Org sections:
    "(/workflows(/crawls)(/crawl/:workflowId))",
    "(/items(/:itemType(/:itemId(/review/:qaTab))))",
    "(/collections(/new)(/view/:collectionId(/:collectionTab)))",
    "(/browser-profiles(/profile(/browser/:browserId)(/:browserProfileId)))",
    "(/settings(/:settingsTab))",
  ].join(""),
  users: "/users",
  usersInvite: "/users/invite",
  crawls: "/crawls",
  crawl: "/crawls/crawl/:crawlId",
  // Redirect for https://github.com/webrecorder/browsertrix-cloud/issues/935
  awpUploadRedirect: "/orgs/:orgId/artifacts/upload/:uploadId",
} as const;
