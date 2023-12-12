import { type APIEventMap } from "@/controllers/api";
import { type NavigateEventMap } from "@/controllers/navigate";
import { type NotifyEventMap } from "@/controllers/notify";
import { type AuthEventMap } from "@/utils/AuthService";

declare global {
  interface GlobalEventHandlersEventMap
    extends NavigateEventMap,
      NotifyEventMap,
      AuthEventMap,
      APIEventMap {}
}
