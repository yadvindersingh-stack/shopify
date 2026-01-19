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
  Banner,
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
  const [banner, setBanner] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const hostParam = searchParams.get("host") || "";
  const withHost = (path: string) => buildPathWithHost(path, hostParam);
  const apiFetch = useApiFetch();

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/setup", { method: "GET", cache: "no-store" });

        if (res.status === 401) {
          router.replace(withHost("/app/error"));
          return;
        }

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data?.email) setEmail(data.email);
          if (typeof data?.daily_enabled === "boolean") setDaily(data.daily_enabled);
          if (typeof data?.weekly_enabled === "boolean") setWeekly(data.weekly_enabled);
        }
      } catch (e: any) {
        setBanner(e?.message || "Failed to load setup settings");
      } finally {
        setPrefillLoading(false);
      }
    })();
  }, [apiFetch, router, hostParam]);

  const primaryDisabled = useMemo(
    () => !email.trim() || loading || prefillLoading,
    [email, loading, prefillLoading]
  );

  async function handleSave() {
    setLoading(true);
    setBanner(null);
    try {
      const res = await apiFetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, daily_enabled: daily, weekly_enabled: weekly }),
      });

      if (res.status === 401) {
        router.replace(withHost("/app/error"));
        return;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Setup save failed (${res.status})`);
      }

      router.replace(withHost("/app/insights"));
    } catch (e: any) {
      setBanner(e?.message || "Failed to save settings");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page
      title="Your daily store action list"
      subtitle="We scan your store and email the most important things to fix. No changes are made automatically."
    >
      <Layout>
        <Layout.Section>
          {banner && (
            <Banner tone="critical" title="Setup problem">
              <p>{banner}</p>
            </Banner>
          )}

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

              <InlineStack gap="200">
                <Button
                  variant="primary"
                  loading={loading}
                  disabled={primaryDisabled}
                  onClick={handleSave}
                >
                  Save & continue
                </Button>
                <Button variant="plain" onClick={() => router.push(withHost("/app/insights"))}>
                  Skip for now
                </Button>
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
