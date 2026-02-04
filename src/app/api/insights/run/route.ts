import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getShopFromRequestAuthHeader } from "@/lib/shopify-session";
import { runScanForShop } from "@/lib/insights/run-scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeShop(input: string | null): string | null {
  if (!input) return null;
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

export async function POST(req: NextRequest) {
  try {
    const shopFromToken = getShopFromRequestAuthHeader(req.headers.get("authorization"))?.toLowerCase();
    const shopFromQuery = normalizeShop(req.nextUrl.searchParams.get("shop"));
    const shopDomain = shopFromToken || shopFromQuery;

    if (!shopDomain) {
      return NextResponse.json({ error: "Missing shop context" }, { status: 401 });
    }

    const { data: shopRow, error: shopErr } = await supabase
      .from("shops")
      .select("id, shop_domain, access_token")
      .eq("shop_domain", shopDomain)
      .maybeSingle();

    if (shopErr) return NextResponse.json({ error: "Failed to read shop", details: shopErr.message }, { status: 500 });
    if (!shopRow?.id || !shopRow?.access_token)
      return NextResponse.json({ error: "Shop not installed or missing access token", shop: shopDomain }, { status: 403 });

    const summary = await runScanForShop({
      shopId: shopRow.id,
      shopDomain: shopRow.shop_domain,
      accessToken: shopRow.access_token,
      mode: "manual",
    });

    return NextResponse.json(summary);
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to run insights", details: e?.message || String(e) }, { status: 500 });
  }
}
