"use client";
import React, { ReactNode, useMemo } from "react";
import { AppProvider, Banner, Frame, Navigation, Page } from "@shopify/polaris";
import createApp from "@shopify/app-bridge";
import { usePathname, useSearchParams } from "next/navigation";

export default function PolarisProvider({ children }: { children: ReactNode }) {
  const host = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("host") || "";
  }, []);

  const hostQuery = host ? `?host=${encodeURIComponent(host)}` : "";
  const pathname = usePathname();

  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || "";

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

  const navigationItems = [
    {
      url: `/app/insights${hostQuery}`,
      label: "Insights",
      selected: pathname?.startsWith("/app/insights") ?? false,
    },
    {
      url: `/app/settings${hostQuery}`,
      label: "Settings",
      selected: pathname?.startsWith("/app/settings") ?? false,
    },
  ];

  return (
    <AppProvider i18n={{}}>
      <Frame
        navigation={
          <Navigation location={pathname || "/app/insights"}>
            <Navigation.Section items={navigationItems} />
          </Navigation>
        }
      >
        {children}
      </Frame>
    </AppProvider>
  );
}
