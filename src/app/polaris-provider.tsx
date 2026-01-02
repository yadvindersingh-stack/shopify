"use client";
import React, { ReactNode, useMemo } from "react";
import { AppProvider, Frame, Page } from "@shopify/polaris";
import { Provider as AppBridgeProvider } from "@shopify/app-bridge-react";

export default function PolarisProvider({ children }: { children: ReactNode }) {
  const host = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("host") || "";
  }, []);

  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || process.env.SHOPIFY_API_KEY || "";

  return (
    <AppBridgeProvider config={{ apiKey, host, forceRedirect: true }}>
      <AppProvider i18n={{}}>
        <Frame>
          <Page>{children}</Page>
        </Frame>
      </AppProvider>
    </AppBridgeProvider>
  );
}
