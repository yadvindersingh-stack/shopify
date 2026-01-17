import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ensureOrderWebhooks } from "@/lib/shopify-webhooks";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = (process.env.SHOPIFY_APP_URL || "").replace(/\/+$/, "");
const API_KEY = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY!;
const API_SECRET = process.env.SHOPIFY_API_SECRET!;

function parseState(state?: string | null): { host?: string } {
  if (!state) return {};
  try {
    const json = Buffer.from(state, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function normalizeShop(shop: string) {
  return String(shop || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

async function exchangeCodeForToken(shop: string, code: string) {
  const url = `https://${shop}/admin/oauth/access_token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: API_KEY,
      client_secret: API_SECRET,
      code,
    }),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${text?.slice(0, 200)}`);
  }

  const token = json?.access_token;
  if (!token) throw new Error("Token exchange returned no access_token");
  return token as string;
}

export async function GET(req: NextRequest) {
  try {

    const shopParam = req.nextUrl.searchParams.get("shop");
    const code = req.nextUrl.searchParams.get("code");
    const hostParam = req.nextUrl.searchParams.get("host");
    const state = req.nextUrl.searchParams.get("state");

    if (!shopParam || !code) {
      return NextResponse.redirect(new URL("/app/error", APP_URL).toString());
    }

    const shop = normalizeShop(shopParam);
    const host = hostParam || parseState(state).host || "";

    const accessToken = await exchangeCodeForToken(shop, code);

    const { error } = await supabase.from("shops").upsert(
      {
        shop_domain: shop,
        access_token: accessToken,
        // keep these optional in schema if you can; otherwise set defaults
        email: "unknown@example.com",
        timezone: "UTC",
      },
      { onConflict: "shop_domain" }
    );

const appUrl = process.env.SHOPIFY_APP_URL!;
try {
  await ensureOrderWebhooks({ shop, accessToken: accessToken, appUrl });
  console.log("Shopify order webhooks ensured for shop", shop);
} catch (e) {
  console.log("webhook registration failed", e);
}


    if (error) {
      return NextResponse.json({ error: "Failed to persist shop token", details: error.message }, { status: 500 });
    }

    // After install, go to insights (setup later)
    const target = new URL(`/app/insights?host=${encodeURIComponent(host)}`, APP_URL).toString();
    return NextResponse.redirect(target);
  } catch (e: any) {
    return NextResponse.json({ error: "OAuth callback failed", details: e?.message || String(e) }, { status: 500 });
  }
}
