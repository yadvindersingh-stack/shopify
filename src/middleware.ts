import { NextRequest, NextResponse } from "next/server";
import { decodeShopFromBearer, readSessionFromCookie } from "./lib/shopify";

// Allow these without shop context
const OPEN_ROUTES = [
  "/api/auth/start",
  "/api/auth/callback",
  "/api/cron/scan",
  "/api/webhooks", // allow ALL webhooks
  "/api/install-status",
  "/api/debug",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (OPEN_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  // Only protect /api routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const authHeader = req.headers.get("authorization") || undefined;
  const bearerShop = await decodeShopFromBearer(authHeader);

  const cookieHeader = req.headers.get("cookie") || undefined;
  const cookieShop = await readSessionFromCookie(cookieHeader);

  const shop = bearerShop || cookieShop;

  if (!shop) {
    return NextResponse.json({ error: "Missing shop context" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
