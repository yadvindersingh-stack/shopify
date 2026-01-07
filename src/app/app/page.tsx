"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function AppEntry() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const host = searchParams.get("host") || "";
    const shop = searchParams.get("shop") || "";

    // If either is missing, we cannot start OAuth in embedded mode.
    if (!host || !shop) {
      window.location.href = "/app/error";
      return;
    }

    // Always go to auth start first; auth start can no-op if already installed later (we can optimize later).
    window.location.href = `/api/auth/start?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`;
  }, [searchParams]);

  return null;
}
