import { NextResponse } from "next/server";
import { verifyShopifyWebhook } from "@/lib/shopify/verify-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { json } = await verifyShopifyWebhook(req);
    console.log("WEBHOOK customers/redact", json);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.log("WEBHOOK_VERIFY_FAILED customers/redact", e?.message || String(e));
    return NextResponse.json({ ok: false }, { status: 401 });
  }
}
