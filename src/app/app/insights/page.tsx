"use client";

import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
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
import { Redirect } from "@shopify/app-bridge/actions";
import { useAppBridge } from "@/lib/app-bridge-context";
//import { useRef } from "react";
const didInit = useRef(false);

function useShopifyRedirect() {
  const app = useAppBridge();

  return (to: string) => {
    // must be absolute for REMOTE
    const absolute = to.startsWith("http") ? to : `${window.location.origin}${to}`;

    if (app) {
      const redirect = Redirect.create(app);
      redirect.dispatch(Redirect.Action.REMOTE, absolute);
      return;
    }

    // fallback (non-embedded)
    window.location.assign(absolute);
  };
}


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

const redirectRemote = useShopifyRedirect();

const fetchInsights = useCallback(async () => {
  setLoading(true);
  try {
   const setupRes = await apiFetch("/api/setup", { cache: "no-store" });

if (setupRes.status === 401) {
  setBanner("Missing shop context. Please relaunch from Shopify Admin.");
  return;
}

if (setupRes.status === 403) {
  setBanner("Shop not installed yet. Please reinstall the app.");
  return;
}

let setup: any = {};
try { setup = await setupRes.json(); } catch {}

// TEMP: do not redirect to /app/setup yet (it causes loops in messy states)
if (!setup?.email) {
  setBanner("Setup incomplete: add email in Settings to enable digests (we’ll still show insights).");
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
}, [apiFetch, router, withHost, hostParam, redirectRemote]);


  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

useEffect(() => {
  let cancelled = false;

  (async () => {
    if (cancelled) return;
    await fetchInsights();
  })();

  return () => {
    cancelled = true;
  };
}, []); // <-- empty deps


//const redirectRemote = useShopifyRedirect();

const runScan = useCallback(async () => {
  setScanLoading(true);
  try {
    const res = await apiFetch("/api/insights/run", { method: "POST" });

    if (res.status === 401) {
      router.replace(withHost("/app/error"));
      return;
    }

    if (res.status === 403) {
      const who = await apiFetch("/api/whoami", { cache: "no-store" });
      const whoJson = await who.json().catch(() => ({}));
      const shop = whoJson?.shop;

      if (shop) {
        redirectRemote(
          `/api/auth/start?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(hostParam)}`
        );
        return;
      }

      setBanner("Missing shop context. Please relaunch from Shopify Admin.");
      return;
    }

    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch {}

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
}, [apiFetch, router, withHost, hostParam, redirectRemote, fetchInsights]);



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


