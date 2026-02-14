import { NextRequest, NextResponse } from "next/server";
import { decodeShopFromBearer, readSessionFromCookie } from "./lib/shopify";

// ✅ Add webhooks route bypass. Shopify will call these without your session/bearer.
const PUBLIC_API_ROUTES = [
  "/api/auth/start",
  "/api/auth/callback",
  "/api/cron/scan",
  "/api/webhooks", // ✅ IMPORTANT: allow Shopify webhook delivery + automated checks
  "/api/install-status",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_API_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/debug")) {
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
