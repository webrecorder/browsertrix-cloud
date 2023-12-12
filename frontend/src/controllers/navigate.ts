import type { ReactiveController, ReactiveControllerHost } from "lit";

import appState from "@/utils/state";

export type NavigateEvent = CustomEvent<{
  url: string;
  state?: object;
}>;

export interface NavigateEventMap {
  "btrix-navigate": NavigateEvent;
}

const NAVIGATE_EVENT_NAME: keyof NavigateEventMap = "btrix-navigate";

/**
 * Manage app navigation
 */
export class NavigateController implements ReactiveController {
  private host: ReactiveControllerHost & EventTarget;

  get orgBasePath() {
    const slug = appState.orgSlug;
    if (slug) {
      return `/orgs/${slug}`;
    }
    return "/";
  }

  constructor(host: NavigateController["host"]) {
    this.host = host;
    host.addController(this);
  }

  hostConnected() {}
  hostDisconnected() {}

  to(url: string, state?: object): void {
    const evt: NavigateEvent = new CustomEvent(NAVIGATE_EVENT_NAME, {
      detail: { url, state },
      bubbles: true,
      composed: true,
    });
    this.host.dispatchEvent(evt);
  }

  /**
   * Bind to anchor tag to prevent full page navigation
   * @example
   * ```ts
   * <a href="/" @click=${this.navigate.link}>go</a>
   * ```
   * @param event Click event
   */
  link(event: MouseEvent, _href?: string): void {
    if (
      // Detect keypress for opening in a new tab
      event.ctrlKey ||
      event.shiftKey ||
      event.metaKey ||
      (event.button && event.button == 1) ||
      // Account for event prevented on anchor tag
      event.defaultPrevented
    ) {
      return;
    }

    event.preventDefault();

    const evt: NavigateEvent = new CustomEvent(NAVIGATE_EVENT_NAME, {
      detail: { url: (event.currentTarget as HTMLAnchorElement).href },
      bubbles: true,
      composed: true,
    });
    this.host.dispatchEvent(evt);
  }
}
