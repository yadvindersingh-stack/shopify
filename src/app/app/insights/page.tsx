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

  const [billingLoading, setBillingLoading] = useState(true);
  const [isPaid, setIsPaid] = useState<boolean>(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const apiFetch = useApiFetch();

  const hostParam = searchParams.get("host") || "";
  const shopParam = (searchParams.get("shop") || "").toLowerCase();

  const withHost = useCallback((path: string) => buildPathWithHost(path, hostParam), [hostParam]);

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

const goChoosePlan = useCallback(() => {
  window.top!.location.href = `/api/billing/redirect`;
}, []);


  const fetchBillingStatus = useCallback(async () => {
    setBillingLoading(true);
    try {
      const res = await apiFetch("/api/billing/status", { cache: "no-store" });
      if (!res.ok) {
        setIsPaid(false);
        return;
      }
      const json = await res.json();
      setIsPaid(Boolean(json?.active));
    } catch {
      setIsPaid(false);
    } finally {
      setBillingLoading(false);
    }
  }, [apiFetch]);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      const settingsRes = await apiFetch("/api/setup", { cache: "no-store" });
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        // Setup page remains optional; don't hard block Insights
        // but if they haven't set email yet, you can still route them.
        if (!settings?.email) {
          // Keep optional behavior:
          // router.replace(withHost("/app/setup"));
          // return;
        }
      }

      const res = await apiFetch("/api/insights", { cache: "no-store" });
      if (res.status === 401) {
        router.replace(withHost("/app/error"));
        return;
      }
      const data = await res.json();
      const sliced = Array.isArray(data) ? data.slice(0, 25) : [];
      setInsights(sliced);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, router, withHost]);

  useEffect(() => {
    fetchBillingStatus();
    fetchInsights();
  }, [fetchBillingStatus, fetchInsights]);

  useEffect(() => {
    const scan = searchParams.get("scan");
    const count = searchParams.get("count");
    if (scan === "complete") {
      setBanner({ message: `Scan complete — ${count ?? "0"} insights found.` });
      router.replace(withHost("/app/insights"));
    }
  }, [router, searchParams, withHost]);

  const runScan = useCallback(async () => {
    if (!isPaid) {
      setBanner({ message: "Choose a plan to run scans." });
      return;
    }

    setScanLoading(true);
    try {
      const res = await apiFetch("/api/insights/run", { method: "POST" });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) {
        console.error("Insights run failed:", res.status, text?.slice(0, 500));
        throw new Error(`Insights API failed: ${res.status}`);
      }

      const count = Array.isArray(json?.keys) ? json.keys.length : 0;
      setBanner({ message: `Scan complete — ${count} insights found.` });
      await fetchInsights();
    } catch (e: any) {
      console.error("Failed to run insights", e);
      setBanner({ message: "Scan failed — check logs." });
    } finally {
      setScanLoading(false);
    }
  }, [apiFetch, fetchInsights, isPaid]);

  const shouldShowEmpty = useMemo(() => {
    if (!insights.length) return true;
    return !insights.some((i) => i.severity === "high" || i.severity === "medium");
  }, [insights]);

  const primaryAction = useMemo(() => {
    if (billingLoading) return { content: "Checking plan…", disabled: true } as any;
    if (!isPaid) {
      return {
        content: "Choose a plan",
        onAction: goChoosePlan,
      };
    }
    return { content: "Run scan now", onAction: runScan, loading: scanLoading };
  }, [billingLoading, isPaid, goChoosePlan, runScan, scanLoading]);

  return (
    <Page
      title="Today’s insights"
      subtitle={`Last scan: ${lastScan}`}
      primaryAction={primaryAction}
      secondaryActions={[
        { content: "Settings", onAction: () => router.push(withHost("/app/settings")) },
      ]}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="300">
            {banner && <Banner tone="success" title={banner.message} onDismiss={() => setBanner(null)} />}

            {!billingLoading && !isPaid && (
              <Banner
                tone="warning"
                title="Plan required to run scans"
                action={{ content: "Choose a plan", onAction: goChoosePlan }}
              >
                <Text as="p">
                  MerchPulse uses Shopify billing. Pick a plan to enable automated scans and email digests.
                </Text>
              </Banner>
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
                  heading={isPaid ? "Nothing critical today" : "Choose a plan to enable scans"}
                  image="https://cdn.shopify.com/static/images/admin/emptystate.svg"
                  action={{
                    content: isPaid ? "Run scan now" : "Choose a plan",
                    onAction: isPaid ? runScan : goChoosePlan,
                    loading: isPaid ? scanLoading : false,
                  }}
                  secondaryAction={{
                    content: "Settings",
                    onAction: () => router.push(withHost("/app/settings")),
                  }}
                >
                  <Text as="p" tone="subdued">
                    {isPaid
                      ? "Your store looks stable based on the last scan."
                      : "Pick a plan to start monitoring sales and inventory risks."}
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
