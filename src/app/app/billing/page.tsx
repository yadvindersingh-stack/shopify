"use client";

import { Page, Card, Button, BlockStack, Text, InlineStack, Banner } from "@shopify/polaris";
import { useState } from "react";
import { useApiFetch } from "@/hooks/useApiFetch";

export default function BillingPage() {
  const apiFetch = useApiFetch();
  const [loading, setLoading] = useState<null | "monthly" | "yearly">(null);
  const [error, setError] = useState<string | null>(null);

  async function subscribe(plan: "monthly" | "yearly") {
    setLoading(plan);
    setError(null);

    try {
      const res = await apiFetch("/api/billing/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
        cache: "no-store",
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) {
        setError(json?.error || `Billing create failed (${res.status})`);
        return;
      }

      if (json?.confirmationUrl) {
        window.location.href = json.confirmationUrl;
        return;
      }

      setError("Missing confirmationUrl from server");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Page title="Choose a plan" subtitle="Start with a 7-day trial. Cancel anytime in Shopify.">
      <BlockStack gap="300">
        {error && (
          <Banner tone="critical" title="Couldn’t start billing">
            <p>{error}</p>
          </Banner>
        )}

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h3" variant="headingMd">Monthly</Text>
                <Text as="p" tone="subdued">$9 CAD / month</Text>
              </BlockStack>
              <Button loading={loading === "monthly"} onClick={() => subscribe("monthly")} variant="primary">
                Start monthly
              </Button>
            </InlineStack>

            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h3" variant="headingMd">Yearly</Text>
                <Text as="p" tone="subdued">$99 CAD / year</Text>
              </BlockStack>
              <Button loading={loading === "yearly"} onClick={() => subscribe("yearly")}>
                Start yearly
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
