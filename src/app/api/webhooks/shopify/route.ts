import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Shopify sends HMAC in base64
function verifyHmac(rawBody: string, hmacHeader: string | null) {
  const secret = process.env.SHOPIFY_API_SECRET!;
  if (!secret || !hmacHeader) return false;

  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

function toDayUtc(iso: string) {
  return iso.slice(0, 10); // YYYY-MM-DD
}

export async function POST(req: NextRequest) {
  const raw = await req.text();

  const hmac = req.headers.get("x-shopify-hmac-sha256");
  if (!verifyHmac(raw, hmac)) {
    return NextResponse.json({ ok: false, error: "Invalid HMAC" }, { status: 401 });
  }

  const topic = req.headers.get("x-shopify-topic") || "unknown";
  const shop = (req.headers.get("x-shopify-shop-domain") || "").toLowerCase();

  let payload: any = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }

  // REST order payload usually has numeric id + created_at + total_price
  const orderId = String(payload?.id || payload?.admin_graphql_api_id || "unknown");
  const eventCreatedAt = payload?.created_at ? new Date(payload.created_at).toISOString() : null;

  const totalAmount = payload?.total_price != null ? Number(payload.total_price) : null;
  const currency = payload?.currency || null;
  const cancelled = Boolean(payload?.cancelled_at);

  // 1) persist raw event (dedupe via unique index)
  const { error: upsertErr } = await supabase.from("order_events").upsert({
    shop_domain: shop,
    topic,
    order_id: orderId,
    event_created_at: eventCreatedAt,
    total_amount: totalAmount,
    currency,
    cancelled,
    payload,
  });

  if (upsertErr) {
    return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
  }

  // 2) update aggregates (simple MVP)
  if (shop && eventCreatedAt) {
    const day = toDayUtc(eventCreatedAt);
    const { error: rpcErr } = await supabase.rpc("increment_daily_sales", {
      p_shop: shop,
      p_day: day,
      p_is_cancelled: cancelled,
      p_amount: totalAmount ?? 0,
    });

    if (rpcErr) {
      return NextResponse.json({ ok: false, error: rpcErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
