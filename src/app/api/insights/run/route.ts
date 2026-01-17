import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { shopifyGraphql } from "@/lib/shopify-admin";
import { INSIGHT_CONTEXT_QUERY } from "@/lib/queries/insight-context";
import { resolveShop } from "@/lib/shopify";
import { evaluateSalesRhythmDrift } from "@/core/insights/sales-rhythm-drift";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const shop = await resolveShop(req); // should return { id, shop_domain, access_token, ... } in your project
    // If your resolveShop returns only id/domain, then fetch token by shop.id from shops table.

    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const ymd = since.toISOString().slice(0, 10);
    const ordersQuery = `created_at:>=${ymd}`;

    const data = await shopifyGraphql({
      shop: shop.shop_domain, // adjust if your object uses different prop name
      accessToken: shop.access_token,
      query: INSIGHT_CONTEXT_QUERY,
      variables: { ordersQuery },
    });

    const orders =
      data?.orders?.edges?.map((e: any) => e.node) ?? [];

    const insight = evaluateSalesRhythmDrift({
      orders,
      now: new Date(),
    });

    if (!insight) {
      return NextResponse.json({ insights: [] });
    }

    const { error } = await supabase.from("insights").insert({
      shop_id: shop.id,
      type: insight.type,
      severity: insight.severity,
      title: insight.title,
      description: insight.description,
      suggested_action: insight.suggested_action,
      data_snapshot: insight.data_snapshot,
    });

    if (error) {
      return NextResponse.json({ error: "Failed to persist insight", details: error.message }, { status: 500 });
    }

    return NextResponse.json({ insights: [insight] });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to run insights", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
