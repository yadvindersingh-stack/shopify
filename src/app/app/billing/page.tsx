"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Banner,
  InlineStack,
} from "@shopify/polaris";
import { Redirect } from "@shopify/app-bridge/actions";
import { useAppBridge } from "@/lib/app-bridge-context";
import { useApiFetch } from "@/hooks/useApiFetch";
import { buildPathWithHost } from "@/lib/host";

type Plan = "monthly" | "yearly";

export default function BillingPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const host = sp.get("host") || "";
  const app = useAppBridge();
  const apiFetch = useApiFetch();

  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const withHost = useCallback(
    (path: string) => buildPathWithHost(path, host),
    [host]
  );

  const planCopy = useMemo(
    () => ({
      monthly: { title: "Monthly", price: "$9 CAD / month" },
      yearly: { title: "Yearly", price: "$99 CAD / year" },
    }),
    []
  );

  const start = async (plan: Plan) => {
    setErr(null);
    setLoadingPlan(plan);

    try {
      if (!host) throw new Error("Missing host in URL.");
      if (!app) throw new Error("App Bridge not initialized.");

      const res = await apiFetch(
        `/api/billing/create?plan=${encodeURIComponent(plan)}&host=${encodeURIComponent(host)}`,
        { method: "POST" }
      );

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) {
        const msg = json?.error || `Billing create failed (${res.status})`;
        const details = json?.details ? ` — ${json.details}` : "";
        throw new Error(msg + details);
      }

      const confirmationUrl = json?.confirmationUrl;
      if (!confirmationUrl) throw new Error("Missing confirmationUrl from server.");

      // ✅ IMPORTANT: break out of iframe
      const redirect = Redirect.create(app);
      redirect.dispatch(Redirect.Action.REMOTE, confirmationUrl);
    } catch (e: any) {
      setErr(e?.message || String(e));
      setLoadingPlan(null);
    }
  };

  return (
    <Page
      title="Choose a plan"
      subtitle="Start a plan to continue using MerchPulse."
      backAction={{ content: "Back to insights", onAction: () => router.push(withHost("/app/insights")) }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {err && (
              <Banner tone="critical" title="Billing error">
                <p>{err}</p>
              </Banner>
            )}

            <Card>
              <BlockStack gap="300">
                <Text as="p" tone="subdued">
                  MerchPulse runs scheduled scans and emails store health insights. Select a plan to activate billing.
                </Text>
              </BlockStack>
            </Card>

            <Layout>
              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="200">
                    <Text variant="headingMd" as="h2">
                      {planCopy.monthly.title}
                    </Text>
                    <Text as="p">{planCopy.monthly.price}</Text>
                    <InlineStack gap="200">
                      <Button
                        variant="primary"
                        loading={loadingPlan === "monthly"}
                        onClick={() => start("monthly")}
                      >
                        Start monthly
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>
              </Layout.Section>

              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="200">
                    <Text variant="headingMd" as="h2">
                      {planCopy.yearly.title}
                    </Text>
                    <Text as="p">{planCopy.yearly.price}</Text>
                    <InlineStack gap="200">
                      <Button
                        loading={loadingPlan === "yearly"}
                        onClick={() => start("yearly")}
                      >
                        Start yearly
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
