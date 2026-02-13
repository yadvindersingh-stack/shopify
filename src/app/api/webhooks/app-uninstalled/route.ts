import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { verifyWebhookHmac } from "@/lib/shopify-verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { ok } = await verifyWebhookHmac(req);
  if (!ok) return NextResponse.json({ error: "Invalid webhook HMAC" }, { status: 401 });

  const shop = req.headers.get("x-shopify-shop-domain");
  if (!shop) return NextResponse.json({ error: "Missing shop header" }, { status: 400 });

  // remove shop -> cascades insights, scan_runs, digest_settings via FK
  await supabase.from("shops").delete().eq("shop_domain", shop.toLowerCase());

  return NextResponse.json({ ok: true });
}
