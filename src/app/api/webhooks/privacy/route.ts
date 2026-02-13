import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Constant-time compare
function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// HMAC must be computed over the *raw* request body
async function verifyWebhookHmac(req: NextRequest, rawBody: Buffer) {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error("Missing SHOPIFY_API_SECRET");

  const hmacHeader = req.headers.get("x-shopify-hmac-sha256") || "";
  if (!hmacHeader) return false;

  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");

  return safeEqual(digest, hmacHeader);
}

export async function POST(req: NextRequest) {
  try {
    const raw = Buffer.from(await req.arrayBuffer());

    const ok = await verifyWebhookHmac(req, raw);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Invalid HMAC" }, { status: 401 });
    }

    const topic = (req.headers.get("x-shopify-topic") || "").toLowerCase();
    const shopDomain = (req.headers.get("x-shopify-shop-domain") || "").toLowerCase();

    const payload = raw.length ? JSON.parse(raw.toString("utf8")) : {};
    console.log("PRIVACY_WEBHOOK", { topic, shopDomain, payloadKeys: Object.keys(payload || {}) });

    // Minimal-but-correct behavior:
    // - If you don't store customer PII, you can ack data_request/customers_redact.
    // - For shop/redact, delete all shop data you store.
    if (topic === "shop/redact") {
      // Find shop id from shop domain
      const { data: shopRow } = await supabase
        .from("shops")
        .select("id")
        .eq("shop_domain", shopDomain)
        .maybeSingle();

      const shopId = shopRow?.id;
      if (shopId) {
        // Delete child data first (unless you have ON DELETE CASCADE everywhere)
        await supabase.from("insights").delete().eq("shop_id", shopId);
        await supabase.from("scan_runs").delete().eq("shop_id", shopId);
        await supabase.from("settings").delete().eq("shop_id", shopId);

        // Finally delete the shop install record/token
        await supabase.from("shops").delete().eq("id", shopId);
      }
    }

    // Always respond quickly with 200 OK (Shopify expects a fast ACK).
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.log("PRIVACY_WEBHOOK_FAILED", e?.message || String(e));
    return NextResponse.json(
      { ok: false, error: "Privacy webhook handler failed", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
