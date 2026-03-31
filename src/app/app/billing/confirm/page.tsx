"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Page, Spinner, Text } from "@shopify/polaris";
import { useApiFetch } from "@/hooks/useApiFetch";
import {
  buildPathWithHost,
  getHostFromLocation,
  getShopFromLocation,
  persistEmbeddedAppContext,
} from "@/lib/host";

export default function BillingConfirmPage() {
  const router = useRouter();
  const params = useSearchParams();
  const apiFetch = useApiFetch();

  useEffect(() => {
    const chargeId = params.get("charge_id");
    const plan = params.get("plan") || "monthly";
    const host = params.get("host") || getHostFromLocation();
    const shop = getShopFromLocation();

    if (host || shop) {
      persistEmbeddedAppContext({ host, shop });
    }

    const withContext = (path: string) => buildPathWithHost(path, host || undefined, shop || undefined);
    const restoreApp = () => router.replace(withContext("/app"));

    if (!chargeId) {
      router.replace(withContext("/app/billing"));
      return;
    }

    apiFetch("/api/billing/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chargeId, plan }),
      cache: "no-store",
    })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) {
          restoreApp();
          return;
        }
        if (!r.ok) {
          const t = await r.text();
          throw new Error(t || "Confirm failed");
        }
        router.replace(withContext("/app/insights"));
      })
      .catch(() => {
        // If confirm fails, still send user back to billing page to retry.
        router.replace(withContext("/app/billing"));
      });
  }, [apiFetch, params, router]);

  return (
    <Page title="Confirming subscription">
      <Spinner />
      <Text as="p">Finalizing your subscription…</Text>
    </Page>
  );
}
