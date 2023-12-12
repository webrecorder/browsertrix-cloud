import type { ReactiveController, ReactiveControllerHost } from "lit";
import { msg } from "@lit/localize";

import type { Auth } from "@/utils/AuthService";
import AuthService from "@/utils/AuthService";
import { APIError } from "@/utils/api";

export type QuotaUpdate = { reached: boolean };

export type APIEventMap = {
  "btrix-execution-minutes-quota-update": QuotaUpdate;
  "btrix-storage-quota-update": QuotaUpdate;
};

/**
 * Utilities for interacting with the Browsertrix backend API
 *
 * @example Usage:
 * ```ts
 * class MyComponent extends LitElement {
 *   private api = new APIController(this);
 *
 *   async getSomething() {
 *     await this.api.fetch("/path", this.authState)
 *   }
 * }
 * ```
 */
export class APIController implements ReactiveController {
  host: ReactiveControllerHost & EventTarget;

  constructor(host: APIController["host"]) {
    this.host = host;
    host.addController(this);
  }

  hostConnected() {}
  hostDisconnected() {}

  async fetch<T = unknown>(
    path: string,
    auth: Auth,
    options?: RequestInit
  ): Promise<T> {
    const { headers, ...opts } = options || {};
    const resp = await fetch("/api" + path, {
      headers: {
        "Content-Type": "application/json",
        ...headers,
        ...auth.headers,
      },
      ...opts,
    });

    if (resp.ok) {
      const body = await resp.json();
      const storageQuotaReached = body.storageQuotaReached;
      const executionMinutesQuotaReached = body.execMinutesQuotaReached;
      if (typeof storageQuotaReached === "boolean") {
        this.host.dispatchEvent(
          new CustomEvent<QuotaUpdate>("btrix-storage-quota-update", {
            detail: { reached: storageQuotaReached },
            bubbles: true,
            composed: true,
          })
        );
      }
      if (typeof executionMinutesQuotaReached === "boolean") {
        this.host.dispatchEvent(
          new CustomEvent<QuotaUpdate>("btrix-execution-minutes-quota-update", {
            detail: { reached: executionMinutesQuotaReached },
            bubbles: true,
            composed: true,
          })
        );
      }

      return body;
    }

    let errorDetail;
    try {
      errorDetail = (await resp.json()).detail;
    } catch {}

    let errorMessage: string = msg("Unknown API error");

    switch (resp.status) {
      case 401: {
        this.host.dispatchEvent(AuthService.createNeedLoginEvent());
        errorMessage = msg("Need login");
        break;
      }
      case 403: {
        if (errorDetail === "storage_quota_reached") {
          this.host.dispatchEvent(
            new CustomEvent<QuotaUpdate>("btrix-storage-quota-update", {
              detail: { reached: true },
              bubbles: true,
              composed: true,
            })
          );
          errorMessage = msg("Storage quota reached");
          break;
        }
        if (errorDetail === "exec_minutes_quota_reached") {
          this.host.dispatchEvent(
            new CustomEvent<QuotaUpdate>(
              "btrix-execution-minutes-quota-update",
              {
                detail: { reached: true },
                bubbles: true,
                composed: true,
              }
            )
          );
          errorMessage = msg("Monthly execution minutes quota reached");
          break;
        }
      }
      case 404: {
        errorMessage = msg("Not found");
        break;
      }
      default: {
        if (typeof errorDetail === "string") {
          errorMessage = errorDetail;
        } else if (Array.isArray(errorDetail) && errorDetail.length) {
          const fieldDetail = errorDetail[0] || {};
          const { loc, msg } = fieldDetail;

          const fieldName = loc
            .filter((v: any) => v !== "body" && typeof v === "string")
            .join(" ");
          errorMessage = `${fieldName} ${msg}`;
        }
        break;
      }
    }

    throw new APIError({
      message: errorMessage,
      status: resp.status,
      details: errorDetail,
    });
  }
}
