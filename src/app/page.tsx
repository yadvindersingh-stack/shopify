"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const host = searchParams.get("host");
    const target = host ? `/app/setup?host=${encodeURIComponent(host)}` : "/app/setup";
    router.replace(target);
  }, [router, searchParams]);

  return null;
}
