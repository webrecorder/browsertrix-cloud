import { html, LitElement } from "lit";

import appState, { use } from "./state";

import { APIController } from "@/controllers/api";
import { NavigateController } from "@/controllers/navigate";
import { NotifyController } from "@/controllers/notify";

export { html };

export default class LiteElement extends LitElement {
  @use()
  appState = appState;

  private readonly apiController = new APIController(this);
  private readonly notifyController = new NotifyController(this);
  private readonly navigateController = new NavigateController(this);

  protected get orgBasePath() {
    return this.navigateController.orgBasePath;
  }

  createRenderRoot() {
    return this;
  }

  /**
   * @deprecated New components should use NavigateController directly
   */
  navTo = (...args: Parameters<NavigateController["to"]>) =>
    this.navigateController.to(...args);

  /**
   * @deprecated New components should use NavigateController directly
   */
  navLink = (...args: Parameters<NavigateController["link"]>) =>
    this.navigateController.link(...args);

  /**
   * @deprecated New components should use NotifyController directly
   */
  notify = (...args: Parameters<NotifyController["toast"]>) =>
    this.notifyController.toast(...args);

  /**
   * @deprecated New components should use APIController directly
   */
  apiFetch = async <T = unknown>(...args: Parameters<APIController["fetch"]>) =>
    this.apiController.fetch<T>(...args);
}
