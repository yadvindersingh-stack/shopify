import { NextRequest, NextResponse } from "next/server";
import { decodeShopFromBearer, readSessionFromCookie } from "./lib/shopify";

// Allow Shopify to hit these endpoints without your embedded session context.
const PUBLIC_API_ROUTES = [
  "/api/auth/start",
  "/api/auth/callback",

  // Cron entrypoint
  "/api/cron/scan",

  // Webhooks entrypoints (Shopify calls these server-to-server)
  "/api/webhooks",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_API_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  // keep your existing debug/install exceptions
  if (pathname.startsWith("/api/debug")) return NextResponse.next();
  if (pathname.startsWith("/api/install-status")) return NextResponse.next();

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
