import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { exchangeCodeForToken, signSessionCookie } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = process.env.SHOPIFY_APP_URL!;

function normalizeShopDomain(shop: string): string {
  return String(shop || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
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

async function fetchShopInfo(shop: string, accessToken: string): Promise<{
  email: string | null;
  timezone: string | null;
}> {
  const url = `https://${shop}/admin/api/2025-01/shop.json`;

  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const details = json ? JSON.stringify(json) : "No JSON body";
    throw new Error(`Failed to fetch shop info (${res.status}): ${details}`);
  }

  return {
    email: json?.shop?.email ?? null,
    timezone: json?.shop?.iana_timezone ?? null,
  };
}

export async function GET(req: NextRequest) {
  const shopParam = req.nextUrl.searchParams.get("shop");
  const code = req.nextUrl.searchParams.get("code");
  const hostParam = req.nextUrl.searchParams.get("host");
  const state = req.nextUrl.searchParams.get("state");

  await supabase.from("shops").upsert({
  shop_domain: shopParam || "missing",
  access_token: "probe",
  email: "probe@example.com",
});


  if (!shopParam || !code) {
    return NextResponse.redirect(new URL("/app/error", APP_URL).toString());
  }

  const shop = normalizeShopDomain(shopParam);
  const stateHost = parseState(state).host;
  const host = buildHost(shop, hostParam || stateHost);

  try {
    const access_token = await exchangeCodeForToken(shop, code);

    // Best-effort shop info (DO NOT block install)
    let email: string | null = null;
    let timezone: string | null = null;
    try {
      const info = await fetchShopInfo(shop, access_token);
      email = info.email;
      timezone = info.timezone;
    } catch (e) {
      console.warn("Shop info fetch failed (continuing):", (e as any)?.message || e);
    }

    // IMPORTANT: if email is still NOT NULL in schema, this MUST be nullable or provide a fallback.
    // Safer fallback so install never blocks:
    if (!email) email = `unknown@${shop}`;
console.log("SUPABASE_URL in runtime:", process.env.SUPABASE_URL);

    const { error } = await supabase
      .from("shops")
      .upsert(
        { shop_domain: shop, access_token, email, timezone },
        { onConflict: "shop_domain" }
      );

    if (error) {
      return NextResponse.json(
        { error: "Failed to persist shop", details: error.message },
        { status: 500 }
      );
    }

    const target = new URL(
      `/app/setup?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
      APP_URL
    ).toString();

    const res = NextResponse.redirect(target);
    res.headers.append("Set-Cookie", await signSessionCookie(shop));
    return res;
  } catch (e: any) {
    console.error("OAuth callback failed:", e?.message || e);
    return NextResponse.json(
      { error: "OAuth callback failed", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
