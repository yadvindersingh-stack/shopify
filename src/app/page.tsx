"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { buildPathWithHost, getHostFromLocation, getShopFromLocation } from "@/lib/host";

export default function Root() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const host = params.get("host") || getHostFromLocation();
    const shop = (params.get("shop") || getShopFromLocation() || "").toLowerCase();
    router.replace(buildPathWithHost("/app", host || undefined, shop || undefined));
  }, [router]);

  return null;
}
