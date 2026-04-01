"use client";

import React, { ReactNode, useEffect, useMemo, useState } from "react";
import { AppProvider, Banner, BlockStack, Button, Frame, Navigation, Page, Text } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { usePathname, useSearchParams } from "next/navigation";
import {
  buildPathWithHost,
  clearPersistedHost,
  isSafeShopifyHost,
  readPersistedHost,
  readPersistedShop,
} from "@/lib/host";
import { AppBridgeProvider } from "@/lib/app-bridge-context";

const EMBEDDED_CONTEXT_GRACE_MS = 2000;

export default function PolarisProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const hostFromQuery = useMemo(() => searchParams.get("host") || "", [searchParams]);
  const shopFromQuery = useMemo(() => (searchParams.get("shop") || "").toLowerCase(), [searchParams]);

  const [persistedHost, setPersistedHost] = useState<string>(() => {
    if (typeof window === "undefined") return hostFromQuery || "";
    return hostFromQuery || readPersistedHost();
  });
  const [contextSettled, setContextSettled] = useState(Boolean(hostFromQuery || persistedHost));

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isSafeShopifyHost(hostFromQuery)) {
      window.localStorage.setItem("shopifyHost", hostFromQuery);
      setPersistedHost(hostFromQuery);
      setContextSettled(true);
      return;
    }

    const stored = readPersistedHost();
    if (stored && !hostFromQuery) {
      setPersistedHost(stored);
      const url = new URL(window.location.href);
      url.searchParams.set("host", stored);
      window.location.replace(url.toString());
      return;
    }

    if (!stored) {
      clearPersistedHost();
    }

    setContextSettled(false);
    const timeout = window.setTimeout(() => {
      setContextSettled(true);
    }, EMBEDDED_CONTEXT_GRACE_MS);

    return () => window.clearTimeout(timeout);
  }, [hostFromQuery]);

  const host = hostFromQuery || persistedHost;
  const pathname = usePathname();
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || "";
  const reconnectShop = shopFromQuery || readPersistedShop();
  const reconnectUrl = buildPathWithHost("/app", host || undefined, reconnectShop || undefined);

  if (!contextSettled) {
    return (
      <AppProvider i18n={en}>
        <Frame>
          <Page title="Loading MerchPulse">
            <BlockStack gap="300">
              <Text as="p" tone="subdued">
                Waiting for Shopify to finish loading the embedded app context…
              </Text>
            </BlockStack>
          </Page>
        </Frame>
      </AppProvider>
    );
  }

  const missingContext = !host || !apiKey;

  if (missingContext) {
    return (
      <AppProvider i18n={en}>
        <Frame>
          <Page title="Reconnecting to Shopify">
            <BlockStack gap="400">
              <Banner tone={apiKey ? "warning" : "critical"} title={apiKey ? "Refreshing app context" : "App configuration needed"}>
                <p>
                  {apiKey
                    ? "We’re restoring your Shopify session so the embedded app can continue."
                    : "NEXT_PUBLIC_SHOPIFY_API_KEY is missing in the environment."}
                </p>
              </Banner>

              <BlockStack gap="200">
                {!host && (
                  <Text as="p" tone="subdued">
                    Missing the embedded host parameter. This can happen after review-session redirects or expired Shopify context.
                  </Text>
                )}
                {reconnectShop ? (
                  <Button
                    variant="primary"
                    onClick={() => {
                      window.location.assign(reconnectUrl);
                    }}
                  >
                    Reload app
                  </Button>
                ) : (
                  <Text as="p" tone="subdued">
                    Re-open the app from Shopify Admin so Shopify can restore the embedded session token.
                  </Text>
                )}
                <Button onClick={() => window.location.reload()}>Retry loading</Button>
              </BlockStack>
            </BlockStack>
          </Page>
        </Frame>
      </AppProvider>
    );
  }

  const navigationItems = [
    { url: buildPathWithHost("/app/insights", host), label: "Insights", selected: pathname?.startsWith("/app/insights") ?? false },
    { url: buildPathWithHost("/app/settings", host), label: "Settings", selected: pathname?.startsWith("/app/settings") ?? false },
  ];

  return (
    <AppProvider i18n={en}>
      <AppBridgeProvider apiKey={apiKey} host={host}>
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
