import type {
  ReactiveController,
  ReactiveControllerHost,
  TemplateResult,
} from "lit";

export type NotifyEvent = CustomEvent<{
  /**
   * Notification message body.
   * Example:
   * ```ts
   * message: html`<strong>Look!</strong>`
   * ```
   *
   * Note: In order for `this` methods to work, you'll
   * need to bind `this` or use a fat arrow function.
   * For example:
   * ```ts
   * message: html`<button @click=${this.onClick.bind(this)}>Go!</button>`
   * ```
   * Or:
   * ```ts
   * message: html`<button @click=${(e) => this.onClick(e)}>Go!</button>`
   * ```
   **/
  message: string | TemplateResult;
  /** Notification title */
  title?: string;
  /** Shoelace icon name */
  icon?: string;
  variant?: "success" | "warning" | "danger" | "primary" | "info";
  duration?: number;
}>;

export interface NotifyEventMap {
  "btrix-notify": NotifyEvent;
}

const NOTIFY_EVENT_NAME: keyof NotifyEventMap = "btrix-notify";

/**
 * Manage global app notifications
 */
export class NotifyController implements ReactiveController {
  private host: ReactiveControllerHost & EventTarget;

  constructor(host: NotifyController["host"]) {
    this.host = host;
    host.addController(this);
  }

  hostConnected() {}
  hostDisconnected() {}

  toast(detail: NotifyEvent["detail"]) {
    this.host.dispatchEvent(
      <NotifyEvent>new CustomEvent(NOTIFY_EVENT_NAME, {
        bubbles: true,
        composed: true,
        detail,
      })
    );
  }
}
