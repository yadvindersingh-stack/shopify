// src/app/api/auth/callback/route.ts

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { signSessionCookie } from "@/lib/shopify";
import { registerPrivacyWebhooks } from "@/lib/shopify/register-privacy-webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
const API_KEY = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || "";
const API_SECRET = process.env.SHOPIFY_API_SECRET || "";

function decodeState(state?: string | null): { host?: string } {
  if (!state) return {};
  try {
    const json = Buffer.from(state, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return {};
  }
}

/**
 * Shopify OAuth HMAC verification.
 * Shopify wants all query params except `hmac` and `signature`, sorted, joined as k=v&...
 */
function verifyOAuthHmac(url: URL) {
  const provided = url.searchParams.get("hmac") || "";
  if (!provided) throw new Error("Missing OAuth hmac");

  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    if (key === "hmac" || key === "signature") return;
    params[key] = value;
  });

  const message = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");

  const digest = crypto.createHmac("sha256", API_SECRET).update(message).digest("hex");

  // timing-safe compare
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid OAuth HMAC");
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
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok) throw new Error(`Token exchange failed ${res.status}: ${text?.slice(0, 500)}`);
  if (!json?.access_token) throw new Error(`Token exchange missing access_token: ${text?.slice(0, 500)}`);

  return json.access_token as string;
}

export async function GET(req: NextRequest) {
  const shop = (req.nextUrl.searchParams.get("shop") || "").trim().toLowerCase();
  const code = (req.nextUrl.searchParams.get("code") || "").trim();
  const hostParam = (req.nextUrl.searchParams.get("host") || "").trim();
  const state = req.nextUrl.searchParams.get("state");
  const host = hostParam || decodeState(state).host || "";

  console.log("AUTH_CALLBACK_HIT", {
    shop,
    hasCode: Boolean(code),
    hostPresent: Boolean(host),
    APP_URL_present: Boolean(APP_URL),
  });

  if (!APP_URL) return NextResponse.json({ ok: false, error: "Missing SHOPIFY_APP_URL" }, { status: 500 });
  if (!API_KEY) return NextResponse.json({ ok: false, error: "Missing NEXT_PUBLIC_SHOPIFY_API_KEY" }, { status: 500 });
  if (!API_SECRET) return NextResponse.json({ ok: false, error: "Missing SHOPIFY_API_SECRET" }, { status: 500 });

  if (!shop || !code) {
    return NextResponse.json({ ok: false, error: "Missing shop or code", shop, hasCode: Boolean(code) }, { status: 400 });
  }
  if (!shop.endsWith(".myshopify.com")) {
    return NextResponse.json({ ok: false, error: "Invalid shop", shop }, { status: 400 });
  }

  try {
    // Shopify automated review expects OAuth HMAC validation
    verifyOAuthHmac(req.nextUrl);

    const access_token = await exchangeCodeForToken(shop, code);

    // Persist install
    const { error } = await supabase
      .from("shops")
      .upsert(
        {
          shop_domain: shop,
          access_token,
          email: "unknown@example.com",
          timezone: "UTC",
        },
        { onConflict: "shop_domain" }
      );

    if (error) {
      console.log("SHOP_UPSERT_FAILED", { message: error.message });
      return NextResponse.json({ ok: false, error: "Failed to persist shop", details: error.message }, { status: 500 });
    }

    // session cookie so app loads post-install (prevents Missing shop context)
    const cookie = await signSessionCookie(shop);

    // Keep import stable; do not REST-create privacy webhooks here
    await registerPrivacyWebhooks({ shopDomain: shop });

    const target = `${APP_URL}/app?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`;
    const res = NextResponse.redirect(target, 302);
    res.headers.set("Set-Cookie", cookie);
    return res;
  } catch (e: any) {
    console.log("AUTH_CALLBACK_FAILED", { message: e?.message || String(e) });
    return NextResponse.json({ ok: false, error: "Callback failed", details: e?.message || String(e) }, { status: 500 });
  }
}
