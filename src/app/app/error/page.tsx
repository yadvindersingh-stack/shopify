"use client";

import { useSearchParams } from "next/navigation";
import { Banner, BlockStack, Button, Card, Text } from "@shopify/polaris";
import { buildPathWithHost, getHostFromLocation, getShopFromLocation } from "@/lib/host";

export default function ErrorPage() {
  const sp = useSearchParams();

  const shop = (sp.get("shop") || getShopFromLocation() || "").toLowerCase();
  const host = sp.get("host") || getHostFromLocation() || "";
  const appUrl = buildPathWithHost("/app", host || undefined, shop || undefined);

  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingLg" as="h1">
          Connection needed
        </Text>

        <Banner tone="warning" title="Shopify connection needed">
          <p>
            We couldn't finish restoring your Shopify session automatically. Reload the app from Shopify Admin to request a fresh session token.
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
                window.location.assign(appUrl);
              }}
            >
              Reload app
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
