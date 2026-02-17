import "@shopify/shopify-api/adapters/node";

import { SignJWT, jwtVerify } from "jose";
import { shopifyApi, ApiVersion } from "@shopify/shopify-api";
import { supabase } from "./supabase";

const SESSION_COOKIE = "shop_session";
const SESSION_TTL = "30d";

const DEFAULT_API_VERSION =
  (process.env.SHOPIFY_API_VERSION as ApiVersion | undefined) ?? ApiVersion.July24;

const SHOPIFY_API_KEY = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_APP_URL = process.env.SHOPIFY_APP_URL;

if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET || !SHOPIFY_APP_URL) {
  throw new Error(
    "Missing required Shopify env: NEXT_PUBLIC_SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL"
  );
}

/**
 * Small error class to avoid throwing Response objects (which frequently becomes a 500
 * when callers forget to catch it perfectly).
 */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET || process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required");
  return new TextEncoder().encode(secret);
}

export const shopify = shopifyApi({
  apiKey: SHOPIFY_API_KEY,
  apiSecretKey: SHOPIFY_API_SECRET,
  scopes: (process.env.SHOPIFY_SCOPES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  hostName: new URL(SHOPIFY_APP_URL).host,
  apiVersion: DEFAULT_API_VERSION,
  isEmbeddedApp: true,
});

export async function signSessionCookie(shop: string) {
  const token = await new SignJWT({ shop })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(SESSION_TTL)
    .sign(getSessionSecret());

  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=None; Max-Age=${
    60 * 60 * 24 * 30
  }; Secure`;
}

export async function readSessionFromCookie(cookieHeader?: string): Promise<string | null> {
  if (!cookieHeader) return null;

  // Robust cookie parsing (your old split('=') breaks on base64 tokens containing '=')
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    cookies[k] = rest.join("=") || "";
  }

  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    return typeof payload.shop === "string" ? payload.shop : null;
  } catch {
    return null;
  }
}

export async function decodeShopFromBearer(authHeader?: string): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SHOPIFY_API_SECRET));

    const iss = typeof payload.iss === "string" ? payload.iss : "";
    const dest = typeof payload.dest === "string" ? payload.dest : "";

    // ✅ Prefer iss when it references the shop's myshopify domain (most reliable)
    // iss often looks like: https://storepulse-2.myshopify.com/admin
    if (iss.includes(".myshopify.com")) {
      return new URL(iss).host; // storepulse-2.myshopify.com
    }

    // ✅ Fallback: dest can be either myshopify or admin.shopify.com
    if (dest.includes(".myshopify.com")) {
      return new URL(dest).host;
    }

    // ❌ If dest is admin.shopify.com, do NOT return that as "shop"
    return null;
  } catch {
    return null;
  }
}


export type ShopRecord = {
  id: string;
  shop_domain: string;
  access_token: string;
  email?: string | null;
  timezone?: string | null;
  billing_status?: string | null;
  plan?: string | null;
};

export async function getShopRecord(shop_domain: string): Promise<ShopRecord | null> {
  const { data, error } = await supabase
    .from("shops")
    .select("id, shop_domain, access_token, email, timezone, billing_status, plan")
    .eq("shop_domain", shop_domain)
    .maybeSingle();

  if (error || !data) return null;
  return data as ShopRecord;
}

export async function resolveShop(req: Request): Promise<ShopRecord> {
  const authHeader = req.headers.get("authorization") || undefined;

  const bearerShop = await decodeShopFromBearer(authHeader);
  let shop = bearerShop;
  console.log("RESOLVE_SHOP_DEBUG", { bearerShop });


  if (!shop) {
    const cookieHeader = req.headers.get("cookie") || undefined;
    shop = await readSessionFromCookie(cookieHeader);
  }

  if (!shop) {
    throw new HttpError(401, "Unauthorized");
  }

 const record = await getShopRecord(shop);
if (!record) {
  throw new HttpError(403, "Shop not installed");
}
if (record.billing_status !== "active") {
  throw new HttpError(402, "Payment required");
}
return record;
}

export async function exchangeCodeForToken(shop: string, code: string) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code,
    }),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-json
  }

  if (!res.ok) {
    throw new Error(`Token exchange failed ${res.status}: ${text?.slice(0, 500)}`);
  }
  if (!json?.access_token) {
    throw new Error(`Token exchange missing access_token: ${text?.slice(0, 500)}`);
  }

  return json.access_token as string;
}
