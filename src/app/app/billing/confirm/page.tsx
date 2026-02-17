"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Page, Spinner, Text } from "@shopify/polaris";

export default function BillingConfirmPage() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const chargeId = params.get("charge_id");

    if (!chargeId) {
      router.replace("/app");
      return;
    }

    fetch("/api/billing/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chargeId })
    }).then(() => {
      router.replace("/app");
    });
  }, []);

  return (
    <Page>
      <Spinner />
      <Text as="p">Confirming subscription...</Text>
    </Page>
  );
}
