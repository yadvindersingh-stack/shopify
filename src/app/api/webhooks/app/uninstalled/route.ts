import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

function verifyHmac(rawBody: string, hmacHeader: string | null) {
  if (!hmacHeader) return false;

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error("SHOPIFY_API_SECRET missing");

  const generated = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  return crypto.timingSafeEqual(
    Buffer.from(generated),
    Buffer.from(hmacHeader)
  );
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hmac = req.headers.get("x-shopify-hmac-sha256");
  const shop = req.headers.get("x-shopify-shop-domain");

  if (!verifyHmac(rawBody, hmac)) {
    return new NextResponse("Invalid HMAC", { status: 401 });
  }

  if (!shop) {
    return new NextResponse("Missing shop", { status: 400 });
  }

  // 🔥 CRITICAL: delete shop + cascade related data
  await supabase
    .from("shops")
    .delete()
    .eq("shop_domain", shop);

  return NextResponse.json({ ok: true });
}
