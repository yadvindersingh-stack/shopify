"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Page, Card, BlockStack, Text, Spinner, Banner } from "@shopify/polaris";
import { useApiFetch } from "@/hooks/useApiFetch";
import { buildPathWithHost } from "@/lib/host";

export default function BillingConfirmPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const apiFetch = useApiFetch();

  const host = sp.get("host") || "";
  const chargeId = sp.get("charge_id") || "";
  const plan = (sp.get("plan") || "") as "monthly" | "yearly" | "";

  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [err, setErr] = useState<string | null>(null);

  const backToInsights = useMemo(() => buildPathWithHost("/app/insights", host), [host]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        if (!host) throw new Error("Missing host.");
        if (!chargeId) throw new Error("Missing charge_id from Shopify.");

        const res = await apiFetch("/api/billing/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chargeId, plan }),
        });

        const text = await res.text();
        let json: any = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {}

        if (!res.ok) {
          const msg = json?.error || `Billing confirm failed (${res.status})`;
          const details = json?.details ? ` — ${json.details}` : "";
          throw new Error(msg + details);
        }

        if (cancelled) return;
        setStatus("ok");

        // ✅ back to app
        router.replace(backToInsights);
      } catch (e: any) {
        if (cancelled) return;
        setStatus("error");
        setErr(e?.message || String(e));
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [apiFetch, backToInsights, chargeId, host, plan, router]);

  return (
    <Page title="Confirming billing">
      <Card>
        <BlockStack gap="300">
          {status === "loading" && (
            <>
              <Spinner accessibilityLabel="Confirming billing" size="small" />
              <Text as="p" tone="subdued">
                Finalizing your subscription…
              </Text>
            </>
          )}

          {status === "error" && (
            <Banner tone="critical" title="Billing confirmation failed">
              <p>{err}</p>
            </Banner>
          )}
        </BlockStack>
      </Card>
    </Page>
  );
}
