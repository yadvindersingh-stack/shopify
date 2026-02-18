// src/app/api/billing/redirect/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Managed pricing hosted plan selection page (Shopify Admin):
// https://admin.shopify.com/store/{storeHandle}/charges/{appHandle}/pricing_plans
const APP_HANDLE = "merchpulse";

function getStoreHandle(shopDomain: string) {
  return shopDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.myshopify\.com$/i, "");
}

export async function GET(req: NextRequest) {
  const shop = (req.nextUrl.searchParams.get("shop") || "").toLowerCase();
  if (!shop || !shop.endsWith(".myshopify.com")) {
    return NextResponse.json({ error: "Missing or invalid shop" }, { status: 400 });
  }

  const storeHandle = getStoreHandle(shop);

  const url = `https://admin.shopify.com/store/${encodeURIComponent(
    storeHandle
  )}/charges/${encodeURIComponent(APP_HANDLE)}/pricing_plans`;

  return NextResponse.redirect(url, { status: 302 });
}
