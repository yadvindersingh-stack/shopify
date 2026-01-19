import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_KEY = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY!;
const SCOPES =
  process.env.SHOPIFY_SCOPES ||
  "read_orders,read_products,read_customers,read_analytics,read_inventory";

const APP_URL = (process.env.SHOPIFY_APP_URL || "").replace(/\/+$/, "");
const REDIRECT_URI = `${APP_URL}/api/auth/callback`;

function encodeState(obj: any) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

function normalizeShopDomain(shop: string) {
  return String(shop || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

export async function GET(req: NextRequest) {
  const shopParam = req.nextUrl.searchParams.get("shop");
  const host = req.nextUrl.searchParams.get("host") || "";
  const debug = req.nextUrl.searchParams.get("debug") === "1";

  if (!shopParam) {
    return NextResponse.json({ ok: false, error: "Missing shop param" }, { status: 400 });
  }

  const shop = normalizeShopDomain(shopParam);
  const state = encodeState({ host });
  
console.log("AUTH_START", { shop, host });

  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(API_KEY)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&state=${encodeURIComponent(state)}` +
    `&response_type=code`;

  // 🔍 Debug mode: return the computed URL instead of redirecting
  if (debug) {
    return NextResponse.json({
      ok: true,
      shop,
      redirect_uri: REDIRECT_URI,
      authUrl,
      env: {
        SHOPIFY_APP_URL: APP_URL,
        NEXT_PUBLIC_SHOPIFY_API_KEY_present: Boolean(API_KEY),
      },
    });
  }

  return NextResponse.redirect(authUrl);
}
