import { expect } from "@open-wc/testing";
import { restore, stub } from "sinon";

import AuthService from "./AuthService";

describe("AuthService", () => {
  beforeEach(() => {
    AuthService.broadcastChannel = new BroadcastChannel(AuthService.storageKey);
    window.sessionStorage.clear();
    stub(window.history, "pushState");
  });

  afterEach(() => {
    AuthService.broadcastChannel.close();
    restore();
  });

  describe("#initSessionStorage", () => {
    it("returns auth in session storage", async () => {
      stub(window.sessionStorage, "getItem").returns(
        JSON.stringify({
          headers: { Authorization: "_fake_headers_" },
          tokenExpiresAt: "_fake_tokenExpiresAt_",
          username: "test-auth@example.com",
        }),
      );
      const result = await AuthService.initSessionStorage();
      expect(result).to.deep.equal({
        headers: { Authorization: "_fake_headers_" },
        tokenExpiresAt: "_fake_tokenExpiresAt_",
        username: "test-auth@example.com",
      });
    });
    it("returns auth from another tab", async () => {
      stub(window.sessionStorage, "getItem");
      const otherTabChannel = new BroadcastChannel(AuthService.storageKey);
      otherTabChannel.addEventListener("message", () => {
        otherTabChannel.postMessage({
          name: "responding_auth",
          auth: {
            headers: { Authorization: "_fake_headers_from_tab_" },
            tokenExpiresAt: "_fake_tokenExpiresAt_from_tab_",
            username: "test-auth@example.com_from_tab_",
          },
        });
      });
      const result = await AuthService.initSessionStorage();
      expect(result).to.deep.equal({
        headers: { Authorization: "_fake_headers_from_tab_" },
        tokenExpiresAt: "_fake_tokenExpiresAt_from_tab_",
        username: "test-auth@example.com_from_tab_",
      });
      otherTabChannel.close();
    });
    it("resolves without stored auth or another tab", async () => {
      stub(window.sessionStorage, "getItem");
      const result = await AuthService.initSessionStorage();
      expect(result).to.equal(null);
    });
  });
});
