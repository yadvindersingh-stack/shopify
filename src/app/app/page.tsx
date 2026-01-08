"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function AppEntry() {
  const sp = useSearchParams();

  useEffect(() => {
    const shop = sp.get("shop") || "";
    const host = sp.get("host") || "";

    if (!shop || !host) {
      window.location.href = "/app/error";
      return;
    }

    // Always start OAuth for now (until persistence is stable)
    window.location.href = `/api/auth/start?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`;
  }, [sp]);

  return null;
}
