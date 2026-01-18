import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { shopifyGraphql } from "@/lib/shopify-admin";
import { INSIGHT_CONTEXT_QUERY } from "@/lib/queries/insight-context";
import { buildInsightContext } from "@/core/insights/build-context";
import { evaluateSalesRhythmDrift } from "@/core/insights/sales-rhythm-drift";
import { resolveShop } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // ✅ canonical: resolves shop + token from your existing architecture
    const shopRecord = await resolveShop(req);

    // ✅ Shopify search query should be date-only (prevents parsing bugs)
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const ymd = since.toISOString().slice(0, 10);
    const ordersQuery = `created_at:>=${ymd}`;

    const data = await shopifyGraphql({
      shop: shopRecord.shop_domain,
      accessToken: shopRecord.access_token,
      query: INSIGHT_CONTEXT_QUERY,
      variables: { ordersQuery },
    });

    const ctx = buildInsightContext(shopRecord.shop_domain, new Date(), data);
   const drift = await evaluateSalesRhythmDrift(ctx);

if (!drift) {
  return NextResponse.json({ insights: [] });
}

const suggested = (drift.indicators || [])
  .slice(0, 2)
  .map((i: any) => i.suggested_action || i.action || i.title || i.key)
  .filter(Boolean)
  .join("\n");

const row = {
  shop_id: shopRecord.id,
  type: drift.key,
  title: drift.title,
  description: drift.summary,
  severity: drift.severity || "medium",
  suggested_action: suggested || "",
  data_snapshot: {
    indicators: drift.indicators,
    metrics: drift.metrics,
    evaluated_at: drift.evaluated_at,
  },
};

const { error } = await supabase.from("insights").insert(row);
if (error) throw new Error(`Failed to persist insight: ${error.message}`);

return NextResponse.json({ insights: [row] });

    }

  catch (e: any) {
    // resolveShop throws a Response on 401; return it cleanly
    if (e instanceof Response) return e;
    return NextResponse.json(
      { error: "Failed to run insights", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
