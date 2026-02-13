import { NextResponse } from "next/server";
import { verifyWebhookHmac } from "@/lib/shopify-verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { ok } = await verifyWebhookHmac(req);
  if (!ok) return NextResponse.json({ error: "Invalid webhook HMAC" }, { status: 401 });

  // For now: acknowledge. Implement deletion of shop data if Shopify requests it.
  return NextResponse.json({ ok: true });
}
