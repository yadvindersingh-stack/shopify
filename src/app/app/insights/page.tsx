"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BlockStack,
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
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [banner, setBanner] = useState<{ message: string } | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const hostParam = searchParams.get("host") || "";
  const apiFetch = useApiFetch();

  const withHost = useCallback(
    (path: string) => buildPathWithHost(path, hostParam),
    [hostParam]
  );

  const lastScan = useMemo(() => {
    if (!insights.length) return "No scans yet";
    const created = insights[0].created_at ? new Date(insights[0].created_at) : null;
    if (!created) return "No scans yet";
    const diffMinutes = Math.floor((Date.now() - created.getTime()) / 60000);
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
      // 1) Check setup
      const settingsRes = await apiFetch("/api/setup", { cache: "no-store" });

      if (settingsRes.ok) {
        const settingsText = await settingsRes.text();
        const settings = settingsText ? JSON.parse(settingsText) : null;

        if (!settings?.email) {
          router.replace(withHost("/app/setup"));
          return;
        }
      } else if (settingsRes.status === 401) {
        router.replace(withHost("/app/error"));
        return;
      }

      // 2) Load insights list
      const res = await apiFetch("/api/insights", { cache: "no-store" });
      const me = await apiFetch("/api/whoami");
console.log("whoami", me.status, await me.text());


      if (res.status === 401) {
        router.replace(withHost("/app/error"));
        return;
      }
      if (!res.ok) {
  const t = await res.text();
  console.error("Insights list failed:", res.status, t?.slice(0, 300));
  setInsights([]);
  return;
}

      const text = await res.text();
      const data = text ? JSON.parse(text) : [];
      setInsights(Array.isArray(data) ? data.slice(0, 5) : []);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, router, withHost]);

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

  const runScan = useCallback(async () => {
    setScanLoading(true);
    try {
      // ✅ IMPORTANT: use the apiFetch hook instance from top-level (includes Authorization)
      const res = await apiFetch("/api/insights/run", { method: "POST" });

      // If shop context missing, route to error (not setup)
      if (res.status === 401) {
        router.replace(withHost("/app/error"));
        return;
      }

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        // ignore
      }

      if (!res.ok) {
        console.error("Insights run failed:", res.status, text?.slice(0, 500));
        // If shop not installed/token missing, take user to setup/connect flow
        if (res.status === 403) {
          router.replace(withHost("/app/setup"));
          return;
        }
        throw new Error(`Insights API failed: ${res.status}`);
      }

      // Your run endpoint returns { insight }, not { insights }
      const count = json?.insight ? 1 : 0;
      setBanner({ message: `Scan complete — ${count} insight${count === 1 ? "" : "s"} found.` });

      await fetchInsights();
    } finally {
      setScanLoading(false);
    }
  }, [apiFetch, router, withHost, fetchInsights]);

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
                <Text as="span" variant="bodyMd" tone="subdued">
                  Loading insights…
                </Text>
              </InlineStack>
            ) : shouldShowEmpty ? (
              <Card>
                <EmptyState
                  heading="Nothing critical today"
                  image="https://cdn.shopify.com/static/images/admin/emptystate.svg"
                  action={{ content: "Run scan now", onAction: runScan, loading: scanLoading }}
                  secondaryAction={{
                    content: "Settings",
                    onAction: () => router.push(withHost("/app/settings")),
                  }}
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
