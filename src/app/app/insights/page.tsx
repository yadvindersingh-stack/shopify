"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BlockStack,
  Button,
  Card,
  EmptyState,
  InlineStack,
  Layout,
  Page,
  Spinner,
  Text,
  Banner,
} from "@shopify/polaris";
import InsightCard from "@/components/InsightCard";
import { buildPathWithHost } from "@/lib/host";
import { useApiFetch } from "@/hooks/useApiFetch";

type Insight = {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  suggested_action: string;
  data_snapshot: Record<string, any>;
  created_at?: string;
};

export default function InsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [scanLoading, setScanLoading] = useState<boolean>(false);
  const [banner, setBanner] = useState<{ message: string } | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const hostParam = searchParams.get("host") || "";
  const withHost = useCallback((path: string) => buildPathWithHost(path, hostParam), [hostParam]);
  const apiFetch = useApiFetch();

  const lastScan = useMemo(() => {
    if (!insights.length) return "No scans yet";
    const created = insights[0].created_at ? new Date(insights[0].created_at) : null;
    if (!created) return "No scans yet";
    const now = Date.now();
    const diffMs = now - created.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  }, [insights]);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      const settingsRes = await apiFetch("/api/setup", { cache: "no-store" });
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        if (!settings?.email) {
          setLoading(false);
          router.replace(withHost("/app/setup"));
          return;
        }
      }
      const res = await apiFetch("/api/insights", { cache: "no-store" });
      if (res.status === 401) {
        router.replace(withHost("/app/setup"));
        return;
      }
      const data = await res.json();
      const sliced = Array.isArray(data) ? data.slice(0, 5) : [];
      setInsights(sliced);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  useEffect(() => {
    const scan = searchParams.get("scan");
    const count = searchParams.get("count");
    if (scan === "complete") {
      setBanner({ message: `Scan complete — ${count ?? "0"} insights found.` });
      router.replace(withHost("/app/insights"));
    }
  }, [router, searchParams, withHost]);

  const runScan = async () => {
    setScanLoading(true);
    try {
      const apiFetch = useApiFetch();
const res = await apiFetch("/api/insights/run", { method: "POST" });

      if (res.status === 401) {
        router.replace(withHost("/app/setup"));
        return;
      }

const text = await res.text(); // read raw first
let json: any = null;

try {
  json = text ? JSON.parse(text) : null;
} catch {
  // not JSON (could be HTML error page)
}

if (!res.ok) {
  console.error("Insights run failed:", res.status, text?.slice(0, 500));
  throw new Error(`Insights API failed: ${res.status}`);
}

if (!json) {
  console.error("Insights API returned empty/non-JSON body:", res.status, text?.slice(0, 500));
  throw new Error("Insights API returned invalid response");
}

// use json.insight, etc.

      const count = Array.isArray(json?.insights) ? json.insights.length : 0;
      setBanner({ message: `Scan complete — ${count} insights found.` });
      await fetchInsights();
    } catch (e: any) {
      console.error("Failed to run insights", e);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const shouldShowEmpty = useMemo(() => {
    if (!insights.length) return true;
    return !insights.some((i) => i.severity === "high" || i.severity === "medium");
  }, [insights]);

  return (
    <Page
      title="Today’s insights"
      subtitle={`Last scan: ${lastScan}`}
      primaryAction={{ content: "Run scan now", onAction: runScan, loading: scanLoading }}
      secondaryActions={[{ content: "Settings", onAction: () => router.push(withHost("/app/settings")) }]}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="300">
            {banner && (
              <Banner tone="success" title={banner.message} onDismiss={() => setBanner(null)} />
            )}

            {loading ? (
              <InlineStack align="center">
                <Spinner accessibilityLabel="Loading insights" size="small" />
                <Text as="span" variant="bodyMd" tone="subdued">Loading insights…</Text>
              </InlineStack>
            ) : shouldShowEmpty ? (
              <Card>
                <EmptyState
                  heading="Nothing critical today"
                  image="https://cdn.shopify.com/static/images/admin/emptystate.svg"
                  action={{ content: "Run scan now", onAction: runScan, loading: scanLoading }}
                  secondaryAction={{ content: "Settings", onAction: () => router.push(withHost("/app/settings")) }}
                >
                  <Text as="p" tone="subdued">
                    Your store looks stable based on the last scan. We’ll email you when something changes.
                  </Text>
                </EmptyState>
              </Card>
            ) : (
              <BlockStack gap="300">
                {insights.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </BlockStack>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
