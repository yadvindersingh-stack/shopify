"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Page, Spinner, Text, Banner } from "@shopify/polaris";
import { useApiFetch } from "@/hooks/useApiFetch";

export default function BillingConfirmPage() {
  const router = useRouter();
  const params = useSearchParams();
  const apiFetch = useApiFetch();

  useEffect(() => {
    const chargeId = params.get("charge_id");
    const plan = (params.get("plan") === "yearly" ? "yearly" : "monthly") as "monthly" | "yearly";

    // host is useful for returning to embedded app cleanly
    const host = params.get("host") || "";

    if (!chargeId) {
      router.replace(host ? `/app?host=${encodeURIComponent(host)}` : "/app");
      return;
    }

    (async () => {
      try {
        await apiFetch("/api/billing/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ chargeId, plan }),
        });
      } finally {
        router.replace(host ? `/app?host=${encodeURIComponent(host)}` : "/app");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Page>
      <Spinner />
      <Text as="p">Confirming subscription…</Text>
      <Banner tone="info">
        <p>If this takes more than a few seconds, reload the app from Shopify Admin.</p>
      </Banner>
    </Page>
  );
}
