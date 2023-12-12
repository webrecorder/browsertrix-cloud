import { LitElement, html } from "lit";

import { APIController } from "@/controllers/api";
import { NotifyController } from "@/controllers/notify";
import { NavigateController } from "@/controllers/navigate";
import appState, { use } from "./state";

export { html };

/**
 * @fires navigate
 * @fires notify
 * @fires need-login
 * @fires storage-quota-update
 * @fires execution-minutes-quota-update
 */
export default class LiteElement extends LitElement {
  @use()
  appState = appState;

  private apiController = new APIController(this);
  private notifyController = new NotifyController(this);
  private navigateController = new NavigateController(this);

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
