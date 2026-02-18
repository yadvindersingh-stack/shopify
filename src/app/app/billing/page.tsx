"use client";

import { Page, Card, Button, BlockStack, Text, InlineStack, Banner } from "@shopify/polaris";
import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useApiFetch } from "@/hooks/useApiFetch";

export default function BillingPage() {
  const apiFetch = useApiFetch();
  const sp = useSearchParams();

  const [loading, setLoading] = useState<null | "monthly" | "yearly">(null);
  const [error, setError] = useState<string | null>(null);

  const host = useMemo(() => sp.get("host") || "", [sp]);

  async function subscribe(plan: "monthly" | "yearly") {
    setLoading(plan);
    setError(null);

    try {
      const res = await apiFetch("/api/billing/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ plan, host }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) {
        setError(json?.error || json?.details || `Billing create failed (${res.status})`);
        return;
      }

      const confirmationUrl = json?.confirmationUrl;
      if (!confirmationUrl) {
        setError("Missing confirmationUrl from server");
        return;
      }

      // IMPORTANT: must escape the iframe and redirect top-level
      // (Shopify blocks iframe navigation to admin/charges pages)
      window.top!.location.href = confirmationUrl;
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
                <Text as="h3" variant="headingMd">
                  Monthly
                </Text>
                <Text as="p" tone="subdued">
                  $9 CAD / month
                </Text>
              </BlockStack>
              <Button
                variant="primary"
                loading={loading === "monthly"}
                onClick={() => subscribe("monthly")}
              >
                Start monthly
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
                Start yearly
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
