"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Text, Button, BlockStack, InlineStack, Badge, Box } from "@shopify/polaris";

type Insight = {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  suggested_action: string;
  data_snapshot: any;
};

export default function InsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [scanLoading, setScanLoading] = useState<boolean>(false);

  // Dummy runScan handler
  const runScan = async () => {
    setScanLoading(true);
    // Simulate scan
    setTimeout(() => setScanLoading(false), 1000);
  };

  useEffect(() => {
    // Simulate fetching insights
    setTimeout(() => {
      setInsights([]);
      setLoading(false);
    }, 1000);
  }, []);

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="headingLg" as="h1">Insights</Text>
          <Button variant="primary" onClick={runScan} loading={scanLoading}>Run scan now</Button>
        </InlineStack>
        {loading ? (
          <Text as="p">Loading...</Text>
        ) : insights.length === 0 ? (
          <Text as="p" tone="subdued">No insights to display.</Text>
        ) : (
          <BlockStack gap="300">
            {insights.map((insight) => (
              <Card key={insight.id}>
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Badge tone={insight.severity === 'high' ? 'critical' : insight.severity === 'medium' ? 'warning' : 'success'}>
                      {insight.severity}
                    </Badge>
                    <Text as="h3" variant="headingMd">{insight.title}</Text>
                  </InlineStack>
                  <details>
                    <summary className="cursor-pointer text-sm">Details</summary>
                    <Box padding="200">
                      <BlockStack gap="200">
                        <Text as="p">{insight.description}</Text>
                        <Text tone="subdued" as="p">Suggested: {insight.suggested_action}</Text>
                        <pre className="text-xs bg-gray-100 rounded p-2 overflow-x-auto">{JSON.stringify(insight.data_snapshot, null, 2)}</pre>
                      </BlockStack>
                    </Box>
                  </details>
                </BlockStack>
              </Card>
            ))}
          </BlockStack>
        )}
        <Link href="/settings">Settings</Link>
      </BlockStack>
    </Card>
  );
}
