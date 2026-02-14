import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
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
    console.log("WEBHOOK_HMAC_FAILED", { route: "app/uninstalled", shop, message: e?.message });
    // Important: return 400 (Shopify automated tests expect 400 on invalid HMAC)
    return new NextResponse("Invalid HMAC", { status: 400 });
  }

  try {
    if (shop && shop.endsWith(".myshopify.com")) {
      const { error } = await supabase.from("shops").delete().eq("shop_domain", shop);
      if (error) console.log("WEBHOOK_UNINSTALLED_DB_ERR", { shop, message: error.message });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.log("WEBHOOK_HANDLER_FAILED", { route: "app/uninstalled", shop, message: e?.message });
    return NextResponse.json({ ok: true }); // still ack
  }
}
