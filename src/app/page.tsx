"use client";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function Redirector() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  function buildPathWithHost(path: string, host?: string) {
    if (!host) {
      return path;
    }
  
    const [pathname, existingQuery = ""] = path.split("?");
    const params = new URLSearchParams(existingQuery);
    params.set("host", host);
  
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  useEffect(() => {
    const host = searchParams.get("host");
    const target = buildPathWithHost("/app/setup", host || undefined);
    router.replace(target);
  }, [router, searchParams]);

  return null;
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <Redirector />
    </Suspense>
  );
}
