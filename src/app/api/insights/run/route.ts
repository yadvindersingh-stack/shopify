import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { shopifyGraphql } from "@/lib/shopify-admin";
import { INSIGHT_CONTEXT_QUERY } from "@/lib/queries/insight-context";
import { buildInsightContext } from "@/core/insights/build-context";
import { evaluateSalesRhythmDrift } from "@/core/insights/sales-rhythm-drift";
import { getShopFromRequestAuthHeader } from "@/lib/shopify-session";
import { evaluateInventoryVelocityRisk } from "@/core/insights/inventory-velocity-risk";


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

async function alreadyInsertedRecently(shopId: string, type: string) {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("insights")
    .select("id")
    .eq("shop_id", shopId)
    .eq("type", type)
    .gte("created_at", since)
    .limit(1);

  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

function getInventory(p: any): number {
  const candidates = [
    p?.totalInventory,
    p?.inventory_quantity,
    p?.inventoryQuantity,
    p?.inventory,
    p?.inv,
  ];
  for (const v of candidates) {
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return 0;
}

function getTitle(p: any): string {
  return p?.title || p?.name || p?.handle || "Untitled product";
}

/**
 * Inventory Pressure:
 * fires if ANY product inventory <= 2
 */
function evaluateInventoryPressureFromShopifyData(data: any) {
  const raw = data?.products;

  let nodes: any[] = [];
  if (Array.isArray(raw?.edges)) nodes = raw.edges.map((e: any) => e?.node).filter(Boolean);
  else if (Array.isArray(raw?.nodes)) nodes = raw.nodes.filter(Boolean);
  else if (Array.isArray(raw)) nodes = raw;

  const normalized = nodes
    .map((p) => ({
      title: p?.title || "Untitled product",
      inv: typeof p?.totalInventory === "number" ? p.totalInventory : 0,
      id: p?.id,
    }))
    .sort((a, b) => a.inv - b.inv);

  const low = normalized.filter((p) => p.inv <= 2);

  console.log("INV_DIAG", {
    productsCount: normalized.length,
    lowest10: normalized.slice(0, 10).map((p) => ({ title: p.title, inv: p.inv })),
    lowCount: low.length,
  });

  if (!low.length) return null;

  const hasZero = low.some((p) => p.inv === 0);
  const severity: "high" | "medium" = hasZero ? "high" : "medium";

  const top = low.slice(0, 5);
  return {
    key: "inventory_pressure",
    title: hasZero ? "Products are out of stock" : "Some products are running low",
    severity,
    summary:
      "These items have very low inventory: " +
      top.map((p) => `${p.title} (${p.inv})`).join(", ") +
      (low.length > top.length ? ` (+${low.length - top.length} more)` : "") +
      ".",
    suggested_action: hasZero
      ? "Restock or set expectations (preorder/backorder). Consider pausing ads for out-of-stock items."
      : "Restock soon or adjust merchandising to avoid stockouts.",
    items: low,
    evaluated_at: new Date().toISOString(),
  };
}


function toDbInsight(shopId: string, r: any): DbInsight {
  const type = r?.key || r?.type || "unknown";
  return {
    shop_id: shopId,
    type,
    title: r?.title || "Insight",
    description: r?.summary || r?.description || "",
    severity: (r?.severity || "medium") as "low" | "medium" | "high",
    suggested_action: r?.suggested_action || null,
    data_snapshot: r,
  };
}

export async function POST(req: NextRequest) {
  try {
    const force = req.nextUrl.searchParams.get("force") === "1";

    const shopFromToken = getShopFromRequestAuthHeader(req.headers.get("authorization"))?.toLowerCase();
    const shopFromQuery = normalizeShop(req.nextUrl.searchParams.get("shop"));
    const shop = shopFromToken || shopFromQuery;

    if (!shop) {
      return NextResponse.json({ error: "Missing shop context" }, { status: 401 });
    }

    const { data: shopRow, error: shopErr } = await supabase
      .from("shops")
      .select("id, access_token")
      .eq("shop_domain", shop)
      .maybeSingle();

    if (shopErr) {
      return NextResponse.json({ error: "Failed to read shop", details: shopErr.message }, { status: 500 });
    }

    if (!shopRow?.id || !shopRow?.access_token) {
      return NextResponse.json({ error: "Shop not installed or missing access token", shop }, { status: 403 });
    }

    // ✅ Force insert to prove DB writes work (use /api/insights/run?force=1)
    if (force) {
      const row: DbInsight = {
        shop_id: shopRow.id,
        type: "force_test",
        title: "Force test insight",
        description: "If you see this in UI, insert path is good.",
        severity: "low",
        suggested_action: "Remove force=1 after test.",
        data_snapshot: { forced: true, at: new Date().toISOString() },
      };

      const { error: insErr } = await supabase.from("insights").insert([row]);
      if (insErr) {
        return NextResponse.json({ error: "Force insert failed", details: insErr.message }, { status: 500 });
      }
      return NextResponse.json({ inserted: 1, keys: ["force_test"], forced: true });
    }

    const sinceIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const ordersQuery = `created_at:>=${sinceIso}`;

    const data = await shopifyGraphql({
      shop,
      accessToken: shopRow.access_token,
      query: INSIGHT_CONTEXT_QUERY,
      variables: { ordersQuery },
    });

const ctx = buildInsightContext(shop, new Date(), data);

// ✅ log the raw shape once (remove later)
console.log("SHOPIFY_PRODUCTS_RAW", {
  hasProducts: Boolean((data as any)?.products),
  edgesLen: (data as any)?.products?.edges?.length ?? null,
  nodesLen: (data as any)?.products?.nodes?.length ?? null,
});

    const results: any[] = [];
    const drift = await evaluateSalesRhythmDrift(ctx);
    if (drift) results.push(drift);

   const inv = evaluateInventoryPressureFromShopifyData(data);

    if (inv) results.push(inv);

    const inserts: DbInsight[] = [];
    for (const r of results) {
      const type = r?.key || r?.type;
      if (!type) continue;

      const recently = await alreadyInsertedRecently(shopRow.id, type);
      if (recently) continue;

      inserts.push(toDbInsight(shopRow.id, r));
    }

    if (!inserts.length) {
      return NextResponse.json({
        inserted: 0,
        keys: [],
        diag: { evaluated: results.map((r) => r?.key || r?.type).filter(Boolean) },
      });
    }
    const insight = evaluateInventoryVelocityRisk(ctx);
if (!insight) {
  return NextResponse.json({ inserted: 0, keys: [] });
}

// optional: 6-hour guard (recommended)
const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
const { data: recent } = await supabase
  .from("insights")
  .select("id")
  .eq("shop_id", shopRow.id)
  .eq("type", insight.type)
  .gte("created_at", sixHoursAgo)
  .maybeSingle();

if (recent?.id) {
  return NextResponse.json({ inserted: 0, keys: [insight.type], skipped: "guard_6h" });
}

const { error } = await supabase.from("insights").insert({
  shop_id: shopRow.id,
  type: insight.type,
  title: insight.title,
  description: insight.description,
  severity: insight.severity,
  suggested_action: insight.suggested_action,
  data_snapshot: insight.data_snapshot,
});

if (error) {
  return NextResponse.json({ error: error.message }, { status: 500 });
}

//return NextResponse.json({ inserted: 1, keys: [insight.type] });

    const { error: insErr } = await supabase.from("insights").insert(inserts);
    if (insErr) {
      return NextResponse.json({ error: "Insert failed", details: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ inserted: inserts.length, keys: inserts.map((i) => i.type) });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to run insights", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
