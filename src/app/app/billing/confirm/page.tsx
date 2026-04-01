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
    const host = params.get("host") || getHostFromLocation();
    const shop = getShopFromLocation();

    if (host || shop) {
      persistEmbeddedAppContext({ host, shop });
    }

    const withContext = (path: string) => buildPathWithHost(path, host || undefined, shop || undefined);
    const restoreApp = () => router.replace(withContext("/app"));

    apiFetch("/api/billing/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
        const payload = await r.json().catch(() => ({}));
        if (!payload?.active) {
          router.replace(withContext("/app/billing"));
          return;
        }
        router.replace(withContext("/app/insights"));
      })
      .catch(() => {
        router.replace(withContext("/app/billing"));
      });
  }, [apiFetch, params, router]);

  return (
    <Page title="Checking plan status">
      <Spinner />
      <Text as="p">Checking your Shopify plan approval…</Text>
    </Page>
  );
}
