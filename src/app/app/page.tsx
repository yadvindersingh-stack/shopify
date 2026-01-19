"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApiFetch } from "@/hooks/useApiFetch";
import { buildPathWithHost } from "@/lib/host";

export default function AppEntry() {
  const router = useRouter();
  const sp = useSearchParams();
  const apiFetch = useApiFetch();
  const once = useRef(false);
  const [msg, setMsg] = useState("Booting…");

  useEffect(() => {
    if (once.current) return;
    once.current = true;

    (async () => {
      const host = sp.get("host") || "";
      if (!host) {
        router.replace("/app/error");
        return;
      }

      // 1) whoami (shop decoded from bearer)
      setMsg("Resolving shop…");
      const whoRes = await apiFetch("/api/whoami", { cache: "no-store" });
      const whoText = await whoRes.text().catch(() => "");
      let who: any = {};
      try { who = whoText ? JSON.parse(whoText) : {}; } catch {}

      if (!whoRes.ok || !who?.shop) {
        router.replace(buildPathWithHost("/app/error", host));
        return;
      }
      const shop = String(who.shop).toLowerCase();

      // 2) install status (must NOT rely on shops row existing)
      setMsg("Checking install status…");
      const instRes = await apiFetch("/api/install-status", { cache: "no-store" });
      const instText = await instRes.text().catch(() => "");
      let inst: any = {};
      try { inst = instText ? JSON.parse(instText) : {}; } catch {}

      if (instRes.status === 401) {
        router.replace(buildPathWithHost("/app/error", host));
        return;
      }

      const installed = Boolean(inst?.ok && inst?.installed);

      // 3) if NOT installed → start OAuth and STOP
      if (!installed) {
        const url = `/api/auth/start?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`;
        // hard stop: top-level redirect for embedded apps
        window.top?.location.assign(url);
        return;
      }

      // 4) setup
      setMsg("Checking setup…");
      const setupRes = await apiFetch("/api/setup", { cache: "no-store" });
      const setupText = await setupRes.text().catch(() => "");
      let setup: any = {};
      try { setup = setupText ? JSON.parse(setupText) : {}; } catch {}

      if (setupRes.status === 401) {
        router.replace(buildPathWithHost("/app/error", host));
        return;
      }

      const hasEmail = Boolean(setup?.email);

      router.replace(buildPathWithHost(hasEmail ? "/app/insights" : "/app/setup", host));
    })().catch((e) => {
      console.error("AppEntry bootstrap failed", e);
      const host = sp.get("host") || "";
      router.replace(buildPathWithHost("/app/error", host));
    });
  }, [apiFetch, router, sp]);

  // tiny visible status so you can see where it stops
  return <div style={{ padding: 16, fontFamily: "system-ui" }}>{msg}</div>;
}
