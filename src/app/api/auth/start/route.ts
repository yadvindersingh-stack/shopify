import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_KEY = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY!;
const SCOPES =
  process.env.SHOPIFY_SCOPES ||
  "read_orders,read_products,read_customers,read_analytics,read_inventory";

const APP_URL = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");

function encodeState(obj: any) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

export async function GET(req: NextRequest) {
  const shop = (req.nextUrl.searchParams.get("shop") || "").trim().toLowerCase();
  const host = (req.nextUrl.searchParams.get("host") || "").trim();

  console.log("AUTH_START_HIT", { shop, host, APP_URL_present: Boolean(APP_URL) });

  if (!APP_URL) {
    return NextResponse.json({ ok: false, error: "Missing SHOPIFY_APP_URL" }, { status: 500 });
  }
  if (!API_KEY) {
    return NextResponse.json({ ok: false, error: "Missing NEXT_PUBLIC_SHOPIFY_API_KEY" }, { status: 500 });
  }
  if (!shop.endsWith(".myshopify.com")) {
    return NextResponse.json({ ok: false, error: "Invalid shop param", shop }, { status: 400 });
  }

  const redirectUri = `${APP_URL}/api/auth/callback`;
  const state = encodeState({ host });

  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(API_KEY)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&response_type=code`;

  // IMPORTANT: must be a redirect, not JSON
  return NextResponse.redirect(authUrl, 302);
}
