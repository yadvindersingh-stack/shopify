import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = (process.env.SHOPIFY_APP_URL || "").replace(/\/+$/, "");
const API_KEY = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY!;
const API_SECRET = process.env.SHOPIFY_API_SECRET!;

function safeShop(shop: string) {
  return shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function verifyHmac(url: URL) {
  const hmac = url.searchParams.get("hmac");
  if (!hmac) return false;

  // Shopify HMAC uses query params (excluding hmac, signature)
  const params = Array.from(url.searchParams.entries())
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const digest = crypto.createHmac("sha256", API_SECRET).update(params).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
  } catch {
    return false;
  }
}

async function exchangeCodeForToken(shop: string, code: string) {
  const url = `https://${shop}/admin/oauth/access_token`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    }),
  });

  const text = await res.text();

  // 🔥 log what Shopify actually said
  console.log("TOKEN_EXCHANGE", {
    url,
    status: res.status,
    body: text.slice(0, 500),
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed ${res.status}: ${text}`);
  }

  const json = JSON.parse(text);
  if (!json?.access_token) {
    throw new Error(`Token exchange missing access_token: ${text}`);
  }

  return json.access_token as string;
}


function buildHost(shop: string, existingHost?: string | null) {
  if (existingHost) return existingHost;
  return Buffer.from(`${shop}/admin`).toString("base64");
}

function parseState(state?: string | null): { host?: string } {
  if (!state) return {};
  try {
    const json = Buffer.from(state, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const shopRaw = url.searchParams.get("shop");
  const code = url.searchParams.get("code");
  const hostParam = url.searchParams.get("host");
  const state = url.searchParams.get("state");

  if (!APP_URL) {
    return NextResponse.json({ ok: false, error: "Missing SHOPIFY_APP_URL" }, { status: 500 });
  }
  if (!shopRaw || !code) {
    return NextResponse.redirect(new URL("/app/error", APP_URL).toString());
  }

  const shop = safeShop(shopRaw);

  // Optional but recommended for public apps
  if (!verifyHmac(url)) {
    return NextResponse.json({ ok: false, error: "Invalid HMAC" }, { status: 401 });
  }

  const stateHost = parseState(state).host;
  const host = buildHost(shop, hostParam || stateHost);

  // Exchange
  const access_token = await exchangeCodeForToken(shop, code);

  // Persist shop row (NOTE: ensure these columns exist and allow values)
  const { error } = await supabase.from("shops").upsert({
    shop_domain: shop,
    access_token,
    email: "unknown@example.com",
    timezone: "UTC",
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Failed to persist shop", details: error.message },
      { status: 500 }
    );
  }

  // Redirect back into embedded app with host
  const target = new URL(`/app?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`, APP_URL).toString();
  return NextResponse.redirect(target);
}
