import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { decodeShopFromBearer, readSessionFromCookie } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getShopFromRequest(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization") || undefined;
  const bearerShop = await decodeShopFromBearer(authHeader);
  if (bearerShop) return bearerShop;

  const cookieHeader = req.headers.get("cookie") || undefined;
  const cookieShop = await readSessionFromCookie(cookieHeader);
  if (cookieShop) return cookieShop;

  // fallback: query param
  return req.nextUrl.searchParams.get("shop");
}

export async function GET(req: NextRequest) {
  const shop = await getShopFromRequest(req);
  if (!shop) return NextResponse.json({ installed: false, reason: "no_shop" }, { status: 200 });

  const { data, error } = await supabase
    .from("shops")
    .select("shop_domain")
    .eq("shop_domain", shop.toLowerCase())
    .maybeSingle();

  if (error) {
    return NextResponse.json({ installed: false, reason: error.message }, { status: 200 });
  }

  return NextResponse.json({ installed: Boolean(data), shop }, { status: 200 });
}
