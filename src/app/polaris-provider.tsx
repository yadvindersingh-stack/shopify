"use client";
import React, { ReactNode, useEffect, useMemo, useState } from "react";
import { AppProvider, Banner, Frame, Navigation, Page } from "@shopify/polaris";
import createApp from "@shopify/app-bridge";
import { usePathname, useSearchParams } from "next/navigation";
import { buildPathWithHost } from "@/lib/host";
import { AppBridgeProvider } from "@/lib/app-bridge-context";

export default function PolarisProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const hostFromQuery = useMemo(() => searchParams.get("host") || "", [searchParams]);
  const [persistedHost, setPersistedHost] = useState<string>(() => {
    if (typeof window === "undefined") return hostFromQuery || "";
    return hostFromQuery || window.localStorage.getItem("shopifyHost") || "";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (hostFromQuery) {
      window.localStorage.setItem("shopifyHost", hostFromQuery);
      setPersistedHost(hostFromQuery);
      return;
    }
    const stored = window.localStorage.getItem("shopifyHost") || "";
    if (stored && !hostFromQuery) {
      setPersistedHost(stored);
      const url = new URL(window.location.href);
      url.searchParams.set("host", stored);
      window.location.replace(url.toString());
    }
  }, [hostFromQuery]);

  const host = hostFromQuery || persistedHost;
  const pathname = usePathname();

  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || "";

  const missingHost = !host;
  const missingApiKey = !apiKey;
  const missingContext = missingHost || missingApiKey;

  const app = useMemo(() => {
    if (missingContext) return null;
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
      url: buildPathWithHost("/app/insights", host),
      label: "Insights",
      selected: pathname?.startsWith("/app/insights") ?? false,
    },
    {
      url: buildPathWithHost("/app/settings", host),
      label: "Settings",
      selected: pathname?.startsWith("/app/settings") ?? false,
    },
  ];

  return (
    <AppProvider i18n={{}}>
      <AppBridgeProvider app={app}>
        <Frame
          navigation={
            <Navigation location={pathname || "/app/insights"}>
              <Navigation.Section items={navigationItems} />
            </Navigation>
          }
        >
          {children}
        </Frame>
      </AppBridgeProvider>
    </AppProvider>
  );
}
