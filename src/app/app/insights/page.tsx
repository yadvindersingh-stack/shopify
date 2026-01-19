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

type InsightRow = {
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
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

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
    const diffMs = Date.now() - created.getTime();
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
      // Ensure setup exists; if not configured, send user to setup
      const setupRes = await apiFetch("/api/setup", { cache: "no-store" });
      if (setupRes.status === 401) {
        router.replace(withHost("/app/error"));
        return;
      }
      if (setupRes.status === 403) {
  const who = await apiFetch("/api/whoami", { cache: "no-store" });
  const whoJson = await who.json().catch(() => ({}));
  const shop = whoJson?.shop;
  if (shop) {
    window.top?.location.assign(
      `/api/auth/start?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(hostParam)}`
    );
    return;
  }
}

      if (setupRes.ok) {
        const setup = await setupRes.json().catch(() => ({}));
        if (!setup?.email) {
          router.replace(withHost("/app/setup"));
          return;
        }
      }

      const res = await apiFetch("/api/insights", { cache: "no-store" });
      if (res.status === 401) {
        router.replace(withHost("/app/error"));
        return;
      }
      const data = await res.json().catch(() => []);
      setInsights(Array.isArray(data) ? data.slice(0, 5) : []);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, router, withHost]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const runScan = useCallback(async () => {
  setScanLoading(true);
  try {
    const res = await apiFetch("/api/insights/run", { method: "POST" });

    // If embedded context missing entirely
    if (res.status === 401) {
      router.replace(withHost("/app/error"));
      return;
    }

    // If we can decode shop from bearer but shop isn't installed/stored yet
    if (res.status === 403) {
      // call whoami to get the shop domain reliably
      const who = await apiFetch("/api/whoami", { cache: "no-store" });
      const whoJson = await who.json().catch(() => ({}));
      const shop = whoJson?.shop;

      if (shop) {
        const url = `/api/auth/start?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(
          hostParam
        )}`;

        // IMPORTANT: embedded apps must redirect the top frame
        window.top?.location.assign(url);
        return;
      }

      router.replace(withHost("/app/error"));
      return;
    }

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      console.error("Insights run failed:", res.status, text?.slice(0, 500));
      setBanner("Scan failed. Check logs.");
      return;
    }

    const count = Array.isArray(json?.insights) ? json.insights.length : 0;
    setBanner(`Scan complete — ${count} insight${count === 1 ? "" : "s"} found.`);
    await fetchInsights();
  } finally {
    setScanLoading(false);
  }
}, [apiFetch, router, withHost, hostParam, fetchInsights]);


  const shouldShowEmpty = useMemo(() => {
    if (!insights.length) return true;
    return !insights.some((i) => i.severity === "high" || i.severity === "medium");
  }, [insights]);

  return (
    <Page
      title="Today’s insights"
      subtitle={`Last scan: ${lastScan}`}
      primaryAction={{ content: "Run scan now", onAction: runScan, loading: scanLoading }}
      secondaryActions={[
        { content: "Settings", onAction: () => router.push(withHost("/app/settings")) },
      ]}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="300">
            {banner && (
              <Banner tone="success" title={banner} onDismiss={() => setBanner(null)} />
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
                  <InsightCard key={insight.id} insight={insight as any} />
                ))}
              </BlockStack>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
