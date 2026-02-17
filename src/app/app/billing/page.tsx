"use client";

import { Page, Card, Button, BlockStack, Text } from "@shopify/polaris";

export default function BillingPage() {
  async function subscribe(plan: "monthly" | "yearly") {
    const res = await fetch("/api/billing/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan })
    });

    const json = await res.json();
    window.location.href = json.confirmationUrl;
  }

  return (
    <Page title="Choose a plan">
      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingMd">Monthly – $9 CAD</Text>
          <Button onClick={() => subscribe("monthly")}>
            Subscribe Monthly
          </Button>

          <Text as="h3" variant="headingMd">Yearly – $99 CAD</Text>
          <Button onClick={() => subscribe("yearly")}>
            Subscribe Yearly
          </Button>
        </BlockStack>
      </Card>
    </Page>
  );
}
