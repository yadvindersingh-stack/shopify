"use client";
import React, { createContext, useContext, ReactNode } from "react";
import type { ClientApplication } from "@shopify/app-bridge";

const AppBridgeContext = createContext<ClientApplication | null>(null);

export function AppBridgeProvider({ app, children }: { app: ClientApplication | null; children: ReactNode }) {
  return <AppBridgeContext.Provider value={app}>{children}</AppBridgeContext.Provider>;
}

export function useAppBridge() {
  return useContext(AppBridgeContext);
}
