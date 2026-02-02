"use client";

import { useMemo, useState } from "react";
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
import { parseAnyDate, formatHumanDateTime, relativeDayLabel } from "@/lib/dates";

type Insight = {
  id: string;
  title: string;
  description: string | null;
  severity: "high" | "medium" | "low";
  suggested_action: string | null;
  data_snapshot: Record<string, any> | null;
  created_at?: string; // from DB
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

  const createdAt = useMemo(() => parseAnyDate(insight.created_at), [insight.created_at]);

  // If your evaluator returns evaluated_at in snapshot, prefer that for “Updated …”
  const evaluatedAt = useMemo(() => {
    const raw = insight?.data_snapshot?.evaluated_at ?? insight?.data_snapshot?.evaluatedAt;
    return parseAnyDate(typeof raw === "string" ? raw : null);
  }, [insight?.data_snapshot]);

  const statusLabel = useMemo(() => {
    return relativeDayLabel({ createdAt, evaluatedAt });
  }, [createdAt, evaluatedAt]);

  const timestamp = useMemo(() => {
    const d = evaluatedAt ?? createdAt;
    return d ? formatHumanDateTime(d) : "—";
  }, [createdAt, evaluatedAt]);

  const snapshotEntries = Object.entries(insight.data_snapshot || {});
  const snapshot = insight.data_snapshot || {};
const indicators = Array.isArray(snapshot.indicators) ? snapshot.indicators : [];
const metrics = snapshot.metrics && typeof snapshot.metrics === "object" ? snapshot.metrics : null;

function prettyKey(k: string) {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(v: any) {
  if (v == null) return "—";
  if (typeof v === "number") return Number.isFinite(v) ? v.toLocaleString() : String(v);
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}


  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="200">
          {/* Header */}
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="200" blockAlign="center">
              <Text variant="headingMd" as="h3">
                {insight.title}
              </Text>
              <Badge tone={severityTone(insight.severity)}>{readableSeverity(insight.severity)}</Badge>
            </InlineStack>

            <Button variant="plain" onClick={() => setOpenDetails((v) => !v)}>
              {openDetails ? "Hide" : "Details"}
            </Button>
          </InlineStack>

          {/* Meta line */}
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" tone="subdued">
              {statusLabel}
            </Text>
            <Text as="span" tone="subdued">
              •
            </Text>
            <Text as="span" tone="subdued">
              {timestamp}
            </Text>
          </InlineStack>

          {/* Compact summary (always visible) */}
          {insight.description ? (
            <Text as="p">{insight.description}</Text>
          ) : (
            <Text as="p" tone="subdued">
              No description available.
            </Text>
          )}

          {/* Suggested action (always visible) */}
          {insight.suggested_action ? (
            <Box paddingBlockStart="200">
              <Text as="p" variant="bodyMd">
                <Text as="span" fontWeight="semibold">
                  Do this now:{" "}
                </Text>
                {insight.suggested_action}
              </Text>
            </Box>
          ) : null}
        </BlockStack>
      </Box>

      {/* Details */}
      <Box padding="400" borderBlockStartWidth="025" borderColor="border">
        <BlockStack gap="300">
          <Collapsible open={openDetails} id={`${insight.id}-details`}>
            <BlockStack gap="200">
             <Divider />

<Text variant="headingSm" as="h4">
  Evidence
</Text>

{indicators.length > 0 ? (
  <BlockStack gap="200">
    {indicators.map((i: any) => (
      <Box
        key={i.key || i.label}
        padding="300"
        background="bg-surface-tertiary"
        borderWidth="025"
        borderColor="border"
        borderRadius="200"
      >
        <BlockStack gap="100">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="span" fontWeight="semibold">
              {i.label || i.key || "Signal"}
            </Text>
            <Badge tone={i.status === "likely" ? "critical" : i.status === "possible" ? "warning" : "info"}>
              {String(i.status || "unknown")}
            </Badge>
          </InlineStack>
          {i.evidence ? (
            <Text as="p" tone="subdued">
              {i.evidence}
            </Text>
          ) : (
            <Text as="p" tone="subdued">
              No evidence provided.
            </Text>
          )}
        </BlockStack>
      </Box>
    ))}
  </BlockStack>
) : metrics ? (
  <Box
    padding="300"
    background="bg-surface-tertiary"
    borderWidth="025"
    borderColor="border"
    borderRadius="200"
  >
    <BlockStack gap="150">
      {Object.entries(metrics).slice(0, 10).map(([k, v]) => (
        <InlineStack key={k} align="space-between" blockAlign="center">
          <Text as="span" tone="subdued">
            {prettyKey(k)}
          </Text>
          <Text as="span" alignment="end">
            {formatValue(v)}
          </Text>
        </InlineStack>
      ))}
    </BlockStack>
  </Box>
) : (
  <Text as="p" tone="subdued">
    No evidence available for this insight.
  </Text>
)}

<Divider />

<InlineStack align="space-between" blockAlign="center">
  <Text as="span" tone="subdued">
    Raw data (advanced)
  </Text>
  <Button variant="plain" onClick={() => setOpenData((v) => !v)}>
    {openData ? "Hide" : "Show"}
  </Button>
</InlineStack>

<Collapsible open={openData} id={`${insight.id}-data`}>
  <Box
    padding="300"
    background="bg-surface-tertiary"
    borderWidth="025"
    borderColor="border"
    borderRadius="200"
  >
    <Text as="p" tone="subdued">
      {JSON.stringify(snapshot, null, 2)}
    </Text>
  </Box>
</Collapsible>

            </BlockStack>
          </Collapsible>
        </BlockStack>
      </Box>
    </Card>
  );
}
