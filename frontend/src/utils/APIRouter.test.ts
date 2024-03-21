import { expect } from "@esm-bundle/chai";

import APIRouter from "./APIRouter";

import { ROUTES } from "@/routes";

describe("APIRouter", () => {
  describe("match", () => {
    it("matches org", () => {
      const apiRouter = new APIRouter(ROUTES);
      const viewState = apiRouter.match("/orgs/_fake_org_id_");

      expect(viewState.route).to.equal("org");
      expect(viewState.params).to.deep.equal({
        slug: "_fake_org_id_",
      });
    });

    it("matches join", () => {
      const apiRouter = new APIRouter(ROUTES);
      const viewState = apiRouter.match(
        "/join/_fake_token_?email=_fake_email_",
      );

      expect(viewState.route).to.equal("join");
      expect(viewState.params).to.deep.equal({
        token: "_fake_token_",
        email: "_fake_email_",
      });
    });

    it("matches join with email comment", () => {
      const apiRouter = new APIRouter(ROUTES);
      const viewState = apiRouter.match(
        "/join/_fake_token_?email=fake+comment@email.com",
      );

      expect(viewState.route).to.equal("join");
      expect(viewState.params).to.deep.equal({
        token: "_fake_token_",
        email: "fake+comment@email.com",
      });
    });

    it("matches join with encoded email", () => {
      const apiRouter = new APIRouter(ROUTES);
      const viewState = apiRouter.match(
        "/join/_fake_token_?email=fake%2Bcomment%40email.com",
      );

      expect(viewState.route).to.equal("join");
      expect(viewState.params).to.deep.equal({
        token: "_fake_token_",
        email: "fake+comment@email.com",
      });
    });
  });
});
