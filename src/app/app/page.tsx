"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { buildPathWithHost } from "@/lib/host";
import { useApiFetch } from "@/hooks/useApiFetch";

export default function AppEntry() {
  const sp = useSearchParams();
  const router = useRouter();
  const apiFetch = useApiFetch();

  const didRun = useRef(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    (async () => {
      const host = sp.get("host") || "";
      if (!host) {
        router.replace("/app/error");
        return;
      }

      // 1) Who am I? (requires Authorization bearer token)
      const whoRes = await apiFetch("/api/whoami", { cache: "no-store" });
      if (whoRes.status === 401) {
        router.replace(buildPathWithHost("/app/error", host));
        return;
      }
      const who = await whoRes.json().catch(() => ({}));
      const shop = (who?.shop || "").toLowerCase();
      if (!shop) {
        router.replace(buildPathWithHost("/app/error", host));
        return;
      }

      // 2) Installed? (do we have a shop row + access token)
      const installRes = await apiFetch(`/api/install-status`, { cache: "no-store" });
      // We assume your install-status uses resolveShop and returns { installed: boolean }.
      // If it returns something else, we’ll adjust after you paste it.
      if (installRes.status === 401) {
        router.replace(buildPathWithHost("/app/error", host));
        return;
      }
      const installJson = await installRes.json().catch(() => ({}));
      const installed = installJson?.ok ? Boolean(installJson?.installed) : false;

      if (!installed) {
        const url = `/api/auth/start?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`;
        window.top?.location.assign(url);
        return;
      }

      // 3) Setup done?
      const setupRes = await apiFetch("/api/setup", { cache: "no-store" });
      if (setupRes.status === 401) {
        router.replace(buildPathWithHost("/app/error", host));
        return;
      }
      const setupJson = await setupRes.json().catch(() => ({}));
      const hasEmail = Boolean(setupJson?.email);

      const target = hasEmail ? "/app/insights" : "/app/setup";
      router.replace(buildPathWithHost(target, host));
    })().catch((e: any) => {
      console.error("AppEntry bootstrap failed", e);
      setErr(e?.message || String(e));
      // fall back to error page with host if possible
      const host = sp.get("host") || "";
      router.replace(buildPathWithHost("/app/error", host));
    });
  }, [apiFetch, router, sp]);

  // Minimal UI while routing
  return err ? <div style={{ padding: 16 }}>{err}</div> : null;
}
