import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getShopFromRequestAuthHeader } from "@/lib/shopify-session";
import { shopifyGraphql } from "@/lib/shopify-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const shop = getShopFromRequestAuthHeader(req.headers.get("authorization"))?.toLowerCase();
  if (!shop) return NextResponse.json({ error: "Missing shop context" }, { status: 401 });

  const { data: row } = await supabase
    .from("shops")
    .select("access_token")
    .eq("shop_domain", shop)
    .maybeSingle();

  if (!row?.access_token) return NextResponse.json({ error: "Missing token" }, { status: 403 });

  // Minimal Admin API query that always works if you're hitting Admin GraphQL correctly
  const data = await shopifyGraphql({
    shop,
    accessToken: row.access_token,
    query: `query { shop { name myshopifyDomain } }`,
  });

  return NextResponse.json({ ok: true, data });
}
