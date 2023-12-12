import { ROUTES } from "@/routes";
import { APIError } from "./api";

export type Auth = {
  username: string;
  headers: {
    Authorization: string;
  };
  /** Timestamp (milliseconds) when token expires */
  tokenExpiresAt: number;
};

export type AuthState = Auth | null;

type JWT = {
  user_id: string;
  aud: string[];
  exp: number;
};

export type LoggedInEvent = CustomEvent<
  Auth & {
    api?: boolean;
    firstLogin?: boolean;
    redirectUrl?: string;
  }
>;

export type NeedLoginEvent = CustomEvent<{
  redirectUrl?: string;
}>;

export type LogOutEvent = CustomEvent<{
  redirect?: boolean;
}>;

type AuthRequestEventData = {
  name: "requesting_auth";
};

type AuthResponseEventData = {
  name: "responding_auth";
  auth: AuthState;
};

export type AuthStorageEventData = {
  name: "auth_storage";
  value: string | null;
};

export interface AuthEventMap {
  "btrix-need-login": NeedLoginEvent;
  "btrix-logged-in": LoggedInEvent;
  "btrix-log-out": LogOutEvent;
}

// Check for token freshness every 5 minutes
const FRESHNESS_TIMER_INTERVAL = 60 * 1000 * 5;

export default class AuthService {
  private timerId?: number;
  private _authState: AuthState = null;

  static storageKey = "btrix.auth";
  static unsupportedAuthErrorCode = "UNSUPPORTED_AUTH_TYPE";
  static loggedInEvent: keyof AuthEventMap = "btrix-logged-in";
  static logOutEvent: keyof AuthEventMap = "btrix-log-out";
  static needLoginEvent: keyof AuthEventMap = "btrix-need-login";

  static broadcastChannel = new BroadcastChannel(AuthService.storageKey);
  static storage = {
    getItem() {
      return window.sessionStorage.getItem(AuthService.storageKey);
    },
    setItem(newValue: string) {
      const oldValue = AuthService.storage.getItem();
      if (oldValue === newValue) return;
      window.sessionStorage.setItem(AuthService.storageKey, newValue);
      AuthService.broadcastChannel.postMessage(<AuthStorageEventData>{
        name: "auth_storage",
        value: newValue,
      });
    },
    removeItem() {
      const oldValue = AuthService.storage.getItem();
      if (!oldValue) return;
      window.sessionStorage.removeItem(AuthService.storageKey);
      AuthService.broadcastChannel.postMessage(<AuthStorageEventData>{
        name: "auth_storage",
        value: null,
      });
    },
  };

  get authState() {
    return this._authState;
  }

  static createLoggedInEvent = (
    detail?: LoggedInEvent["detail"]
  ): LoggedInEvent =>
    new CustomEvent(AuthService.loggedInEvent, {
      bubbles: true,
      composed: true,
      detail,
    });

  static createLogOutEvent = (detail?: LogOutEvent["detail"]): LogOutEvent =>
    new CustomEvent(AuthService.logOutEvent, {
      bubbles: true,
      composed: true,
      detail,
    });

  static createNeedLoginEvent = (
    detail?: NeedLoginEvent["detail"]
  ): NeedLoginEvent =>
    new CustomEvent(AuthService.needLoginEvent, {
      bubbles: true,
      composed: true,
      detail,
    });

