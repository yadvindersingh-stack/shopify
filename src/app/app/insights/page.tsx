"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  EmptyState,
  InlineStack,
  Layout,
  Page,
  Spinner,
  Text,
} from "@shopify/polaris";
import InsightCard from "@/components/InsightCard";
import { buildPathWithHost } from "@/lib/host";
import { useApiFetch } from "@/hooks/useApiFetch";

type Severity = "high" | "medium" | "low";

type Insight = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  severity: Severity;
  suggested_action: string | null;
  data_snapshot: Record<string, any> | null;
  created_at?: string;
};

type ScanMeta = {
  last?: string | null;
  next?: string | null;
  last_status?: "ok" | "error" | null;
  last_summary?: any;
};

function formatHumanDateTime(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d) : d;
  // "30 Jan 2026, 11:05"
  return dt.toLocaleString("en-CA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function msUntil(iso?: string | null) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return t - Date.now();
}

function friendlyCountdown(ms: number) {
  if (ms <= 0) return "now";
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `in ${hours} hr`;
  const days = Math.ceil(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

function badgeToneForSeverity(sev: Severity) {
  if (sev === "high") return "critical" as const;
  if (sev === "medium") return "warning" as const;
  return "info" as const;
}

export default function InsightsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hostParam = searchParams.get("host") || "";
  const withHost = useCallback((path: string) => buildPathWithHost(path, hostParam), [hostParam]);

  const apiFetch = useApiFetch();

  const [insights, setInsights] = useState<Insight[]>([]);
  const [scanMeta, setScanMeta] = useState<ScanMeta>({});
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);

  const [banner, setBanner] = useState<{ tone: "success" | "critical"; title: string; message?: string } | null>(null);

  const grouped = useMemo(() => {
    const high = insights.filter((i) => i.severity === "high");
    const med = insights.filter((i) => i.severity === "medium");
    const low = insights.filter((i) => i.severity === "low");
    return { high, med, low };
  }, [insights]);

  const counts = useMemo(() => {
    return {
      high: grouped.high.length,
      medium: grouped.med.length,
      low: grouped.low.length,
      total: insights.length,
    };
  }, [grouped, insights.length]);

  const scanSubtitle = useMemo(() => {
    const last = scanMeta.last ? formatHumanDateTime(scanMeta.last) : "Never";
    const next = scanMeta.next ? formatHumanDateTime(scanMeta.next) : "Not scheduled";
    const nextMs = msUntil(scanMeta.next);
    const nextHint = nextMs !== null ? ` (${friendlyCountdown(nextMs)})` : "";
    return `Last scan: ${last} · Next scan: ${next}${nextHint}`;
  }, [scanMeta.last, scanMeta.next]);

  const fetchScanMeta = useCallback(async () => {
    try {
      const res = await apiFetch("/api/scan-status", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setScanMeta({
        last: json?.last_scan_at ?? null,
        next: json?.next_scan_at ?? null,
        last_status: json?.last_scan_status ?? null,
        last_summary: json?.last_scan_summary ?? null,
      });
    } catch {
      // ignore
    }
  }, [apiFetch]);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/insights", { cache: "no-store" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        setBanner({ tone: "critical", title: "Failed to load insights", message: txt?.slice(0, 300) });
        setInsights([]);
        return;
      }
      const data = await res.json();
      setInsights(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchInsights();
    fetchScanMeta();
  }, [fetchInsights, fetchScanMeta]);

  const runScan = useCallback(async () => {
    setScanLoading(true);
    setBanner(null);
    try {
      const res = await apiFetch("/api/insights/run", { method: "POST" });
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        // non-json response
      }

      if (!res.ok) {
        setBanner({
          tone: "critical",
          title: "Scan failed",
          message: (json?.details || json?.error || text || "").toString().slice(0, 400),
        });
        return;
      }

      const inserted = Number(json?.inserted ?? 0);
      const keys = Array.isArray(json?.keys) ? json.keys : [];
      setBanner({
        tone: "success",
        title: `Scan complete — ${inserted} new insight${inserted === 1 ? "" : "s"}`,
        message: keys.length ? `New: ${keys.join(", ")}` : undefined,
      });

      await fetchInsights();
      await fetchScanMeta();
    } catch (e: any) {
      setBanner({
        tone: "critical",
        title: "Scan failed",
        message: (e?.message || String(e)).slice(0, 400),
      });
    } finally {
      setScanLoading(false);
    }
  }, [apiFetch, fetchInsights, fetchScanMeta]);

  const Section = ({ title, sev, items }: { title: string; sev: Severity; items: Insight[] }) => {
    return (
      <Card>
        <Box padding="400">
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="200" blockAlign="center">
              <Text variant="headingSm" as="h3">
                {title}
              </Text>
              <Badge tone={badgeToneForSeverity(sev)}>{items.length.toString()}</Badge>
            </InlineStack>
          </InlineStack>
        </Box>

        <Divider />

        <Box padding="400">
          {items.length === 0 ? (
            <Text as="p" tone="subdued">
              Nothing flagged here.
            </Text>
          ) : (
            <BlockStack gap="300">
              {items.map((it) => (
                <InsightCard key={it.id} insight={it} />
              ))}
            </BlockStack>
          )}
        </Box>
      </Card>
    );
  };

  const topSummary = (
    <Card>
      <Box padding="400">
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="200" blockAlign="center">
              <Text as="span" variant="bodyMd" tone="subdued">
                Today
              </Text>
              <Badge tone="critical">{`${counts.high} High`}</Badge>
              <Badge tone="warning">{`${counts.medium} Medium`}</Badge>
              <Badge tone="info">{`${counts.low} Low`}</Badge>
            </InlineStack>

            <InlineStack gap="200">
              <Button onClick={() => router.push(withHost("/app/settings"))} variant="secondary">
                Email settings
              </Button>
              <Button onClick={runScan} loading={scanLoading} variant="primary">
                Run scan now
              </Button>
            </InlineStack>
          </InlineStack>

          <Text as="p" tone="subdued">
            {scanSubtitle}
          </Text>

          {scanMeta.last_status === "error" ? (
            <Text as="p" tone="critical">
              Last scan failed. Run a manual scan.
            </Text>
          ) : null}
        </BlockStack>
      </Box>
    </Card>
  );

  return (
    <Page title="Insights" subtitle={scanSubtitle}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="300">
            {banner ? (
              <Banner tone={banner.tone} title={banner.title} onDismiss={() => setBanner(null)}>
                {banner.message ? <p>{banner.message}</p> : null}
              </Banner>
            ) : null}

            {loading ? (
              <Card>
                <Box padding="400">
                  <InlineStack align="center" gap="200">
                    <Spinner accessibilityLabel="Loading insights" size="small" />
                    <Text as="span" tone="subdued">
                      Loading…
                    </Text>
                  </InlineStack>
                </Box>
              </Card>
            ) : insights.length === 0 ? (
              <>
                {topSummary}
                <Card>
                  <EmptyState
                    heading="No insights yet"
                    image="https://cdn.shopify.com/static/images/admin/emptystate.svg"
                    action={{ content: "Run scan now", onAction: runScan, loading: scanLoading }}
                    secondaryAction={{ content: "Email settings", onAction: () => router.push(withHost("/app/settings")) }}
                  >
                    <Text as="p" tone="subdued">
                      Run a scan to detect issues like inventory pressure, dead stock, velocity risk, and price volatility.
                    </Text>
                  </EmptyState>
                </Card>
              </>
            ) : (
              <>
                {topSummary}
                <Section title="High priority" sev="high" items={grouped.high} />
                <Section title="Needs attention" sev="medium" items={grouped.med} />
                <Section title="FYI" sev="low" items={grouped.low} />
              </>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
