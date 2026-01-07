"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildPathWithHost } from "@/lib/host";
import { useApiFetch } from "@/hooks/useApiFetch";

export default function AppHome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const apiFetch = useApiFetch();

  useEffect(() => {
    let cancelled = false;

    const host = searchParams.get("host") || "";
    const shop = searchParams.get("shop") || "";

    async function boot() {
      // Must have host for embedded context nav
      if (!host) {
        router.replace("/app/error");
        return;
      }

      const res = await apiFetch(`/api/install-status?shop=${encodeURIComponent(shop)}`, {
        cache: "no-store",
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : null;

      if (cancelled) return;

      if (!json?.installed) {
        // Kick off OAuth explicitly
        const url = `/api/auth/start?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`;
        window.location.href = url;
        return;
      }

      router.replace(buildPathWithHost("/app/insights", host));
    }

    boot().catch(() => {
      if (!cancelled) router.replace(buildPathWithHost("/app/error", host));
    });

    return () => {
      cancelled = true;
    };
  }, [apiFetch, router, searchParams]);

  return null;
}
