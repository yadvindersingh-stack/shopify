"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function AppEntry() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const host = searchParams.get("host") || "";
    const shop = searchParams.get("shop") || "";

    if (!host || !shop) {
      window.location.href = "/app/error";
      return;
    }

    (async () => {
      const res = await fetch(`/api/install-status?shop=${encodeURIComponent(shop)}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!json?.installed) {
        // Start OAuth explicitly (legacy OAuth endpoints still work even if legacy install flow is off)
        window.location.href = `/api/auth/start?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`;
        return;
      }

      // Already installed → go to insights
      window.location.href = `/app/insights?host=${encodeURIComponent(host)}`;
    })();
  }, [searchParams]);

  return null;
}
