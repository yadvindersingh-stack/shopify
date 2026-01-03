"use client";
import { useState } from "react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Collapsible,
  Divider,
  InlineStack,
  Text,
} from "@shopify/polaris";

type Insight = {
  id: string;
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  suggested_action: string;
  data_snapshot: Record<string, any>;
};

function severityTone(severity: Insight["severity"]) {
  if (severity === "high") return "critical" as const;
  if (severity === "medium") return "warning" as const;
  return "info" as const;
}

function readableSeverity(severity: Insight["severity"]) {
  if (severity === "high") return "High";
  if (severity === "medium") return "Medium";
  return "Low";
}

export default function InsightCard({ insight }: { insight: Insight }) {
  const [openDetails, setOpenDetails] = useState(false);
  const [openData, setOpenData] = useState(false);

  const snapshotEntries = Object.entries(insight.data_snapshot || {});

  return (
    <Card>
      <Box padding="400">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Text variant="headingSm" as="h3">
              {insight.title}
            </Text>
            <Badge tone={severityTone(insight.severity)}>{readableSeverity(insight.severity)}</Badge>
          </InlineStack>
          <Button variant="plain" onClick={() => setOpenDetails((v) => !v)}>
            {openDetails ? "Hide details" : "Show details"}
          </Button>
        </InlineStack>
      </Box>
      <Box padding="400" borderBlockStartWidth="025" borderColor="border">
        <BlockStack gap="300">
          <Collapsible open={openDetails} id={`${insight.id}-details`}>
            <BlockStack gap="200">
              <BlockStack gap="100">
                <Text variant="headingSm" as="h3">
                  What we saw
                </Text>
                <Text as="p">{insight.description}</Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text variant="headingSm" as="h3">
                  Why it matters
                </Text>
                <Text as="p">This could affect revenue or customer trust if left unchecked.</Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text variant="headingSm" as="h3">
                  Suggested action
                </Text>
                <Text as="p">{insight.suggested_action}</Text>
              </BlockStack>
            </BlockStack>
          </Collapsible>

          <Divider />

          <InlineStack align="space-between" blockAlign="center">
            <Text as="span" variant="bodyMd" tone="subdued">
              View data
            </Text>
            <Button variant="plain" onClick={() => setOpenData((v) => !v)}>
              {openData ? "Hide" : "Show"}
            </Button>
          </InlineStack>
          <Collapsible open={openData} id={`${insight.id}-data`}>
            <Box padding="300" background="bg-surface-tertiary" borderWidth="025" borderColor="border">
              <BlockStack gap="150">
                {snapshotEntries.length === 0 ? (
                  <Text as="span" tone="subdued">No additional data.</Text>
                ) : (
                  snapshotEntries.map(([key, value]) => (
                    <InlineStack key={key} align="space-between" blockAlign="center">
                      <Text as="span" tone="subdued">
                        {key}
                      </Text>
                      <Text as="span" alignment="end">
                        {typeof value === "object" ? JSON.stringify(value) : String(value)}
                      </Text>
                    </InlineStack>
                  ))
                )}
              </BlockStack>
            </Box>
          </Collapsible>
        </BlockStack>
      </Box>
    </Card>
  );
}
