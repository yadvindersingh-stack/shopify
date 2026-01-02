"use client";
import { Card, Text } from "@shopify/polaris";

export default function ErrorPage() {
  return (
    <Card>
      <Text variant="headingLg" as="h1">Missing shop context</Text>
      <Text as="p" tone="critical">
        Please relaunch this app from your Shopify Admin.
      </Text>
    </Card>
  );
}
