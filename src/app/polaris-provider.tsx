"use client";
import React, { ReactNode, useMemo } from "react";
import { AppProvider, Frame, Page } from "@shopify/polaris";
import createApp from "@shopify/app-bridge";
export default function PolarisProvider({ children }: { children: ReactNode }) {
  const host = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("host") || "";
  }, []);

  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || process.env.SHOPIFY_API_KEY || "";

  if (!apiKey || !host) return null;

  // Initialize App Bridge once for the embedded app environment
  useMemo(() => {
    createApp({ apiKey, host, forceRedirect: true });
  }, [apiKey, host]);

  return (
    <AppProvider i18n={{}}>
      <Frame>
        <Page>{children}</Page>
      </Frame>
    </AppProvider>
  );
}
