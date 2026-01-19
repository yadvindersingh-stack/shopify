import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveShop, HttpError } from "@/lib/shopify";
import { shopifyGraphql } from "@/lib/shopify-admin";
import { INSIGHT_CONTEXT_QUERY } from "@/lib/queries/insight-context";
import { buildInsightContext } from "@/core/insights/build-context";
import { evaluateSalesRhythmDrift } from "@/core/insights/sales-rhythm-drift";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildOrdersQueryLastNDays(days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const ymd = since.toISOString().slice(0, 10); // YYYY-MM-DD
  return `created_at:>=${ymd}`;
}

export async function POST(req: NextRequest) {
  try {
    const shop = await resolveShop(req);

    const ordersQuery = buildOrdersQueryLastNDays(60);

    const data = await shopifyGraphql({
      shop: shop.shop_domain,
      accessToken: shop.access_token,
      query: INSIGHT_CONTEXT_QUERY,
      variables: { ordersQuery },
    });

    const ctx = buildInsightContext(shop.shop_domain, new Date(), data);
    const drift = await evaluateSalesRhythmDrift(ctx);

    if (!drift) {
      return NextResponse.json({ insights: [] });
    }

    const suggested_action =
      "Review changes since yesterday (theme, discounts, pricing, inventory, ad spend). If nothing changed, monitor the next 6–12 hours and compare to the same time window last week.";

    const row = {
      shop_id: shop.id,
      type: drift.key,
      title: drift.title,
      description: drift.summary,
      severity: drift.severity ?? "medium",
      suggested_action,
      data_snapshot: {
        indicators: (drift.indicators || []).map((i: any) => ({
          key: i.key,
          label: i.label,
          status: i.status,
          confidence: i.confidence,
          evidence: i.evidence,
        })),
        metrics: drift.metrics,
        evaluated_at: drift.evaluated_at,
      },
    };

    const { data: inserted, error } = await supabase
      .from("insights")
      .insert(row)
      .select("*")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ insights: inserted ? [inserted] : [] });
  } catch (e: any) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: "Failed to run insights", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
