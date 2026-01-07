"use client";
import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BlockStack,
  Button,
  Card,
  Checkbox,
  InlineStack,
  Layout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useApiFetch } from "@/hooks/useApiFetch";

function buildPathWithHost(path: string, host: string) {
  if (!host) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}host=${encodeURIComponent(host)}`;
}

function SetupPageInner() {
  const [email, setEmail] = useState("");
  const [daily, setDaily] = useState(true);
  const [weekly, setWeekly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const hostParam = searchParams.get("host") || "";
  const withHost = (path: string) => buildPathWithHost(path, hostParam);
  const apiFetch = useApiFetch();

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/setup", { method: "GET" });
        if (res.ok) {
          const data = await res.json();
          if (data?.email) setEmail(data.email);
          if (typeof data?.daily_enabled === "boolean") setDaily(data.daily_enabled);
          if (typeof data?.weekly_enabled === "boolean") setWeekly(data.weekly_enabled);
        }
      } finally {
        setPrefillLoading(false);
      }
    })();
  }, []);

  const primaryDisabled = useMemo(() => !email.trim() || loading || prefillLoading, [email, loading, prefillLoading]);

  async function handleRunScan() {
    setLoading(true);
    try {
      await apiFetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, daily_enabled: daily, weekly_enabled: weekly }),
      });
      const res = await apiFetch("/api/insights/run", { method: "POST", cache: "no-store" });
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

      const count = Array.isArray(json?.insights) ? json.insights.length : 0;
      const base = `/app/insights?scan=complete&count=${count}`;
      router.push(withHost(base));
    } catch (e: any) {
      console.error("Failed to run insights", e);
      throw e;
    } finally {
      setLoading(false);
    }
  }
      
  return (
    <Page title="Your daily store action list" subtitle="We scan your store and email the most important things to fix. No changes are made automatically.">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingSm">
                Email & cadence
              </Text>
              <TextField
                label="Send insights to"
                type="email"
                value={email}
                onChange={setEmail}
                requiredIndicator
                autoComplete="email"
                helpText="We'll use this email for all digests."
              />
              <BlockStack gap="200">
                <Checkbox
                  label="Daily insights"
                  checked={daily}
                  onChange={(value) => setDaily(Boolean(value))}
                  helpText="Daily emails are short — usually 3 items."
                />
                <Checkbox
                  label="Weekly summary"
                  checked={weekly}
                  onChange={(value) => setWeekly(Boolean(value))}
                />
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingSm">
                First scan
              </Text>
              <InlineStack gap="200">
                <Button variant="primary" loading={loading} disabled={primaryDisabled} onClick={handleRunScan}>
                  {loading ? "Running scan..." : "Run my first scan"}
                </Button>
                <Button variant="plain" onClick={() => router.push(withHost("/app/insights"))}>Skip for now</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export default function SetupPage() {
  return (
    <Suspense fallback={null}>
      <SetupPageInner />
    </Suspense>
  );
}
