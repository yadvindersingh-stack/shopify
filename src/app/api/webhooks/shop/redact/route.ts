import { NextRequest, NextResponse } from "next/server";
import { verifyShopifyWebhookHmac } from "@/lib/shopify/verify-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const shop = (req.headers.get("x-shopify-shop-domain") || "").toLowerCase();
  const hmac = req.headers.get("x-shopify-hmac-sha256");

  const raw = Buffer.from(await req.arrayBuffer());

  try {
    verifyShopifyWebhookHmac({ rawBody: raw, hmacHeader: hmac });
  } catch (e: any) {
    console.log("WEBHOOK_HMAC_FAILED", { route: "shop/redact", shop, message: e?.message });
    return new NextResponse("Invalid HMAC", { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
