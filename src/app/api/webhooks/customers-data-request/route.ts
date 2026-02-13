import { NextResponse } from "next/server";
import { verifyWebhookHmac } from "@/lib/shopify-verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { ok } = await verifyWebhookHmac(req);
  if (!ok) return NextResponse.json({ error: "Invalid webhook HMAC" }, { status: 401 });

  // For now: acknowledge. You can later implement GDPR export flow.
  return NextResponse.json({ ok: true });
}