  static async login({
    email,
    password,
  }: {
    email: string;
    password: string;
  }): Promise<Auth> {
    const resp = await fetch("/api/auth/jwt/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "password",
        username: email,
        password: password,
      }).toString(),
    });

    if (resp.status !== 200) {
      throw new APIError({
        message: resp.statusText,
        status: resp.status,
      });
    }

    const data = await resp.json();
    const token = AuthService.decodeToken(data.access_token);
    const authHeaders = AuthService.parseAuthHeaders(data);

    return {
      username: email,
      headers: authHeaders,
      tokenExpiresAt: token.exp * 1000,
    };
  }

  /**
   * Decode JSON web token returned as access token
   */
  private static decodeToken(token: string): JWT {
    return JSON.parse(window.atob(token.split(".")[1]));
  }

  /**
   * Build authorization headers from login response
   */
  private static parseAuthHeaders(data: {
    token_type: string;
    access_token: string;
  }): Auth["headers"] {
    if (data.token_type === "bearer" && data.access_token) {
      return {
        Authorization: `Bearer ${data.access_token}`,
      };
    }

    throw new Error(AuthService.unsupportedAuthErrorCode);
  }

  /**
   * Retrieve or set auth data from shared session
   * and set up session syncing
   */
  static async initSessionStorage(): Promise<AuthState> {
    const authState =
      AuthService.getCurrentTabAuth() ||
      (await AuthService.getSharedSessionAuth());

    AuthService.broadcastChannel.addEventListener(
      "message",
      ({ data }: { data: AuthRequestEventData | AuthStorageEventData }) => {
        if (data.name === "requesting_auth") {
          // A new tab/window opened and is requesting shared auth
          AuthService.broadcastChannel.postMessage(<AuthResponseEventData>{
            name: "responding_auth",
            auth: AuthService.getCurrentTabAuth(),
          });
        }
      }
    );

    return authState;
  }

  private static getCurrentTabAuth(): AuthState {
    const auth = AuthService.storage.getItem();

    if (auth) {
      return JSON.parse(auth);
    }

    return null;
  }

  /**
   * Retrieve shared session from another tab/window
   **/
  private static async getSharedSessionAuth(): Promise<AuthState> {
    const broadcastPromise = new Promise((resolve) => {
      // Check if there's any authenticated tabs
      AuthService.broadcastChannel.postMessage(<AuthRequestEventData>{
        name: "requesting_auth",
      });
      // Wait for another tab to respond
      const cb = ({ data }: any) => {
        if (data.name === "responding_auth") {
          AuthService.broadcastChannel.removeEventListener("message", cb);
          resolve(data.auth);
        }
      };
      AuthService.broadcastChannel.addEventListener("message", cb);
    });
    // Ensure that `getSharedSessionAuth` is resolved within a reasonable
    // timeframe, even if another window/tab doesn't respond:
    const timeoutPromise = new Promise((resolve) => {
      window.setTimeout(() => {
        resolve(null);
      }, 10);
    });

    return Promise.race([broadcastPromise, timeoutPromise]).then(
      (value: any) => {
        try {
          if (value.username && value.headers && value.tokenExpiresAt) {
            return value;
          }
        } catch {
          return null;
        }
      },
      (error) => {
        console.debug(error);
        return null;
      }
    );
  }

  constructor() {
    // Only have freshness check run in visible tab(s)
    document.addEventListener("visibilitychange", () => {
      if (!this._authState) return;
      if (document.visibilityState === "visible") {
        this.startFreshnessCheck();
      } else {
        this.cancelFreshnessCheck();
      }
    });
  }

  saveLogin(auth: Auth) {
    this.persist(auth);
    this.startFreshnessCheck();
  }

  logout() {
    this.cancelFreshnessCheck();
    this.revoke();
  }

  startFreshnessCheck() {
    window.clearTimeout(this.timerId);
    this.checkFreshness();
  }

  private cancelFreshnessCheck() {
    window.clearTimeout(this.timerId);
    this.timerId = undefined;
  }

  private revoke() {
    this._authState = null;
    AuthService.storage.removeItem();
  }

  persist(auth: Auth) {
    this._authState = {
      username: auth.username,
      headers: auth.headers,
      tokenExpiresAt: auth.tokenExpiresAt,
    };
    AuthService.storage.setItem(JSON.stringify(this._authState));
  }

  private async checkFreshness() {
    // console.debug("checkFreshness authState:", this._authState);

    if (!this._authState) return;
    const paddedNow = Date.now() + FRESHNESS_TIMER_INTERVAL - 500; // tweak padding to account for API fetch time

    if (this._authState.tokenExpiresAt > paddedNow) {
      // console.debug(
      //   "fresh! restart timer tokenExpiresAt:",
      //   new Date(this._authState.tokenExpiresAt)
      // );
      // console.debug("fresh! restart timer paddedNow:", new Date(paddedNow));
      // Restart timer
      this.timerId = window.setTimeout(() => {
        this.checkFreshness();
      }, FRESHNESS_TIMER_INTERVAL);
    } else {
      try {
        const auth = await this.refresh();
        this._authState.headers = auth.headers;
        this._authState.tokenExpiresAt = auth.tokenExpiresAt;
        this.persist(this._authState);

        // console.debug(
        //   "refreshed. restart timer tokenExpiresAt:",
        //   new Date(this._authState.tokenExpiresAt)
        // );
        // console.debug(
        //   "refreshed. restart timer paddedNow:",
        //   new Date(paddedNow)
        // );

        // Restart timer
        this.timerId = window.setTimeout(() => {
          this.checkFreshness();
        }, FRESHNESS_TIMER_INTERVAL);
      } catch (e) {
        console.debug(e);

        this.logout();
        const { pathname, search, hash } = window.location;
        const redirectUrl =
          pathname !== ROUTES.login && pathname !== ROUTES.home
            ? `${pathname}${search}${hash}`
            : "";
        window.dispatchEvent(AuthService.createNeedLoginEvent({ redirectUrl }));
      }
    }
  }

  async refresh(): Promise<{
    headers: Auth["headers"];
    tokenExpiresAt: Auth["tokenExpiresAt"];
  }> {
    if (!this.authState) {
      throw new Error("No this.authState");
    }

    const resp = await fetch("/api/auth/jwt/refresh", {
      method: "POST",
      headers: this.authState.headers,
    });

    if (resp.status !== 200) {
      throw new APIError({
        message: resp.statusText,
        status: resp.status,
      });
    }

    const data = await resp.json();
    const token = AuthService.decodeToken(data.access_token);
    const authHeaders = AuthService.parseAuthHeaders(data);

    return {
      headers: authHeaders,
      tokenExpiresAt: token.exp * 1000,
    };
  }
}
