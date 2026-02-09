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

type InsightSeverity = "high" | "medium" | "low";

type Insight = {
  id: string;
  title: string;
  description?: string | null;
  severity: InsightSeverity;
  suggested_action?: string | null;
  created_at?: string | null;
  data_snapshot?: {
    confidence?: "high" | "medium" | "low" | null;
    evidence?: Record<string, any> | null;
    metrics?: Record<string, any> | null;
    items_preview?: any[] | null;
    evaluated_at?: string | null;
    raw?: any;
  } | null;
};

function severityTone(severity: InsightSeverity) {
  if (severity === "high") return "critical" as const;
  if (severity === "medium") return "warning" as const;
  return "info" as const;
}

function readableSeverity(severity: InsightSeverity) {
  if (severity === "high") return "High";
  if (severity === "medium") return "Medium";
  return "Low";
}

function formatHumanDate(d?: string | null) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-CA", { day: "2-digit", month: "short", year: "numeric" });
}

function toTitleCaseKey(k: string) {
  return k
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function safeString(v: any) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function renderItemLine(item: any) {
  // Try to give a human line for your common shapes.
  const title = item?.title ?? item?.product_title ?? item?.name ?? "Item";
  const inv =
    item?.inv ??
    item?.inventory ??
    item?.inventory_quantity ??
    item?.totalInventory ??
    item?.total_inventory;

  const days =
    item?.days ??
    item?.days_since_last_sale ??
    item?.daysSince ??
    item?.days_of_supply ??
    item?.daysOfSupply;

  const parts: string[] = [String(title)];
  if (Number.isFinite(Number(inv))) parts.push(`inv: ${Number(inv)}`);
  if (Number.isFinite(Number(days))) parts.push(`days: ${Number(days)}`);
  return parts.join(" · ");
}

export default function InsightCard({ insight }: { insight: Insight }) {
  const [openDetails, setOpenDetails] = useState(false);
  const [openRaw, setOpenRaw] = useState(false);

  const detectedDate = useMemo(() => {
    // Prefer evaluated_at (when the model/logic ran), fall back to created_at
    const ev = insight.data_snapshot?.evaluated_at ?? null;
    const cr = insight.created_at ?? null;
    const s = formatHumanDate(ev || cr);
    return s ? `Detected: ${s}` : "";
  }, [insight.data_snapshot?.evaluated_at, insight.created_at]);

  const keyMetrics = useMemo(() => {
    const ev = insight.data_snapshot?.evidence ?? null;
    const mt = insight.data_snapshot?.metrics ?? null;
    // Prefer evidence (clean, intended for UI); fallback to metrics if needed.
    const obj = ev && typeof ev === "object" ? ev : mt && typeof mt === "object" ? mt : null;
    if (!obj) return [];
    return Object.entries(obj)
      .filter(([_, v]) => v !== null && v !== undefined && v !== "")
      .slice(0, 8);
  }, [insight.data_snapshot?.evidence, insight.data_snapshot?.metrics]);

  const itemsPreview = useMemo(() => {
    const items = insight.data_snapshot?.items_preview;
    if (!Array.isArray(items) || items.length === 0) return [];
    return items.slice(0, 6);
  }, [insight.data_snapshot?.items_preview]);

  const raw = insight.data_snapshot?.raw;

  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="200">
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

          {detectedDate ? (
            <Text as="p" tone="subdued">
              {detectedDate}
            </Text>
          ) : null}
        </BlockStack>
      </Box>

      <Box padding="400" borderBlockStartWidth="025" borderColor="border">
        <BlockStack gap="300">
          <Collapsible open={openDetails} id={`${insight.id}-details`}>
            <BlockStack gap="300">
              <BlockStack gap="100">
                <Text variant="headingSm" as="h3">
                  What we saw
                </Text>
                <Text as="p">{insight.description || "No description available."}</Text>
              </BlockStack>

              <BlockStack gap="100">
                <Text variant="headingSm" as="h3">
                  Suggested action
                </Text>
                <Text as="p">{insight.suggested_action || "No suggested action available."}</Text>
              </BlockStack>

              <Divider />

              <BlockStack gap="100">
                <Text variant="headingSm" as="h3">
                  Key metrics
                </Text>

                {keyMetrics.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No key metrics available for this insight.
                  </Text>
                ) : (
                  <Box
                    padding="300"
                    background="bg-surface-tertiary"
                    borderWidth="025"
                    borderColor="border"
                  >
                    <BlockStack gap="150">
                      {keyMetrics.map(([k, v]) => (
                        <InlineStack key={k} align="space-between" blockAlign="center">
                          <Text as="span" tone="subdued">
                            {toTitleCaseKey(k)}
                          </Text>
                          <Text as="span" alignment="end">
                            {safeString(v)}
                          </Text>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </Box>
                )}
              </BlockStack>

              {itemsPreview.length > 0 ? (
                <>
                  <Divider />
                  <BlockStack gap="100">
                    <Text variant="headingSm" as="h3">
                      Items
                    </Text>
                    <Box
                      padding="300"
                      background="bg-surface-tertiary"
                      borderWidth="025"
                      borderColor="border"
                    >
                      <BlockStack gap="150">
                        {itemsPreview.map((it, idx) => (
                          <Text key={idx} as="p">
                            {renderItemLine(it)}
                          </Text>
                        ))}
                      </BlockStack>
                    </Box>
                  </BlockStack>
                </>
              ) : null}
            </BlockStack>
          </Collapsible>

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
           <Box padding="300" background="bg-surface-tertiary" borderWidth="025" borderColor="border">
  <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "var(--p-font-family-mono)" }}>
    {raw ? JSON.stringify(raw, null, 2) : "No raw data."}
  </pre>
</Box>

          </Collapsible>
        </BlockStack>
      </Box>
    </Card>
  );
}
