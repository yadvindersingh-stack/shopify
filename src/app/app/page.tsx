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
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    async function waitForHost(maxWaitMs = 1500, pollMs = 100) {
      const start = Date.now();
      let hostValue = searchParams.get("host") || undefined;
      while (!hostValue && Date.now() - start < maxWaitMs && !cancelled) {
        await sleep(pollMs);
        hostValue = searchParams.get("host") || undefined;
      }
      return hostValue;
    }

    async function redirect() {
      const host = await waitForHost();
      if (cancelled) return;

      if (!host) {
        router.replace(buildPathWithHost("/app/setup"));
        return;
      }

      const maxAttempts = 6;
      const retryDelayMs = 250;

      for (let attempt = 0; attempt < maxAttempts && !cancelled; attempt++) {
        try {
          const res = await apiFetch("/api/setup", { cache: "no-store" });
          const json = await res.json();
          const hasEmail = Boolean(json?.email);
          const target = hasEmail ? "/app/insights" : "/app/setup";
          const path = buildPathWithHost(target, host);
          if (cancelled) return;
          router.replace(path);
          return;
        } catch (error) {
          const shouldRetry =
            error instanceof Error &&
            error.message === "App Bridge not ready yet" &&
            attempt < maxAttempts - 1;

          if (shouldRetry) {
            await sleep(retryDelayMs);
            if (cancelled) return;
            continue;
          }

          if (cancelled) return;
          router.replace(buildPathWithHost("/app/setup", host));
          return;
        }
      }
    }

    redirect();
    return () => {
      cancelled = true;
    };
  }, [apiFetch, router, searchParams]);

  return null;
}
