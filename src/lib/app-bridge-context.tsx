"use client";
import React, { createContext, useContext, ReactNode, useMemo } from "react";
import createApp from "@shopify/app-bridge";
import type { ClientApplication } from "@shopify/app-bridge";

const AppBridgeContext = createContext<ClientApplication | null>(null);

type AppBridgeProviderProps = {
  host: string;
  apiKey: string;
  children: ReactNode;
};

export function AppBridgeProvider({ host, apiKey, children }: AppBridgeProviderProps) {
  const app = useMemo<ClientApplication | null>(() => {
    if (!host || !apiKey) {
      return null;
    }
    return createApp({ apiKey, host, forceRedirect: true });
  }, [apiKey, host]);

  return <AppBridgeContext.Provider value={app}>{children}</AppBridgeContext.Provider>;
}

export function useAppBridge() {
  return useContext(AppBridgeContext);
}
