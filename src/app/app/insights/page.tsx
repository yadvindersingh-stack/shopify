"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  Button,
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
  const [banner, setBanner] = useState<{ tone: "critical" | "warning" | "success" | "info"; title: string; body?: string } | null>(null);
  const [setupMissing, setSetupMissing] = useState(false);

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
    setBanner(null);
    setSetupMissing(false);

    try {
      // 1) Setup check (do NOT redirect automatically)
      const setupRes = await apiFetch("/api/setup", { cache: "no-store" });

      if (setupRes.status === 401) {
        setBanner({ tone: "critical", title: "Missing shop context", body: "Please relaunch this app from Shopify Admin." });
        return;
      }
      if (setupRes.status === 403) {
        setBanner({ tone: "critical", title: "Shop not installed", body: "Please reinstall the app." });
        return;
      }

      let setup: any = {};
      try {
        setup = await setupRes.json();
      } catch {
        setup = {};
      }

      if (!setup?.email) {
        setSetupMissing(true);
        setBanner({
          tone: "warning",
          title: "Finish setup to enable scans",
          body: "Add an email in Setup so we can send daily/weekly digests. You can still view insights history.",
        });
      }

      // 2) Insights list
      const res = await apiFetch("/api/insights", { cache: "no-store" });

      if (res.status === 401) {
        setBanner({ tone: "critical", title: "Missing shop context", body: "Please relaunch this app from Shopify Admin." });
        return;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setBanner({ tone: "critical", title: "Failed to load insights", body: text || `HTTP ${res.status}` });
        return;
      }

      const data = await res.json().catch(() => []);
      setInsights(Array.isArray(data) ? data.slice(0, 5) : []);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const runScan = useCallback(async () => {
    setScanLoading(true);
    setBanner(null);

    try {
      // If setup missing, do NOT auto-redirect; give a clear CTA
      if (setupMissing) {
        setBanner({
          tone: "warning",
          title: "Setup required",
          body: "Please add an email in Setup before running a scan.",
        });
        return;
      }

      const res = await apiFetch("/api/insights/run", { method: "POST" });

      if (res.status === 401) {
        setBanner({ tone: "critical", title: "Missing shop context", body: "Please relaunch this app from Shopify Admin." });
        return;
      }
      if (res.status === 403) {
        const text = await res.text().catch(() => "");
        setBanner({ tone: "critical", title: "Shop not installed", body: text || "Missing access token. Reinstall the app." });
        return;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setBanner({ tone: "critical", title: "Scan failed", body: text || `HTTP ${res.status}` });
        return;
      }

      const json = await res.json().catch(() => ({}));
      const count = Array.isArray(json?.insights) ? json.insights.length : (json?.insight ? 1 : 0);

      setBanner({ tone: "success", title: `Scan complete — ${count} insight${count === 1 ? "" : "s"} found.` });

      await fetchInsights();
    } finally {
      setScanLoading(false);
    }
  }, [apiFetch, setupMissing, fetchInsights]);

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
              <Banner tone={banner.tone} title={banner.title} onDismiss={() => setBanner(null)}>
                {banner.body ? <p>{banner.body}</p> : null}
                {setupMissing ? (
                  <div style={{ marginTop: 12 }}>
                    <Button onClick={() => router.push(withHost("/app/setup"))}>Go to Setup</Button>
                  </div>
                ) : null}
              </Banner>
            )}
{banner?.title === "Shop not installed" ? (
  <div style={{ marginTop: 12 }}>
    <Button
      onClick={async () => {
        const whoRes = await apiFetch("/api/whoami", { cache: "no-store" });
        const who = await whoRes.json().catch(() => ({}));
        const shop = who?.shop;
        if (!shop) return;
        window.top?.location.assign(
          `/api/auth/start?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(hostParam)}`
        );
      }}
    >
      Install / reconnect
    </Button>
  </div>
) : null}

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
                    content: "Setup",
                    onAction: () => router.push(withHost("/app/setup")),
                  }}
                >
                  <Text as="p" tone="subdued">
                    Your store looks stable based on the last scan.
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
