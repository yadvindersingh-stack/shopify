"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildPathWithHost } from "@/lib/host";

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const host = searchParams.get("host");
    const target = buildPathWithHost("/app/setup", host || undefined);
    router.replace(target);
  }, [router, searchParams]);

  return null;
}
