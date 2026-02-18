"use client";

import { Page, Card, Button, BlockStack, Text, InlineStack } from "@shopify/polaris";
import { useState } from "react";

export default function BillingPage() {
  const [loading, setLoading] = useState<null | "monthly" | "yearly">(null);

  async function subscribe(plan: "monthly" | "yearly") {
    setLoading(plan);
    try {
      const res = await fetch("/api/billing/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(json?.error || "Failed to start billing");
        return;
      }

      if (json?.confirmationUrl) {
        window.location.href = json.confirmationUrl;
      } else {
        alert("Missing confirmation URL");
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <Page title="Choose a plan" subtitle="Start with a 7-day trial. Cancel anytime in Shopify.">
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
    </Page>
  );
}
