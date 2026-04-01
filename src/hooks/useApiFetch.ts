"use client";

import { useCallback } from "react";
import { getSessionToken } from "@shopify/app-bridge/utilities";
import { useAppBridge } from "@/lib/app-bridge-context";

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

const APP_BRIDGE_WAIT_MS = 250;
const APP_BRIDGE_RETRIES = 8;

export class AppBridgeNotReadyError extends Error {
  code = "app_bridge_not_ready";

  constructor(message = "App Bridge not ready yet") {
    super(message);
    this.name = "AppBridgeNotReadyError";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useApiFetch() {
  const app = useAppBridge();

  return useCallback(
    async (...args: FetchArgs) => {
      const [input, init = {}] = args;

      let token: string | null = null;
      let lastError: unknown = null;

      for (let attempt = 0; attempt < APP_BRIDGE_RETRIES; attempt += 1) {
        if (!app) {
          lastError = new AppBridgeNotReadyError();
          await sleep(APP_BRIDGE_WAIT_MS);
          continue;
        }

        try {
          token = await getSessionToken(app);
          if (token) break;
        } catch (error) {
          lastError = error;
        }

        await sleep(APP_BRIDGE_WAIT_MS);
      }

      if (!token) {
        if (lastError instanceof Error) {
          throw new AppBridgeNotReadyError(lastError.message);
        }
        throw new AppBridgeNotReadyError();
      }

      const headers = new Headers(init.headers || {});
      headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    },
    [app]
  );
}
