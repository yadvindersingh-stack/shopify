import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
const API_KEY = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY!;
const API_SECRET = process.env.SHOPIFY_API_SECRET!;

function decodeState(state?: string | null): { host?: string } {
  if (!state) return {};
  try {
    const json = Buffer.from(state, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return {};
  }
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
  try { json = text ? JSON.parse(text) : null; } catch {}

  if (!res.ok) {
    throw new Error(`Token exchange failed ${res.status}: ${text?.slice(0, 300)}`);
  }
  if (!json?.access_token) {
    throw new Error(`Token exchange missing access_token: ${text?.slice(0, 300)}`);
  }
  return json.access_token as string;
}

export async function GET(req: NextRequest) {
  const shop = (req.nextUrl.searchParams.get("shop") || "").trim().toLowerCase();
  const code = (req.nextUrl.searchParams.get("code") || "").trim();
  const hostParam = (req.nextUrl.searchParams.get("host") || "").trim();
  const state = req.nextUrl.searchParams.get("state");

  const stateHost = decodeState(state).host || "";
  const host = hostParam || stateHost;

  console.log("AUTH_CALLBACK_HIT", {
    shop,
    hasCode: Boolean(code),
    hostPresent: Boolean(host),
    APP_URL_present: Boolean(APP_URL),
  });

  if (!APP_URL) {
    return NextResponse.json({ ok: false, error: "Missing SHOPIFY_APP_URL" }, { status: 500 });
  }
  if (!shop || !code) {
    return NextResponse.json({ ok: false, error: "Missing shop or code", shop, hasCode: Boolean(code) }, { status: 400 });
  }
  if (!shop.endsWith(".myshopify.com")) {
    return NextResponse.json({ ok: false, error: "Invalid shop", shop }, { status: 400 });
  }

  try {
    const access_token = await exchangeCodeForToken(shop, code);

    const { error } = await supabase
      .from("shops")
      .upsert({
        shop_domain: shop,
        access_token,
        email: "unknown@example.com",
        timezone: "UTC",
      });

    if (error) {
      console.log("SHOP_UPSERT_FAILED", { message: error.message });
      return NextResponse.json({ ok: false, error: "Failed to persist shop", details: error.message }, { status: 500 });
    }

    const target = `${APP_URL}/app?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`;
    return NextResponse.redirect(target, 302);
  } catch (e: any) {
    console.log("AUTH_CALLBACK_FAILED", { message: e?.message || String(e) });
    return NextResponse.json({ ok: false, error: "Callback failed", details: e?.message || String(e) }, { status: 500 });
  }
}
