import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { shopifyGraphql } from "@/lib/shopify-admin";
import { INSIGHT_CONTEXT_QUERY } from "@/lib/queries/insight-context";
import { buildInsightContext } from "@/core/insights/build-context";
import { evaluateSalesRhythmDrift } from "@/core/insights/sales-rhythm-drift";
import { getShopFromRequestAuthHeader } from "@/lib/shopify-session";
import { evaluateInventoryVelocityRisk } from "@/core/insights/inventory-velocity-risk";
import { evaluateProductConcentrationRisk } from "@/core/insights/product-concentration-risk";
import { evaluatePriceVolatilityRisk } from "@/core/insights/price-volatility-risk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Severity = "low" | "medium" | "high";

type DbInsight = {
  shop_id: string;
  type: string;
  title: string;
  description: string;
  severity: Severity;
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

/**
 * Inventory Pressure (simple deterministic rule)
 * fires if ANY product inventory <= 2
 */
function evaluateInventoryPressureFromShopifyData(data: any) {
  const raw = data?.products;

  let nodes: any[] = [];
  if (Array.isArray(raw?.edges)) nodes = raw.edges.map((e: any) => e?.node).filter(Boolean);
  else if (Array.isArray(raw?.nodes)) nodes = raw.nodes.filter(Boolean);
  else if (Array.isArray(raw)) nodes = raw;

  // Try multiple inventory fields (Shopify can vary based on mapping)
  const invOf = (p: any) => {
    const v =
      p?.totalInventory ??
      p?.inventory_quantity ??
      p?.inventoryQuantity ??
      p?.inventory ??
      p?.inv ??
      0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const normalized = nodes
    .map((p) => ({
      title: p?.title || "Untitled product",
      inv: invOf(p),
      id: p?.id,
    }))
    .sort((a, b) => a.inv - b.inv);

  const low = normalized.filter((p) => p.inv <= 2);

  // keep diag small & useful
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
    severity: (r?.severity || "medium") as Severity,
    suggested_action: r?.suggested_action || null,
    data_snapshot: r,
  };
}

/**
 * Per-insight “spam guards”
 */
const GUARD_HOURS: Record<string, number> = {
  inventory_pressure: 6,
  inventory_velocity_risk: 6,
  sales_rhythm_drift: 6,
  dead_inventory: 24 * 7, // 7 days
  product_concentration: 24, // 1 day
  price_volatility_risk: 24, // 1 day
};

async function alreadyInsertedWithin(shopId: string, type: string, hours: number) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("insights")
    .select("id")
    .eq("shop_id", shopId)
    .eq("type", type)
    .gte("created_at", since)
    .limit(1);

  if (error) return false; // fail open
  return Array.isArray(data) && data.length > 0;
}

/**
 * Price snapshots (required for price volatility insight)
 * NOTE: Assumes you created `product_price_snapshots` table.
 */
async function snapshotProductPrices(args: { supabase: any; shopId: string; data: any; now: Date }) {
  const { supabase, shopId, data, now } = args;

  const edges = data?.products?.edges ?? [];
  if (!edges.length) return { inserted: 0 };

  const rows = edges
    .map((e: any) => {
      const id = e?.node?.id ? String(e.node.id) : "";
      const title = e?.node?.title ? String(e.node.title) : null;
      const price = Number(e?.node?.priceRangeV2?.minVariantPrice?.amount);
      if (!id || !Number.isFinite(price)) return null;
      return {
        shop_id: shopId,
        product_id: id,
        title,
        price,
        captured_at: now.toISOString(),
      };
    })
    .filter(Boolean);

  if (!rows.length) return { inserted: 0 };

  const { error } = await supabase.from("product_price_snapshots").insert(rows);
  if (error) throw new Error(`Failed to insert price snapshots: ${error.message}`);

  return { inserted: rows.length };
}

/**
 * Dead inventory v2 (your current implementation)
 */
