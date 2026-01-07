import { NextRequest, NextResponse } from "next/server";

const SHOPIFY_API_KEY = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY!;
const SHOPIFY_SCOPES =
  process.env.SHOPIFY_SCOPES ||
  "read_orders,read_products,read_customers,read_analytics,read_inventory";

const REDIRECT_URI = `${process.env.SHOPIFY_APP_URL}/api/auth/callback`;

function encodeState(obj: any) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop");
  const host = req.nextUrl.searchParams.get("host");

  if (!shop) {
    return NextResponse.redirect(new URL("/app/error", process.env.SHOPIFY_APP_URL).toString());
  }

  const state = encodeState({ host });

  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${SHOPIFY_API_KEY}` +
    `&scope=${encodeURIComponent(SHOPIFY_SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&state=${encodeURIComponent(state)}` +
    `&response_type=code`;

  return NextResponse.redirect(authUrl);
}
