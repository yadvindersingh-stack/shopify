"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Page, Spinner, Text, Banner } from "@shopify/polaris";

export default function BillingConfirmPage() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const chargeId = params.get("charge_id");
    const plan = params.get("plan") || "monthly";

    if (!chargeId) {
      router.replace("/app");
      return;
    }

    fetch("/api/billing/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chargeId, plan }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const t = await r.text();
          throw new Error(t || "Confirm failed");
        }
        router.replace("/app");
      })
      .catch(() => {
        // If confirm fails, still send user back to billing page to retry.
        router.replace("/app/billing");
      });
  }, [params, router]);

  return (
    <Page title="Confirming subscription">
      <Spinner />
      <Text as="p">Finalizing your subscription…</Text>
    </Page>
  );
}
