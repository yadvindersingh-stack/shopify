"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppBridgeNotReadyError, useApiFetch } from "@/hooks/useApiFetch";
import {
  buildPathWithHost,
  getHostFromLocation,
  getShopFromLocation,
  persistEmbeddedAppContext,
} from "@/lib/host";

const HOST_GRACE_MS = 2000;
const AUTH_BOOT_RETRIES = 3;
const AUTH_BOOT_WAIT_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    let cancelled = false;

    (async () => {
      if (!host) {
        setMsg("Waiting for Shopify context…");
        await sleep(HOST_GRACE_MS);
        if (cancelled) return;

        const settledHost = getHostFromLocation();
        if (!settledHost) {
          router.replace(buildPathWithHost("/app/error", undefined, queryShop || undefined));
        }
        return;
      }

      let shop = queryShop || getShopFromLocation();

      for (let attempt = 0; attempt < AUTH_BOOT_RETRIES; attempt += 1) {
        if (cancelled) return;

        try {
          setMsg(attempt === 0 ? "Resolving shop…" : "Finishing Shopify sign-in…");
          const whoRes = await apiFetch("/api/whoami", { cache: "no-store" });
          const who = await whoRes.json().catch(() => ({}));
          shop = String(who?.shop || shop || "").toLowerCase();

          if (shop) {
            persistEmbeddedAppContext({ host, shop });
          }

          if (whoRes.status === 401 || whoRes.status === 403) {
            if (attempt < AUTH_BOOT_RETRIES - 1) {
              await sleep(AUTH_BOOT_WAIT_MS);
              continue;
            }
            router.replace(buildAppPath("/app/error", shop || undefined));
            return;
          }

          if (!whoRes.ok || !shop) {
            if (attempt < AUTH_BOOT_RETRIES - 1) {
              await sleep(AUTH_BOOT_WAIT_MS);
              continue;
            }
            router.replace(buildAppPath("/app/error"));
            return;
          }

          setMsg("Checking app setup…");
          const setupRes = await apiFetch("/api/setup", { cache: "no-store" });
          const setup = await setupRes.json().catch(() => ({}));

          if (setupRes.status === 401 || setupRes.status === 403) {
            if (attempt < AUTH_BOOT_RETRIES - 1) {
              setMsg("Restoring app access…");
              await sleep(AUTH_BOOT_WAIT_MS);
              continue;
            }
            router.replace(buildAppPath("/app/error", shop));
            return;
          }

          const hasEmail = Boolean(setup?.email);
          router.replace(buildAppPath(hasEmail ? "/app/insights" : "/app/setup", shop));
          return;
        } catch (error) {
          if (error instanceof AppBridgeNotReadyError && attempt < AUTH_BOOT_RETRIES - 1) {
            setMsg("Connecting to Shopify…");
            await sleep(AUTH_BOOT_WAIT_MS);
            continue;
          }

          console.error("AppEntry bootstrap failed", error);
          router.replace(buildAppPath("/app/error", shop || undefined));
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiFetch, host, queryShop, router]);

  return <div style={{ padding: 16, fontFamily: "system-ui" }}>{msg}</div>;
}
