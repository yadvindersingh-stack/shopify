import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { shopifyGraphql } from "@/lib/shopify-admin";
import { INSIGHT_CONTEXT_QUERY } from "@/lib/queries/insight-context";
import { buildInsightContext } from "@/core/insights/build-context";
import { evaluateSalesRhythmDrift } from "@/core/insights/sales-rhythm-drift";
import { getShopFromRequestAuthHeader } from "@/lib/shopify-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DbInsight = {
  shop_id: string;
  type: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  suggested_action: string | null;
  data_snapshot: any;
};

function normalizeShop(shop?: string | null) {
  return (shop || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

function toDbInsight(args: {
  shopId: string;
  type: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  suggested_action?: string | null;
  data_snapshot?: any;
}): DbInsight {
  return {
    shop_id: args.shopId,
    type: args.type,
    title: args.title,
    description: args.description,
    severity: args.severity,
    suggested_action: args.suggested_action ?? null,
    data_snapshot: args.data_snapshot ?? null,
  };
}

/**
 * Deterministic “Inventory Pressure” insight:
 * fires if ANY product totalInventory <= 2 (including 0).
 */
function evaluateInventoryPressure(ctx: any) {
  const products: Array<any> =
    (ctx?.products as any[]) ||
    (ctx?.catalog?.products as any[]) ||
    (ctx?.data?.products as any[]) ||
    [];

  // Normalize to { title, inv }
  const normalized = products
    .map((p) => ({
      title: p?.title ?? p?.name ?? "Untitled product",
      inv:
        typeof p?.totalInventory === "number"
          ? p.totalInventory
          : typeof p?.inventory === "number"
          ? p.inventory
          : typeof p?.inv === "number"
          ? p.inv
          : 0,
    }))
    .sort((a, b) => a.inv - b.inv);

  // Keep only low inventory items
  const low = normalized.filter((p) => p.inv <= 2);

  // Helpful server-side debug (you already saw this style in logs)
  console.log(
    "INV_DEBUG lowest inventories",
    normalized.slice(0, 10).map((p) => ({ title: p.title, inv: p.inv }))
  );

  if (!low.length) return null;

  const hasZero = low.some((p) => p.inv === 0);
  const severity: "high" | "medium" = hasZero ? "high" : "medium";

  const top = low.slice(0, 5);
  const title = hasZero
    ? "Products are out of stock"
    : "Some products are running low";

  const description =
    "These items have very low inventory: " +
    top.map((p) => `${p.title} (${p.inv})`).join(", ") +
    (low.length > top.length ? ` (+${low.length - top.length} more)` : "") +
    ".";

  const suggested_action = hasZero
    ? "Restock or set expectations (backorder/preorder). Consider pausing ads for OOS items."
    : "Restock soon or adjust merchandising to avoid stockouts.";

  return {
    key: "inventory_pressure",
    title,
    severity,
    summary: description,
    suggested_action,
    items: low,
    evaluated_at: new Date().toISOString(),
  };
}

/**
 * 6-hour dedupe: don’t insert the same insight type more than once in last 6h.
 */
async function alreadyInsertedRecently(shopId: string, type: string) {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("insights")
    .select("id")
    .eq("shop_id", shopId)
    .eq("type", type)
    .gte("created_at", since)
    .limit(1);

  if (error) {
    // If this check fails, don’t block inserts. Log and continue.
    console.log("DEDUP_CHECK_FAILED", { type, message: error.message });
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

export async function POST(req: NextRequest) {
  try {
    // 1) shop context
    const shopFromToken = getShopFromRequestAuthHeader(req.headers.get("authorization"))?.toLowerCase();
    const shopFromQuery = normalizeShop(req.nextUrl.searchParams.get("shop"));
    const shop = shopFromToken || (shopFromQuery || null);

    if (!shop) {
      return NextResponse.json(
        {
          error: "Missing shop context",
          hint: "No valid Shopify session token (Authorization) and no shop query param.",
        },
        { status: 401 }
      );
    }

    // 2) token + shopId
    const { data: shopRow, error: shopErr } = await supabase
      .from("shops")
      .select("id, access_token")
      .eq("shop_domain", shop)
      .maybeSingle();

    if (shopErr) {
      return NextResponse.json({ error: "Failed to read shop token", details: shopErr.message }, { status: 500 });
    }

    if (!shopRow?.access_token || !shopRow?.id) {
      return NextResponse.json({ error: "Shop not installed or missing access token", shop }, { status: 403 });
    }

    // 3) fetch context
    const sinceIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const ordersQuery = `created_at:>=${sinceIso}`;

    const data = await shopifyGraphql({
      shop,
      accessToken: shopRow.access_token,
      query: INSIGHT_CONTEXT_QUERY,
      variables: { ordersQuery },
    });

    const ctx = buildInsightContext(shop, new Date(), data);

    // 4) evaluate insights
    const results: any[] = [];

    const drift = await evaluateSalesRhythmDrift(ctx);
    if (drift) results.push(drift);

    const inv = evaluateInventoryPressure(ctx);
    if (inv) results.push(inv);

    // 5) map -> DB inserts (only if issue exists) + 6h dedupe
    const inserts: DbInsight[] = [];

    for (const r of results) {
      const type = r?.key || r?.type;
      if (!type) continue;

      const recently = await alreadyInsertedRecently(shopRow.id, type);
      if (recently) continue;

      const dbRow = toDbInsight({
        shopId: shopRow.id,
        type,
        title: r?.title || "Insight",
        description: r?.summary || r?.description || "",
        severity: (r?.severity || "medium") as "low" | "medium" | "high",
        suggested_action: r?.suggested_action || null,
        data_snapshot: r,
      });

      inserts.push(dbRow);
    }

    let inserted = 0;
    if (inserts.length) {
      const { error: insErr } = await supabase.from("insights").insert(inserts);
      if (insErr) {
        return NextResponse.json(
          { error: "Failed to store insights", details: insErr.message },
          { status: 500 }
        );
      }
      inserted = inserts.length;
    }

    return NextResponse.json({
      inserted,
      keys: inserts.map((i) => i.type),
      insights: inserts, // useful for UI right away
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to run insights", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
