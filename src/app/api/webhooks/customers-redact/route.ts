import { NextResponse } from "next/server";
import { verifyWebhookHmac } from "@/lib/shopify-verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { ok } = await verifyWebhookHmac(req);
  if (!ok) return NextResponse.json({ error: "Invalid webhook HMAC" }, { status: 401 });

  // For now: acknowledge. Implement deletion of customer-specific data if you store any.
  return NextResponse.json({ ok: true });
}
