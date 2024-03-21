import AuthService, { type AuthState } from "@/utils/AuthService";
import type LiteElement from "@/utils/LiteElement";

/**
 * Block rendering and dispatch event if user is not logged in.
 * When using with other class decorators, `@needLogin` should
 * be closest to the component (see usage example.)
 *
 * @example Usage:
 * ```ts
 * @customElement("my-component")
 * @needLogin
 * MyComponent extends LiteElement {}
 * ```
 *
 * @fires btrix-need-login
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function needLogin<T extends { new (...args: any[]): LiteElement }>(
  constructor: T,
) {
  return class extends constructor {
    authState?: AuthState;

    static get properties() {
      return {
        authState: { type: Object },
      };
    }

    update(changedProperties: Map<string, unknown>) {
      if (this.authState) {
        super.update(changedProperties);
      } else {
        this.dispatchEvent(
          AuthService.createNeedLoginEvent({
            redirectUrl: `${window.location.pathname}${window.location.search}${window.location.hash}`,
          }),
        );
      }
    }
  };
}
