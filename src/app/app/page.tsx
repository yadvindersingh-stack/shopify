"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApiFetch } from "@/hooks/useApiFetch";
import {
  buildPathWithHost,
  getHostFromLocation,
  getShopFromLocation,
  persistEmbeddedAppContext,
} from "@/lib/host";

export default function AppEntry() {
  const router = useRouter();
  const sp = useSearchParams();
  const apiFetch = useApiFetch();

  const [msg, setMsg] = useState("Booting…");

  const host = useMemo(() => sp.get("host") || getHostFromLocation(), [sp]);
  const queryShop = useMemo(() => (sp.get("shop") || "").toLowerCase(), [sp]);

  function buildAppPath(path: string, shop?: string) {
    return buildPathWithHost(path, host || undefined, shop || queryShop || undefined);
  }

  useEffect(() => {
    (async () => {
      if (!host) {
        setMsg("Waiting for Shopify context…");
        router.replace(buildPathWithHost("/app/error", undefined, queryShop || undefined));
        return;
      }

      setMsg("Resolving shop…");
      const whoRes = await apiFetch("/api/whoami", { cache: "no-store" });
      const who = await whoRes.json().catch(() => ({}));
      const shop = String(who?.shop || queryShop || getShopFromLocation() || "").toLowerCase();

      if (shop) {
        persistEmbeddedAppContext({ host, shop });
      }

      if (whoRes.status === 401 || whoRes.status === 403) {
        router.replace(buildAppPath("/app/error"));
        return;
      }

      if (!whoRes.ok || !shop) {
        router.replace(buildAppPath("/app/error"));
        return;
      }

      setMsg("Checking app setup…");
      const setupRes = await apiFetch("/api/setup", { cache: "no-store" });
      const setup = await setupRes.json().catch(() => ({}));

      if (setupRes.status === 401 || setupRes.status === 403) {
        setMsg("Unable to restore app access…");
        router.replace(buildAppPath("/app/error", shop));
        return;
      }

      const hasEmail = Boolean(setup?.email);
      router.replace(buildAppPath(hasEmail ? "/app/insights" : "/app/setup", shop));
    })().catch((e) => {
      console.error("AppEntry bootstrap failed", e);
      router.replace(buildAppPath("/app/error"));
    });
  }, [apiFetch, router, host, queryShop]);

  return <div style={{ padding: 16, fontFamily: "system-ui" }}>{msg}</div>;
}
