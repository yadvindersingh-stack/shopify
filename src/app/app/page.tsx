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
    const host = searchParams.get("host") || undefined;

    async function redirect() {
      try {
        const res = await apiFetch("/api/setup", { cache: "no-store" });
        const json = await res.json();
        const hasEmail = Boolean(json?.email);
        const target = hasEmail ? "/app/insights" : "/app/setup";
        const path = buildPathWithHost(target, host);
        if (!cancelled) router.replace(path);
      } catch (error) {
        const fallback = buildPathWithHost("/app/setup", host);
        if (!cancelled) router.replace(fallback);
      }
    }

    redirect();
    return () => {
      cancelled = true;
    };
  }, [apiFetch, router, searchParams]);

  return null;
}
