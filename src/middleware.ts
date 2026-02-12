// middleware.ts (FULL REPLACEMENT)
import { NextRequest, NextResponse } from "next/server";
import { decodeShopFromBearer, readSessionFromCookie } from "./lib/shopify";

const PASS_THROUGH = [
  "/api/auth/start",
  "/api/auth/callback",
  "/api/cron/scan",
  "/api/install-status",
];

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Always allow these routes through
  if (PASS_THROUGH.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/debug")) {
    return NextResponse.next();
  }

  // Determine shop from App Bridge bearer OR session cookie
  const authHeader = req.headers.get("authorization") || undefined;
  const bearerShop = await decodeShopFromBearer(authHeader);

  const cookieHeader = req.headers.get("cookie") || undefined;
  const cookieShop = await readSessionFromCookie(cookieHeader);

  const shop = (bearerShop || cookieShop || "").toLowerCase();

  if (!shop) {
    // If this is a browser navigation / page-like request, redirect to your app error page
    // so Shopify can relaunch correctly with host + shop.
    const accept = req.headers.get("accept") || "";
    const looksLikeBrowserNav =
      req.method === "GET" && (accept.includes("text/html") || accept.includes("*/*"));

    if (looksLikeBrowserNav) {
      const url = req.nextUrl.clone();
      url.pathname = "/app/error";
      // preserve host/shop if present
      const host = searchParams.get("host");
      const shopParam = searchParams.get("shop");
      if (host) url.searchParams.set("host", host);
      if (shopParam) url.searchParams.set("shop", shopParam);
      return NextResponse.redirect(url);
    }

    // For API calls, return JSON 401
    return NextResponse.json({ error: "Missing shop context" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