function evaluateDeadInventoryFromShopifyData(data: any, opts?: { windowDays?: number; minStock?: number }) {
  const WINDOW_DAYS = opts?.windowDays ?? 30;
  const MIN_STOCK = opts?.minStock ?? 10;
  const SLOW_MOVER_DAYS = 90;

  const now = new Date();
  const cutoff30Ms = now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const cutoff90Ms = now.getTime() - SLOW_MOVER_DAYS * 24 * 60 * 60 * 1000;

  const pEdges = data?.products?.edges ?? [];
  const products = Array.isArray(pEdges) ? pEdges.map((e: any) => e?.node).filter(Boolean) : [];

  const oEdges = data?.orders?.edges ?? [];
  const orders = Array.isArray(oEdges) ? oEdges.map((e: any) => e?.node).filter(Boolean) : [];

  const lastSaleMsByProduct = new Map<string, number>();
  const everSoldSet = new Set<string>();

  for (const o of orders) {
    if (o?.cancelledAt) continue;

    const createdAt = o?.createdAt;
    const createdMs = createdAt ? new Date(createdAt).getTime() : NaN;
    if (!Number.isFinite(createdMs)) continue;

    const liEdges = o?.lineItems?.edges ?? [];
    for (const liE of liEdges) {
      const li = liE?.node;
      const pid = li?.product?.id;
      if (!pid) continue;

      everSoldSet.add(pid);

      const prev = lastSaleMsByProduct.get(pid);
      if (!prev || createdMs > prev) lastSaleMsByProduct.set(pid, createdMs);
    }
  }

  const invOf = (p: any) => {
    const v =
      p?.totalInventory ??
      p?.inventory_quantity ??
      p?.inventoryQuantity ??
      p?.inventory ??
      0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const priceOf = (p: any) => {
    const amt =
      p?.priceRangeV2?.minVariantPrice?.amount ??
      p?.priceRange?.minVariantPrice?.amount ??
      p?.price ??
      0;
    const n = Number(amt);
    return Number.isFinite(n) ? n : 0;
  };

  type Bucket = "never_sold" | "stopped_selling" | "slow_mover";

  const deadItems: Array<{
    product_id: string;
    title: string;
    inventory: number;
    price: number;
    cash_trapped_estimate: number;
    bucket: Bucket;
    last_sale_at: string | null;
    days_since_last_sale: number | null;
  }> = [];

  for (const p of products) {
    const productId = p?.id;
    if (!productId) continue;

    const title = String(p?.title ?? "Untitled product");
    const inventory = invOf(p);
    const price = priceOf(p);

    if (inventory < MIN_STOCK) continue;
    if (title.toLowerCase().includes("gift card")) continue;

    const status = (p?.status ?? "").toString().toUpperCase();
    if (status && status !== "ACTIVE") continue;

    const lastSaleMs = lastSaleMsByProduct.get(productId);
    const everSold = everSoldSet.has(productId);

    let bucket: Bucket | null = null;

    if (!everSold) {
      bucket = "never_sold";
    } else if (lastSaleMs && lastSaleMs < cutoff30Ms) {
      bucket = lastSaleMs >= cutoff90Ms ? "slow_mover" : "stopped_selling";
    } else {
      bucket = null;
    }

    if (!bucket) continue;

    const lastSaleAt = lastSaleMs ? new Date(lastSaleMs).toISOString() : null;
    const daysSince = lastSaleMs
      ? Math.floor((now.getTime() - lastSaleMs) / (24 * 60 * 60 * 1000))
      : null;

    const cashTrapped = Math.round(inventory * price * 100) / 100;

    deadItems.push({
      product_id: productId,
      title,
      inventory,
      price,
      cash_trapped_estimate: cashTrapped,
      bucket,
      last_sale_at: lastSaleAt,
      days_since_last_sale: daysSince,
    });
  }

  const bucketCounts = deadItems.reduce((acc, x) => {
    acc[x.bucket] = (acc[x.bucket] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log("DEAD_INV_V2_DIAG", {
    productsCount: products.length,
    ordersCount: orders.length,
    minStock: MIN_STOCK,
    deadCount: deadItems.length,
    buckets: bucketCounts,
    topByCash: deadItems
      .slice()
      .sort((a, b) => b.cash_trapped_estimate - a.cash_trapped_estimate)
      .slice(0, 5)
      .map((x) => ({ title: x.title, bucket: x.bucket, cash: x.cash_trapped_estimate })),
  });

  if (deadItems.length === 0) return null;

  deadItems.sort((a, b) => b.cash_trapped_estimate - a.cash_trapped_estimate);

  const deadCount = deadItems.length;
  const totalTrapped = deadItems.reduce((sum, x) => sum + x.cash_trapped_estimate, 0);

  const severity: "high" | "medium" | "low" =
    totalTrapped >= 500 ? "high" : deadCount >= 3 ? "medium" : "low";

  const top = deadItems.slice(0, 8);

  const dominantBucket =
    (bucketCounts["never_sold"] ?? 0) >= (bucketCounts["stopped_selling"] ?? 0) &&
    (bucketCounts["never_sold"] ?? 0) >= (bucketCounts["slow_mover"] ?? 0)
      ? "never_sold"
      : (bucketCounts["stopped_selling"] ?? 0) >= (bucketCounts["slow_mover"] ?? 0)
      ? "stopped_selling"
      : "slow_mover";

  const title =
    severity === "high" ? "Cash is trapped in non-moving inventory" : "Some inventory isn’t moving";

  const description =
    `We found ${deadCount} products with stock (≥${MIN_STOCK}) that haven’t sold recently. ` +
    `Estimated cash tied up (price × stock): $${Math.round(totalTrapped)}. ` +
    `Top: ${top.map((x) => `${x.title} ($${x.cash_trapped_estimate})`).join(", ")}.`;

  const suggested_action =
    dominantBucket === "never_sold"
      ? "These items have never sold. Hide them from main collections, test a small discount or bundle with a bestseller, and fix listing basics (title/images) before spending on ads."
      : dominantBucket === "stopped_selling"
      ? "These items used to sell but stopped. Check recent price changes, collection placement, and whether demand shifted. Run a short clearance/bundle test and reduce exposure if they don’t recover."
      : "These items are slow movers. Create a bundle/upsell placement, run a small promo, and avoid reordering until sell-through improves.";

  return {
    key: "dead_inventory",
    title,
    severity,
    summary: description,
    suggested_action,
    evaluated_at: now.toISOString(),
    metrics: {
      window_days: WINDOW_DAYS,
      slow_mover_days: SLOW_MOVER_DAYS,
      min_stock_threshold: MIN_STOCK,
      dead_count: deadCount,
      buckets: bucketCounts,
      total_cash_trapped_estimate: Math.round(totalTrapped * 100) / 100,
    },
    items: top,
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

    // Force insert path (keep as-is)
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

    // Fetch context once
    const sinceIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const ordersQuery = `created_at:>=${sinceIso}`;

    const data = await shopifyGraphql({
      shop,
      accessToken: shopRow.access_token,
      query: INSIGHT_CONTEXT_QUERY,
      variables: { ordersQuery },
    });

    const now = new Date();

    // ✅ Step 3 (the missing piece): snapshot prices every scan
    // This is harmless even if you don't trigger price volatility yet.
    try {
      const snap = await snapshotProductPrices({ supabase, shopId: shopRow.id, data, now });
      console.log("PRICE_SNAPSHOT_DIAG", snap);
    } catch (e: any) {
      console.log("PRICE_SNAPSHOT_FAILED", e?.message || String(e));
      // Don't fail the whole scan; snapshotting shouldn't break core insights.
    }

    const ctx = buildInsightContext(shop, now, data);

    // ---- Evaluate (pure) ----
    const candidates: any[] = [];

    const drift = await evaluateSalesRhythmDrift(ctx);
    if (drift) candidates.push(drift);

    const invPressure = evaluateInventoryPressureFromShopifyData(data);
    if (invPressure) candidates.push(invPressure);

    const dead = evaluateDeadInventoryFromShopifyData(data, { windowDays: 30, minStock: 10 });
    if (dead) candidates.push(dead);

    const velocity = evaluateInventoryVelocityRisk(ctx);
    if (velocity) candidates.push(velocity);

    // Product concentration (raw data, not ctx)
    const concentration = (evaluateProductConcentrationRisk as any)({ data, now, windowDays: 14 });
    if (concentration) candidates.push(concentration);

    // ✅ Price volatility (uses snapshots + current data)
    const priceVol = await (evaluatePriceVolatilityRisk as any)({
      supabase,
      shopId: shopRow.id,
      data,
      now,
      lookbackDays: 7,
    });
    if (priceVol) candidates.push(priceVol);

    // ---- Persist (guarded) ----
    const inserts: DbInsight[] = [];
    const skipped: Array<{ type: string; reason: string }> = [];

    for (const c of candidates) {
      const type = c?.key || c?.type;
      if (!type) continue;

      const hours = GUARD_HOURS[type] ?? 6;
      const recently = await alreadyInsertedWithin(shopRow.id, type, hours);

      if (recently) {
        skipped.push({ type, reason: `guard_${hours}h` });
        continue;
      }

      inserts.push(toDbInsight(shopRow.id, c));
    }

    if (inserts.length > 0) {
      const { error: insErr } = await supabase
        .from("insights")
        .upsert(inserts, { onConflict: "shop_id,type" });

      if (insErr) {
        return NextResponse.json({ error: "Insert failed", details: insErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      inserted: inserts.length,
      keys: inserts.map((i) => i.type),
      evaluated: candidates.map((c) => c?.key || c?.type).filter(Boolean),
      skipped,
      diag: {
        products_present: Boolean((data as any)?.products),
        products_edges: (data as any)?.products?.edges?.length ?? null,
        orders_edges: (data as any)?.orders?.edges?.length ?? null,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to run insights", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
