"use client";
import React, { ReactNode, useMemo } from "react";
import { AppProvider, Banner, Frame, Page } from "@shopify/polaris";
import createApp from "@shopify/app-bridge";
export default function PolarisProvider({ children }: { children: ReactNode }) {
  const host = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("host") || "";
  }, []);

  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || process.env.SHOPIFY_API_KEY || "";

  const missingHost = !host;
  const missingApiKey = !apiKey;
  const missingContext = missingHost || missingApiKey;

  // Initialize App Bridge once for the embedded app environment
  useMemo(() => {
    if (missingContext) return undefined;
    return createApp({ apiKey, host, forceRedirect: true });
  }, [apiKey, host, missingContext]);

  if (missingContext) {
    return (
      <AppProvider i18n={{}}>
        <Frame>
          <Page title="App not initialized">
            <Banner tone="critical" title="Embedded context missing">
              <p>Open the app from Shopify Admin or the Partners preview link so Shopify includes the host query parameter.</p>
              {missingApiKey && <p>Missing NEXT_PUBLIC_SHOPIFY_API_KEY in the environment.</p>}
              {missingHost && <p>Missing host parameter in the URL.</p>}
            </Banner>
          </Page>
        </Frame>
      </AppProvider>
    );
  }

  return (
    <AppProvider i18n={{}}>
      <Frame>
        <Page>{children}</Page>
      </Frame>
    </AppProvider>
  );
}
