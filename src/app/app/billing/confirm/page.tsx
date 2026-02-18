"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Page, Spinner, Text, Banner, BlockStack } from "@shopify/polaris";
import { useApiFetch } from "@/hooks/useApiFetch";

export default function BillingConfirmPage() {
   const apiFetch = useApiFetch();
  const router = useRouter();
  const params = useSearchParams();

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const chargeId = params.get("charge_id") || "";
      const plan = params.get("plan") || "monthly";

      if (!chargeId) {
        router.replace("/app");
        return;
      }

      const res = await apiFetch("/api/billing/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chargeId, plan }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json?.error || "Failed to confirm subscription");
        return;
      }

      router.replace("/app");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Page title="Confirming subscription">
      <BlockStack gap="300">
        {error ? (
          <Banner tone="critical" title="Billing confirmation failed">
            <p>{error}</p>
          </Banner>
        ) : (
          <>
            <Spinner />
            <Text as="p">Confirming your plan in Shopify…</Text>
          </>
        )}
      </BlockStack>
    </Page>
  );
}
