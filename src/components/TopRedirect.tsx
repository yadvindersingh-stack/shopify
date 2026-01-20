"use client";

import { useEffect } from "react";
import { Redirect } from "@shopify/app-bridge/actions";
import { useAppBridge } from "@/lib/app-bridge-context";

export default function TopRedirect({ url }: { url: string }) {
  const app = useAppBridge();

  useEffect(() => {
    if (app) {
      const redirect = Redirect.create(app);
      redirect.dispatch(Redirect.Action.REMOTE, url);
    } else {
      // fallback
      window.location.assign(url);
    }
  }, [app, url]);

  return null;
}
