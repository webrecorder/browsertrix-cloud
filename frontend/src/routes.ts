export const ROUTES = {
  home: "/",
  join: "/join/:token?email",
  signUp: "/sign-up",
  acceptInvite: "/invite/accept/:token?email",
  verify: "/verify?token",
  login: "/log-in",
  loginWithRedirect: "/log-in?redirectUrl",
  forgotPassword: "/log-in/forgot-password",
  resetPassword: "/reset-password?token",
  myAccount: "/my-account",
  accountSettings: "/account/settings",
  archives: "/archives",
  archive: "/archives/:id/:tab",
  archiveNewResourceTab: "/archives/:id/:tab/new",
  archiveAddMember: "/archives/:id/:tab/add-member",
  crawl: "/archives/:id/:tab/crawl/:crawlId",
  crawlTemplate: "/archives/:id/:tab/config/:crawlConfigId",
  crawlTemplateEdit: "/archives/:id/:tab/config/:crawlConfigId?edit",
  users: "/users",
  usersInvite: "/users/invite",
} as const;

export const DASHBOARD_ROUTE = ROUTES.home;
