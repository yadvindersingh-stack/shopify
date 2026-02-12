"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Banner, BlockStack, Button, Card, Text } from "@shopify/polaris";

export default function ErrorPage() {
  const sp = useSearchParams();

  const shop = sp.get("shop") || "";
  const host = sp.get("host") || "";

  const reconnectUrl = useMemo(() => {
    if (!shop) return "";
    const u = new URL("/api/auth/start", window.location.origin);
    u.searchParams.set("shop", shop);
    if (host) u.searchParams.set("host", host);
    return u.toString();
  }, [shop, host]);

  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingLg" as="h1">
          Connection needed
        </Text>

        <Banner tone="critical" title="Missing shop context">
          <p>
            This usually happens if the app was opened outside Shopify Admin, or your session expired.
          </p>
        </Banner>

        {shop ? (
          <BlockStack gap="200">
            <Text as="p" tone="subdued">
              Store detected: <strong>{shop}</strong>
            </Text>

            <Button
              variant="primary"
              onClick={() => {
                // Force a full navigation (important for OAuth)
                window.location.assign(reconnectUrl);
              }}
            >
              Reconnect Shopify
            </Button>

            <Text as="p" tone="subdued">
              If this keeps happening, open the app from Shopify Admin → Apps → MerchPulse.
            </Text>
          </BlockStack>
        ) : (
          <BlockStack gap="200">
            <Text as="p">
              Please open the app from Shopify Admin:
            </Text>
            <Text as="p" tone="subdued">
              Shopify Admin → Apps → MerchPulse
            </Text>
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}
