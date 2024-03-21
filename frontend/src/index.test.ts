import { expect, fixture } from "@open-wc/testing";
import { restore, stub } from "sinon";

import AuthService from "./utils/AuthService";

import { App, type APIUser } from ".";

describe("browsertrix-app", () => {
  beforeEach(() => {
    AuthService.broadcastChannel = new BroadcastChannel(AuthService.storageKey);
    window.sessionStorage.clear();
    stub(window.history, "pushState");
  });

  afterEach(() => {
    AuthService.broadcastChannel.close();
    restore();
  });

  it("is defined", async () => {
    const el = await fixture("<browsertrix-app></browsertrix-app>");
    expect(el).instanceOf(App);
  });

  it("renders home when authenticated", async () => {
    stub(AuthService, "initSessionStorage").returns(
      Promise.resolve({
        headers: { Authorization: "_fake_headers_" },
        tokenExpiresAt: 0,
        username: "test-auth@example.com",
      }),
    );
    const el = await fixture("<browsertrix-app></browsertrix-app>");
    expect(el).lightDom.descendants("btrix-home");
  });

  it("renders when `AuthService.initSessionStorage` rejects", async () => {
    stub(AuthService, "initSessionStorage").returns(Promise.reject());
    const el = await fixture("<browsertrix-app></browsertrix-app>");
    expect(el).lightDom.descendants("btrix-log-in");
  });

  // TODO move tests to AuthService
  it("sets auth state from session storage", async () => {
    stub(AuthService.prototype, "startFreshnessCheck");
    stub(window.sessionStorage, "getItem").callsFake((key) => {
      if (key === "btrix.auth")
        return JSON.stringify({
          headers: "_fake_headers_",
          tokenExpiresAt: "_fake_tokenExpiresAt_",
          username: "test-auth@example.com",
        });
      return null;
    });
    const el = await fixture<App>("<browsertrix-app></browsertrix-app>");

    expect(el.authService.authState).to.eql({
      headers: "_fake_headers_",
      tokenExpiresAt: "_fake_tokenExpiresAt_",
      username: "test-auth@example.com",
    });
  });

  it("sets user info", async () => {
    stub(App.prototype, "getUserInfo").callsFake(async () =>
      Promise.resolve({
        id: "test_id",
        email: "test-user@example.com",
        name: "Test User",
        is_verified: false,
        is_superuser: false,
        orgs: [
          {
            id: "test_org_id",
            name: "test org",
            slug: "test-org",
            role: 10,
            quotas: {},
            bytesStored: 100,
            usage: null,
            crawlExecSeconds: {},
            monthlyExecSeconds: {},
            extraExecSeconds: {},
            giftedExecSeconds: {},
            extraExecSecondsAvailable: {},
            giftedExecSecondsAvailable: {},
          },
        ],
      } as APIUser),
    );
    stub(AuthService.prototype, "startFreshnessCheck");
    stub(window.sessionStorage, "getItem").callsFake((key) => {
      if (key === "btrix.auth")
        return JSON.stringify({
          username: "test-auth@example.com",
        });
      return null;
    });
    const el = await fixture<App>("<browsertrix-app></browsertrix-app>");

    expect(el.appState.userInfo).to.eql({
      id: "test_id",
      email: "test-user@example.com",
      name: "Test User",
      isVerified: false,
      isAdmin: false,
      orgs: [
        {
          id: "test_org_id",
          name: "test org",
          role: 10,
          slug: "test-org",
          quotas: {},
          bytesStored: 100,
          usage: null,
          crawlExecSeconds: {},
          monthlyExecSeconds: {},
          extraExecSeconds: {},
          giftedExecSeconds: {},
          extraExecSecondsAvailable: {},
          giftedExecSecondsAvailable: {},
        },
      ],
    });
  });
});
