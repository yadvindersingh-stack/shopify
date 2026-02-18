// src/app/api/billing/redirect/route.ts
import { NextRequest, NextResponse } from "next/server";
import { resolveShop, HttpError } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Shopify App Store app handle (the handle in Partners dashboard)
const APP_HANDLE = "merchpulse";

function getStoreHandle(shopDomain: string) {
  return shopDomain
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.myshopify\.com$/i, "");
}

export async function GET(req: NextRequest) {
  try {
    // ✅ Resolve shop from session token / cookie (no query param needed)
    const shopRecord = await resolveShop(req);
    const storeHandle = getStoreHandle(shopRecord.shop_domain);

    const url = `https://admin.shopify.com/store/${encodeURIComponent(
      storeHandle
    )}/charges/${encodeURIComponent(APP_HANDLE)}/pricing_plans`;

    return NextResponse.redirect(url, { status: 302 });
  } catch (e: any) {
    // Fallback: if you *did* pass shop=... manually, still try it
    const shop = (req.nextUrl.searchParams.get("shop") || "").toLowerCase();
    if (shop && shop.endsWith(".myshopify.com")) {
      const storeHandle = getStoreHandle(shop);
      const url = `https://admin.shopify.com/store/${encodeURIComponent(
        storeHandle
      )}/charges/${encodeURIComponent(APP_HANDLE)}/pricing_plans`;
      return NextResponse.redirect(url, { status: 302 });
    }

    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: "Billing redirect failed", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
