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

type Insight = {
  id: string;
  title: string;
  description: string | null;
  severity: "high" | "medium" | "low";
  suggested_action: string | null;
  data_snapshot: Record<string, any> | null;
  created_at?: string;
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

function tryHumanDate(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatValue(v: any) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  try {
    if (typeof v === "object") return JSON.stringify(v);
  } catch {}
  return String(v);
}

export default function InsightCard({ insight }: { insight: Insight }) {
  const [openDetails, setOpenDetails] = useState(false);
  const [openRaw, setOpenRaw] = useState(false);

  const snap = insight.data_snapshot ?? {};
  const createdHuman = tryHumanDate(insight.created_at);

  // Our D1 snapshot shape is:
  // { confidence, evidence, metrics, items_preview, evaluated_at, raw }
  const itemsPreview: any[] = useMemo(() => {
    const a = snap?.items_preview;
    return Array.isArray(a) ? a : [];
  }, [snap]);

  const confidence = (snap?.confidence as string) || null;
  const metrics = snap?.metrics && typeof snap.metrics === "object" ? snap.metrics : null;

  const rawPretty = useMemo(() => {
    try {
      return JSON.stringify(snap?.raw ?? snap, null, 2);
    } catch {
      return String(snap?.raw ?? snap);
    }
  }, [snap]);

  return (
    <Card>
      <Box padding="400">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="050">
            <InlineStack gap="200" blockAlign="center">
              <Text variant="headingSm" as="h3">
                {insight.title}
              </Text>
              <Badge tone={severityTone(insight.severity)}>{readableSeverity(insight.severity)}</Badge>
              {confidence ? (
                <Text as="span" tone="subdued" variant="bodySm">
                  · {confidence} confidence
                </Text>
              ) : null}
            </InlineStack>
            {createdHuman ? (
              <Text as="span" tone="subdued" variant="bodySm">
                Detected: {createdHuman}
              </Text>
            ) : null}
          </BlockStack>

          <Button variant="plain" onClick={() => setOpenDetails((v) => !v)}>
            {openDetails ? "Hide details" : "Show details"}
          </Button>
        </InlineStack>
      </Box>

      <Box padding="400" borderBlockStartWidth="025" borderColor="border">
        <Collapsible open={openDetails} id={`${insight.id}-details`}>
          <BlockStack gap="300">
            <BlockStack gap="100">
              <Text variant="headingSm" as="h4">
                What we saw
              </Text>
              <Text as="p">
                {insight.description?.trim()
                  ? insight.description
                  : snap?.raw?.summary?.trim()
                    ? snap.raw.summary
                    : "We detected a pattern worth reviewing."}
              </Text>
            </BlockStack>

            <BlockStack gap="100">
              <Text variant="headingSm" as="h4">
                Suggested action
              </Text>
              <Text as="p">
                {insight.suggested_action?.trim()
                  ? insight.suggested_action
                  : snap?.raw?.suggested_action?.trim()
                    ? snap.raw.suggested_action
                    : "Review the flagged items and decide your next action."}
              </Text>
            </BlockStack>

            {itemsPreview.length > 0 ? (
              <BlockStack gap="150">
                <Divider />
                <Text variant="headingSm" as="h4">
                  Items flagged (preview)
                </Text>

                <Box
                  padding="300"
                  background="bg-surface-tertiary"
                  borderWidth="025"
                  borderColor="border"
                  borderRadius="200"
                >
                  <BlockStack gap="150">
                    {itemsPreview.map((it: any, idx: number) => (
                      <Box key={idx} padding="200" background="bg-surface" borderRadius="200">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="span" variant="bodyMd">
                            {String(it?.title ?? it?.name ?? `Item ${idx + 1}`)}
                          </Text>
                          <Text as="span" tone="subdued" variant="bodySm">
                            {it?.inv !== undefined && it?.inv !== null ? `Inv: ${formatValue(it.inv)}` : ""}
                            {it?.days !== undefined && it?.days !== null ? ` · Days: ${formatValue(it.days)}` : ""}
                          </Text>
                        </InlineStack>
                      </Box>
                    ))}
                  </BlockStack>
                </Box>
              </BlockStack>
            ) : null}

            {metrics ? (
              <BlockStack gap="150">
                <Divider />
                <Text variant="headingSm" as="h4">
                  Key metrics
                </Text>
                <Box padding="300" background="bg-surface-tertiary" borderRadius="200">
                  <BlockStack gap="100">
                    {Object.entries(metrics).slice(0, 10).map(([k, v]) => (
                      <InlineStack key={k} align="space-between">
                        <Text as="span" tone="subdued" variant="bodySm">
                          {k.replaceAll("_", " ")}
                        </Text>
                        <Text as="span" variant="bodySm">
                          {formatValue(v)}
                        </Text>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </Box>
              </BlockStack>
            ) : null}

            <Divider />

            <InlineStack align="space-between" blockAlign="center">
              <Text as="span" variant="bodyMd" tone="subdued">
                Raw data
              </Text>
              <Button variant="plain" onClick={() => setOpenRaw((v) => !v)}>
                {openRaw ? "Hide" : "Show"}
              </Button>
            </InlineStack>

            <Collapsible open={openRaw} id={`${insight.id}-raw`}>
              <Box
                padding="300"
                background="bg-surface-tertiary"
                borderWidth="025"
                borderColor="border"
                borderRadius="200"
              >
                <pre style={{ margin: 0 }}>
                  {rawPretty}
                </pre>
              </Box>
            </Collapsible>
          </BlockStack>
        </Collapsible>
      </Box>
    </Card>
  );
}
