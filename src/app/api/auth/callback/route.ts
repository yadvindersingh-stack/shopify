import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { exchangeCodeForToken, signSessionCookie } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = process.env.SHOPIFY_APP_URL!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function normalizeShopDomain(shop: string): string {
  return String(shop || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

function buildHost(shop: string, existingHost?: string | null) {
  if (existingHost) return existingHost;
  // Fallback host encoding (Shopify usually provides host; keep this as backup)
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
  // REST shop endpoint returns email + iana_timezone
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

  const email = json?.shop?.email ?? null;
  const timezone = json?.shop?.iana_timezone ?? null;

  return { email, timezone };
}

export async function GET(req: NextRequest) {
  const shopParam = req.nextUrl.searchParams.get("shop");
  const code = req.nextUrl.searchParams.get("code");
  const hostParam = req.nextUrl.searchParams.get("host");
  const state = req.nextUrl.searchParams.get("state");

  if (!shopParam || !code) {
    return NextResponse.redirect(new URL("/app/error", APP_URL).toString());
  }

  const shop = normalizeShopDomain(shopParam);

  // Preserve host via host query OR state
  const stateHost = parseState(state).host;
  const host = buildHost(shop, hostParam || stateHost);

  try {
    // 1) Exchange OAuth code for access token
    const access_token = await exchangeCodeForToken(shop, code);

    // 2) Fetch shop email + timezone (so DB insert satisfies NOT NULL email)
    const { email, timezone } = await fetchShopInfo(shop, access_token);

    // 3) Persist
    const { error } = await supabaseAdmin
      .from("shops")
      .upsert(
        {
          shop_domain: shop,
          access_token,
          email,     // required by your schema
          timezone,  // nullable but useful
        },
        { onConflict: "shop_domain" }
      );

    if (error) {
      // If you *still* have email NOT NULL and email is null for some reason, this will reveal it.
      return NextResponse.json(
        { error: "Failed to persist shop", details: error.message },
        { status: 500 }
      );
    }

    // 4) Redirect into embedded app
    const target = new URL(
      `/app/setup?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
      APP_URL
    ).toString();

    const res = NextResponse.redirect(target);

    // 5) Set session cookie (iframe-safe)
    res.headers.append("Set-Cookie", await signSessionCookie(shop));

    return res;
  } catch (e: any) {
    // If anything fails, send user to error page with host preserved
    const errUrl = new URL(`/app/error?host=${encodeURIComponent(host)}`, APP_URL).toString();
    console.error("OAuth callback failed:", e?.message || e);
    return NextResponse.redirect(errUrl);
  }
}
