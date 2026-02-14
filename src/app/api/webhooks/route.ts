import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyShopifyHmac(rawBody: string, hmacHeader: string | null) {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error("Missing SHOPIFY_API_SECRET");
  if (!hmacHeader) return false;

  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  // timing-safe compare
  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const topic = req.headers.get("x-shopify-topic") || "";
  const shopDomain = (req.headers.get("x-shopify-shop-domain") || "").toLowerCase();
  const hmac = req.headers.get("x-shopify-hmac-sha256");

  const rawBody = await req.text();

  if (!verifyShopifyHmac(rawBody, hmac)) {
    return NextResponse.json({ ok: false, error: "Invalid HMAC" }, { status: 401 });
  }

  // Acknowledge quickly; do minimal work.
  try {
    if (topic === "app/uninstalled" && shopDomain) {
      // Remove shop + cascade deletes via FK constraints
      await supabase.from("shops").delete().eq("shop_domain", shopDomain);
    }

    // Compliance topics: acknowledge. You can log/store requestId if you want later.
    // customers/data_request
    // customers/redact
    // shop/redact

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // Shopify will retry on non-2xx, so still return 200 unless you truly want retries
    return NextResponse.json({ ok: true, warning: e?.message || String(e) });
  }
}
