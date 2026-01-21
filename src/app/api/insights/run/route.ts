import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveShop } from "@/lib/shopify";
import { shopifyGraphql } from "@/lib/shopify-admin";
import { INSIGHT_CONTEXT_QUERY } from "@/lib/queries/insight-context";

import { evaluateSalesRhythmDrift } from "@/core/insights/sales-rhythm-drift";
import { normalizeSalesRhythmToInsight } from "@/core/insights/normalize";

import { evaluateInventoryPressure } from "@/core/insights/inventory-pressure";
import { normalizeInventoryPressureToInsight } from "@/core/insights/normalize-inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const shopRecord = await resolveShop(req);
    const shopDomain = shopRecord.shop_domain;
    const accessToken = shopRecord.access_token;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Shop not installed or missing access token" },
        { status: 403 }
      );
    }

    // Require setup (email) before scans
    const { data: settings } = await supabase
      .from("digest_settings")
      .select("email")
      .eq("shop_id", shopRecord.id)
      .maybeSingle();

    if (!settings?.email) {
      return NextResponse.json(
        { error: "Setup required", code: "setup_required" },
        { status: 409 }
      );
    }

    const now = new Date();

    // 8 weeks for drift + 14 days velocity (query can be wide; evaluator will window)
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 56).toISOString();
    const ordersQuery = `created_at:>=${since}`;

    const data = await shopifyGraphql({
      shop: shopDomain,
      accessToken,
      query: INSIGHT_CONTEXT_QUERY,
      variables: { ordersQuery },
    });

    const timezone = data?.shop?.ianaTimezone || shopRecord.timezone || "UTC";

    const orders =
      data?.orders?.edges?.map((e: any) => ({
        id: e.node.id,
        created_at: e.node.createdAt,
        cancelled_at: e.node.cancelledAt ?? null,
        total_price: Number(e.node.totalPriceSet?.shopMoney?.amount ?? 0),
        line_items:
          e.node.lineItems?.edges?.map((li: any) => ({
            product_id: li.node.product?.id,
            quantity: Number(li.node.quantity ?? 0),
          })) ?? [],
      })) ?? [];

    const products =
      data?.products?.edges?.map((e: any) => ({
        id: e.node.id,
        title: e.node.title,
        inventory_quantity: Number(e.node.totalInventory ?? 0),
        price: Number(e.node.priceRangeV2?.minVariantPrice?.amount ?? 0),
      })) ?? [];

    const keys: string[] = [];
    let inserted = 0;

    // 1) Sales Rhythm Drift
    const drift = await evaluateSalesRhythmDrift({
      shopTimezone: timezone,
      now,
      orders,
      products,
      analytics: { sessions_today_so_far: null, sessions_baseline_median: null },
    } as any);

    if (drift) {
      const normalized = normalizeSalesRhythmToInsight(drift);
      const { error } = await supabase.from("insights").insert({
        shop_id: shopRecord.id,
        ...normalized,
      });
      if (error) {
        return NextResponse.json(
          { error: "Failed to persist drift insight", details: error.message },
          { status: 500 }
        );
      }
      inserted += 1;
      keys.push("sales_rhythm_drift");
    }

    // 2) Inventory Pressure (velocity if possible)
    if (inserted < 2) {
      const inv = await evaluateInventoryPressure({
        shopTimezone: timezone,
        now,
        orders,
        products,
      });

      if (inv) {
        const normalized = normalizeInventoryPressureToInsight(inv);
        const { error } = await supabase.from("insights").insert({
          shop_id: shopRecord.id,
          ...normalized,
        });
        if (error) {
          return NextResponse.json(
            { error: "Failed to persist inventory insight", details: error.message },
            { status: 500 }
          );
        }
        inserted += 1;
        keys.push("inventory_pressure");
      }
    }

    return NextResponse.json({ inserted, keys });
  } catch (e: any) {
    if (e instanceof Response) {
      return NextResponse.json({ error: "Unauthorized" }, { status: e.status || 401 });
    }
    return NextResponse.json(
      { error: "Failed to run insights", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
