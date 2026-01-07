import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { shopifyGraphql } from "@/lib/shopify-admin";
import { INSIGHT_CONTEXT_QUERY } from "@/lib/queries/insight-context";
import { buildInsightContext } from "@/core/insights/build-context";
import { evaluateSalesRhythmDrift } from "@/core/insights/sales-rhythm-drift";
import { getShopFromRequest } from "@/lib/shop-context";

export async function POST(req: NextRequest) {
  try {
    const shop = await getShopFromRequest(req);
    if (!shop) {
      return NextResponse.json({ error: "Missing shop context" }, { status: 401 });
    }

    const { data: shopRow } = await supabase
      .from("shops")
      .select("access_token")
      .eq("shop_domain", shop)
      .single();

    if (!shopRow?.access_token) {
      return NextResponse.json(
        { error: "Shop not installed or missing access token" },
        { status: 403 }
      );
    }

    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const ordersQuery = `created_at:>=${since}`;

    const data = await shopifyGraphql({
      shop,
      accessToken: shopRow.access_token,
      query: INSIGHT_CONTEXT_QUERY,
      variables: { ordersQuery },
    });

    const ctx = buildInsightContext(shop, new Date(), data);
    const insight = await evaluateSalesRhythmDrift(ctx);

    return NextResponse.json({ insight });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to run insights", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
