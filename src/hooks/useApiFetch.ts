"use client";
import { useCallback } from "react";
import { getSessionToken } from "@shopify/app-bridge/utilities";
import { useAppBridge } from "@/lib/app-bridge-context";

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

export function useApiFetch() {
  const app = useAppBridge();

  return useCallback(async (...args: FetchArgs) => {
    const [input, init = {}] = args;
    if (!app) {
      throw new Error("App Bridge not ready yet");
    }
    const token = await getSessionToken(app);
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  }, [app]);
}
