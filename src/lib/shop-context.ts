import { NextRequest } from "next/server";
import { decodeShopFromBearer, readSessionFromCookie } from "@/lib/shopify";

/**
 * Resolves the shop domain for API routes.
 * Priority:
 * 1. Authorization Bearer token (App Bridge session token)
 * 2. Session cookie (fallback)
 */
export async function getShopFromRequest(req: NextRequest): Promise<string | null> {
  // 1) App Bridge session token (preferred)
  const authHeader = req.headers.get("authorization") || undefined;
  const bearerShop = await decodeShopFromBearer(authHeader);
  if (bearerShop) return bearerShop;

  // 2) Cookie fallback
  const cookieHeader = req.headers.get("cookie") || undefined;
  const cookieShop = await readSessionFromCookie(cookieHeader);
  if (cookieShop) return cookieShop;

  return null;
}
