import { NextRequest, NextResponse } from "next/server";
import { supabase } from "./supabase";

export async function getShopDomainFromRequest(req: NextRequest): Promise<string> {
  // 1. Try Shopify session (placeholder, replace with real session logic if available)
  // Example: if (req.session?.shop) return req.session.shop;

  // 2. Fallback to search param
  const shopParam = req.nextUrl?.searchParams?.get("shop");
  if (shopParam) return shopParam;

  // 3. Fallback to header
  const shopHeader = req.headers.get("x-shop-domain");
  if (shopHeader) return shopHeader;

  // 4. DEV fallback: throw 401 with clear message
  throw new Response(JSON.stringify({ error: "Missing shop context. Open app with ?shop=xxx.myshopify.com" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export async function getShopRecord(shop_domain: string): Promise<{ id: string; shop_domain: string; access_token: string } | null> {
  const { data, error } = await supabase
    .from("shops")
    .select("id, shop_domain, access_token")
    .eq("shop_domain", shop_domain)
    .single();
  if (error || !data) return null;
  return data;
}
