"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Banner, BlockStack, Button, Card, Text } from "@shopify/polaris";
import { buildPathWithHost, getHostFromLocation, getShopFromLocation } from "@/lib/host";

export default function ErrorPage() {
  const sp = useSearchParams();

  const shop = (sp.get("shop") || getShopFromLocation() || "").toLowerCase();
  const host = sp.get("host") || getHostFromLocation() || "";

  const reconnectUrl = useMemo(() => {
    if (!shop) return "";
    return new URL(buildPathWithHost(`/api/auth/start?shop=${encodeURIComponent(shop)}`, host || undefined), window.location.origin).toString();
  }, [shop, host]);

  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingLg" as="h1">
          Connection needed
        </Text>

        <Banner tone="warning" title="Shopify connection needed">
          <p>
            Your review session likely lost embedded app context. Reconnect to Shopify to continue without reinstalling the app.
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
