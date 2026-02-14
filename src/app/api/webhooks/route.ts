// src/app/api/webhooks/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_SECRET = process.env.SHOPIFY_API_SECRET || "";

function verifyWebhookHmac(rawBody: Buffer, hmacHeader: string) {
  if (!API_SECRET) throw new Error("Missing SHOPIFY_API_SECRET");
  if (!hmacHeader) throw new Error("Missing X-Shopify-Hmac-Sha256");

  // Shopify expects base64 digest of the raw request body bytes
  const digestBase64 = crypto.createHmac("sha256", API_SECRET).update(rawBody).digest("base64");

  // Timing-safe compare (compare the raw base64 strings as bytes)
  const a = Buffer.from(digestBase64, "utf8");
  const b = Buffer.from(hmacHeader, "utf8");

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid webhook HMAC");
  }
}

export async function POST(req: NextRequest) {
  const topic = (req.headers.get("x-shopify-topic") || "").toLowerCase();
  const shop = (req.headers.get("x-shopify-shop-domain") || "").toLowerCase();
  const hmac = req.headers.get("x-shopify-hmac-sha256") || "";

  const rawBytes = Buffer.from(await req.arrayBuffer());

  try {
    verifyWebhookHmac(rawBytes, hmac);
  } catch (e: any) {
    console.log("WEBHOOK_HMAC_FAILED", {
      topic,
      shop,
      message: e?.message || String(e),
      hasSecret: Boolean(API_SECRET),
      hasHmacHeader: Boolean(hmac),
    });
    // Shopify requires 401 on invalid HMAC for compliance webhook checks
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Ack quickly with 200-series for valid requests
  try {
    if (!shop || !shop.endsWith(".myshopify.com")) {
      console.log("WEBHOOK_BAD_SHOP", { topic, shop });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (topic === "app/uninstalled") {
      const { error } = await supabase.from("shops").delete().eq("shop_domain", shop);
      if (error) console.log("WEBHOOK_UNINSTALLED_DB_ERR", { shop, message: error.message });
      console.log("WEBHOOK_APP_UNINSTALLED_OK", { shop });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (topic === "customers/data_request" || topic === "customers/redact" || topic === "shop/redact") {
      console.log("WEBHOOK_COMPLIANCE_OK", { topic, shop });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    console.log("WEBHOOK_UNHANDLED_TOPIC_OK", { topic, shop });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.log("WEBHOOK_HANDLER_FAILED", { topic, shop, message: e?.message || String(e) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
