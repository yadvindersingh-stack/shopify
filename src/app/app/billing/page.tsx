"use client";

import { Page, Card, Button, BlockStack, Text, InlineStack, Banner } from "@shopify/polaris";
import { useState } from "react";
import { useApiFetch } from "@/hooks/useApiFetch";
import { Redirect } from "@shopify/app-bridge/actions";
import { useAppBridge } from "@/lib/app-bridge-context";
import { useSearchParams } from "next/navigation";
import { getHostFromLocation } from "@/lib/host";

export default function BillingPage() {
  const apiFetch = useApiFetch();
  const app = useAppBridge();
  const searchParams = useSearchParams();
  const host = searchParams.get("host") || getHostFromLocation();

  const [loading, setLoading] = useState<null | "monthly" | "yearly">(null);
  const [error, setError] = useState<string | null>(null);

  async function subscribe(plan: "monthly" | "yearly") {
    setLoading(plan);
    setError(null);

    try {
      const res = await apiFetch("/api/billing/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, host }),
        cache: "no-store",
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) {
        setError(json?.error || json?.details || `Billing redirect failed (${res.status})`);
        return;
      }

      const pricingUrl = json?.pricingUrl;
      if (!pricingUrl) {
        setError("Missing pricingUrl from server");
        return;
      }

      // Managed pricing is hosted by Shopify; redirect there for final plan selection.
      if (!app) {
        window.top?.location.assign(pricingUrl);
        return;
      }

      const redirect = Redirect.create(app);
      redirect.dispatch(Redirect.Action.REMOTE, pricingUrl);
    } finally {
      setLoading(null);
    }
  }

  return (
    <Page title="Choose a plan" subtitle="Compare plans here, then finish selection in Shopify's hosted pricing screen.">
      <BlockStack gap="300">
        {error && (
          <Banner tone="critical" title="Couldn’t open pricing">
            <p>{error}</p>
          </Banner>
        )}

        <Banner tone="info" title="Plan approval happens in Shopify">
          <p>
            MerchPulse uses Shopify managed pricing. After you pick a plan below, Shopify will open its hosted pricing page for final selection and approval.
          </p>
        </Banner>

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h3" variant="headingMd">
                  Monthly
                </Text>
                <Text as="p" tone="subdued">
                  $9 CAD / month
                </Text>
              </BlockStack>
              <Button
                loading={loading === "monthly"}
                onClick={() => subscribe("monthly")}
                variant="primary"
              >
                View in Shopify
              </Button>
            </InlineStack>

            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h3" variant="headingMd">
                  Yearly
                </Text>
                <Text as="p" tone="subdued">
                  $99 CAD / year
                </Text>
              </BlockStack>
              <Button loading={loading === "yearly"} onClick={() => subscribe("yearly")}>
                View in Shopify
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
