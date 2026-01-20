"use client";

import { useEffect } from "react";
import { Redirect } from "@shopify/app-bridge/actions";
import { useAppBridge } from "@/lib/app-bridge-context";

export default function TopRedirect({ url }: { url: string }) {
  const app = useAppBridge();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const absolute = new URL(url, window.location.origin).toString();
    console.log("TOP_REDIRECT", { hasAppBridge: Boolean(app), absolute });

    // Primary: App Bridge REMOTE (top-level)
    if (app) {
      try {
        const redirect = Redirect.create(app);
        redirect.dispatch(Redirect.Action.REMOTE, absolute);
      } catch (e) {
        console.error("App Bridge redirect failed", e);
      }
    }

    // Fallback: force top-level navigation (some contexts ignore window.location)
    setTimeout(() => {
      try {
        window.top?.location.assign(absolute);
      } catch (e) {
        // last-resort
        window.location.assign(absolute);
      }
    }, 150);
  }, [app, url]);

  return null;
}
