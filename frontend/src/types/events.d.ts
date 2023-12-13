import { type APIEventMap } from "@/controllers/api";
import { type NavigateEventMap } from "@/controllers/navigate";
import { type NotifyEventMap } from "@/controllers/notify";
import { type AuthEventMap } from "@/utils/AuthService";

/**
 * Declare custom events here so that typescript can find them.
 * Custom event names should be prefixed with `btrix-`.
 */
declare global {
  interface GlobalEventHandlersEventMap
    extends NavigateEventMap,
      NotifyEventMap,
      AuthEventMap,
      APIEventMap {}
}
