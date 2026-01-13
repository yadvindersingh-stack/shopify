import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getShopFromRequestAuthHeader } from "@/lib/shopify-session";

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

  if (!row?.access_token) {
    return NextResponse.json({ error: "Missing access token in DB", shop }, { status: 403 });
  }

  const res = await fetch(`https://${shop}/admin/oauth/access_scopes.json`, {
    headers: {
      "X-Shopify-Access-Token": row.access_token,
      "Content-Type": "application/json",
    },
  });

  const text = await res.text();
  return NextResponse.json(
    { shop, status: res.status, body: text },
    { status: 200 }
  );
}
