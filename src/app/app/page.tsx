"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApiFetch } from "@/hooks/useApiFetch";
import { buildPathWithHost } from "@/lib/host";
import TopRedirect from "@/components/TopRedirect";

export default function AppEntry() {
  const router = useRouter();
  const sp = useSearchParams();
  const apiFetch = useApiFetch();
  const once = useRef(false);

  const [msg, setMsg] = useState("Booting…");
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);

  const host = useMemo(() => sp.get("host") || "", [sp]);

  useEffect(() => {
    if (once.current) return;
    once.current = true;

    (async () => {
      if (!host) {
        router.replace("/app/error");
        return;
      }

      setMsg("Resolving shop…");
      const whoRes = await apiFetch("/api/whoami", { cache: "no-store" });
      const who = await whoRes.json().catch(() => ({}));
      const shop = String(who?.shop || "").toLowerCase();

      if (!whoRes.ok || !shop) {
        router.replace(buildPathWithHost("/app/error", host));
        return;
      }

      setMsg("Checking install status…");
      const instRes = await apiFetch("/api/install-status", { cache: "no-store" });
      const inst = await instRes.json().catch(() => ({}));

      if (instRes.status === 401) {
        router.replace(buildPathWithHost("/app/error", host));
        return;
      }

      const installed = Boolean(inst?.ok && inst?.installed);

      if (!installed) {
        const url = `/api/auth/start?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`;
        setOauthUrl(url);
        return;
      }

      setMsg("Checking setup…");
      const setupRes = await apiFetch("/api/setup", { cache: "no-store" });
      const setup = await setupRes.json().catch(() => ({}));

      if (setupRes.status === 401) {
        router.replace(buildPathWithHost("/app/error", host));
        return;
      }

      const hasEmail = Boolean(setup?.email);
      router.replace(buildPathWithHost(hasEmail ? "/app/insights" : "/app/setup", host));
    })().catch((e) => {
      console.error("AppEntry bootstrap failed", e);
      router.replace(buildPathWithHost("/app/error", host));
    });
  }, [apiFetch, router, host]);

  // This is the key: redirect via App Bridge if we need OAuth
  if (oauthUrl) return <TopRedirect url={oauthUrl} />;

  return <div style={{ padding: 16, fontFamily: "system-ui" }}>{msg}</div>;
}
