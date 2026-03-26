"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApiFetch } from "@/hooks/useApiFetch";
import {
  buildPathWithHost,
  getHostFromLocation,
  getShopFromLocation,
  persistEmbeddedAppContext,
} from "@/lib/host";
import TopRedirect from "@/components/TopRedirect";

export default function AppEntry() {
  const router = useRouter();
  const sp = useSearchParams();
  const apiFetch = useApiFetch();
  const once = useRef(false);

  const [msg, setMsg] = useState("Booting…");
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);

  const host = useMemo(() => sp.get("host") || getHostFromLocation(), [sp]);
  const queryShop = useMemo(() => (sp.get("shop") || "").toLowerCase(), [sp]);

  function buildAppPath(path: string, shop?: string) {
    return buildPathWithHost(path, host || undefined, shop || queryShop || undefined);
  }

  function beginOAuth(shop: string) {
    const relative = buildPathWithHost(
      `/api/auth/start?shop=${encodeURIComponent(shop)}`,
      host || undefined
    );
    const absolute =
      typeof window !== "undefined" ? new URL(relative, window.location.origin).toString() : relative;

    console.log("NEED_INSTALL_REDIRECT", { shop, host, absolute });
    setOauthUrl(absolute);
  }

  useEffect(() => {
    if (once.current) return;
    once.current = true;

    (async () => {
      if (!host) {
        const storedShop = getShopFromLocation();
        if (storedShop) {
          setMsg("Restoring Shopify session…");
          beginOAuth(storedShop);
          return;
        }

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
        if (shop) {
          setMsg("Reconnecting to Shopify…");
          beginOAuth(shop);
          return;
        }

        router.replace(buildAppPath("/app/error"));
        return;
      }

      if (!whoRes.ok || !shop) {
        router.replace(buildAppPath("/app/error"));
        return;
      }

      setMsg("Checking install status…");
      const instRes = await apiFetch("/api/install-status", { cache: "no-store" });
      const inst = await instRes.json().catch(() => ({}));

      if (instRes.status === 401 || instRes.status === 403) {
        setMsg("Refreshing install state…");
        beginOAuth(shop);
        return;
      }

      const installed = Boolean(inst?.ok && inst?.installed);

      if (!installed) {
        setMsg("Starting Shopify install…");
        beginOAuth(shop);
        return;
      }

      setMsg("Checking setup…");
      const setupRes = await apiFetch("/api/setup", { cache: "no-store" });
      const setup = await setupRes.json().catch(() => ({}));

      if (setupRes.status === 401 || setupRes.status === 403) {
        setMsg("Refreshing app access…");
        beginOAuth(shop);
        return;
      }

      const hasEmail = Boolean(setup?.email);
      router.replace(buildAppPath(hasEmail ? "/app/insights" : "/app/setup", shop));
    })().catch((e) => {
      console.error("AppEntry bootstrap failed", e);
      router.replace(buildAppPath("/app/error"));
    });
  }, [apiFetch, router, host, queryShop]);

  if (oauthUrl) return <TopRedirect url={oauthUrl} />;

  return <div style={{ padding: 16, fontFamily: "system-ui" }}>{msg}</div>;
}
