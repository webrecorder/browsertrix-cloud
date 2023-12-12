import { spy } from "sinon";
import { expect } from "@esm-bundle/chai";

import * as auth from "./auth";

describe("auth", () => {
  describe("needLogin", () => {
    it("dispatches the correct event on need log in", () => {
      const dispatchEventSpy = spy();
      class LiteElementMock {
        dispatchEvent = dispatchEventSpy;
      }

      const Element = auth.needLogin(
        class extends LiteElementMock {
          authState = null;
        } as any
      );

      const element = new Element();
      element.update();

      expect(dispatchEventSpy.getCall(0).firstArg.type).to.equal(
        "btrix-need-login"
      );
    });
  });
});
