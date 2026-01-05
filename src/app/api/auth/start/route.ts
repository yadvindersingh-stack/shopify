import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const SHOPIFY_API_KEY = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY!;
const SHOPIFY_SCOPES =
  process.env.SHOPIFY_SCOPES ||
  "read_orders,read_products,read_customers,read_analytics,read_inventory";
const APP_URL = process.env.SHOPIFY_APP_URL!;
const SHOPIFY_REDIRECT_URI = `${APP_URL}/api/auth/callback`;

function base64url(input: string) {
  return Buffer.from(input).toString("base64url");
}

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop");
  const host = req.nextUrl.searchParams.get("host") || "";

  if (!shop) {
    return NextResponse.redirect(new URL("/app/error", APP_URL).toString());
  }

  // state carries host + nonce
  const nonce = crypto.randomBytes(16).toString("hex");
  const state = base64url(JSON.stringify({ host, nonce }));

  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(SHOPIFY_API_KEY)}` +
    `&scope=${encodeURIComponent(SHOPIFY_SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(SHOPIFY_REDIRECT_URI)}` +
    `&state=${encodeURIComponent(state)}` +
    `&response_type=code`;

  return NextResponse.redirect(authUrl);
}
