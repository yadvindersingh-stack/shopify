import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { shopifyGraphql } from "@/lib/shopify-admin";
import { INSIGHT_CONTEXT_QUERY } from "@/lib/queries/insight-context";
import { buildInsightContext } from "@/core/insights/build-context";
import { evaluateSalesRhythmDrift } from "@/core/insights/sales-rhythm-drift";
import { getShopFromRequestAuthHeader } from "@/lib/shopify-session";
import { evaluateInventoryVelocityRisk } from "@/core/insights/inventory-velocity-risk";
import { evaluateDeadInventory } from "@/core/insights/dead-inventory";

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

  // Keep the log small & useful (remove later)
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
 * Keep it simple & explicit.
 */
const GUARD_HOURS: Record<string, number> = {
  // deterministic inventory is noisy if inserted too often
  inventory_pressure: 6,

  // your velocity insight should not spam
  inventory_velocity_risk: 6,

  // drift is time-based; 6h guard is fine for MVP
  sales_rhythm_drift: 6,

  // dead inventory is strategic; don’t repeat too often
  dead_inventory: 24 * 7, // 7 days
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

  if (error) return false; // fail open (don’t block)
  return Array.isArray(data) && data.length > 0;
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

    // Force insert path to validate DB writes quickly
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

    const ctx = buildInsightContext(shop, new Date(), data);

    // ---- Evaluate (pure) ----
    const candidates: any[] = [];

    const drift = await evaluateSalesRhythmDrift(ctx);
    if (drift) candidates.push(drift);

    const invPressure = evaluateInventoryPressureFromShopifyData(data);
    if (invPressure) candidates.push(invPressure);

  const dead = evaluateDeadInventoryFromShopifyData(data, {
  windowDays: 30,
  minStock: 10,
});
if (dead) candidates.push(dead);

    const velocity = evaluateInventoryVelocityRisk(ctx);
    if (velocity) candidates.push(velocity);

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
      const { error: insErr } = await supabase.from("insights").insert(inserts);
      if (insErr) {
        return NextResponse.json({ error: "Insert failed", details: insErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      inserted: inserts.length,
      keys: inserts.map((i) => i.type),
      evaluated: candidates.map((c) => c?.key || c?.type).filter(Boolean),
      skipped,
      // Light diagnostics that don’t create log chaos:
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
function evaluateDeadInventoryFromShopifyData(
  data: any,
  opts?: { windowDays?: number; minStock?: number }
) {
  const WINDOW_DAYS = opts?.windowDays ?? 30;
  const MIN_STOCK = opts?.minStock ?? 10;

  const now = new Date();
  const cutoffMs = now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000;

  // Products
  const pEdges = data?.products?.edges ?? [];
  const products = Array.isArray(pEdges) ? pEdges.map((e: any) => e?.node).filter(Boolean) : [];

  // Orders (optional for “last sold”, but dead inventory only needs “no sale in window”)
  const oEdges = data?.orders?.edges ?? [];
  const orders = Array.isArray(oEdges) ? oEdges.map((e: any) => e?.node).filter(Boolean) : [];

  // Build last sale per productId (Shopify GID)
  const lastSaleMsByProduct = new Map<string, number>();

  for (const o of orders) {
    if (o?.cancelledAt) continue;
    const createdMs = o?.createdAt ? new Date(o.createdAt).getTime() : NaN;
    if (!Number.isFinite(createdMs)) continue;

    const liEdges = o?.lineItems?.edges ?? [];
    for (const liE of liEdges) {
      const li = liE?.node;
      const pid = li?.product?.id;
      if (!pid) continue;

      const prev = lastSaleMsByProduct.get(pid);
      if (!prev || createdMs > prev) lastSaleMsByProduct.set(pid, createdMs);
    }
  }

  // Diagnose inventory fields
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

  const deadItems: Array<{
    product_id: string;
    title: string;
    inventory: number;
    days_since_last_order: number | null;
  }> = [];

  for (const p of products) {
    const productId = p?.id;
    if (!productId) continue;

    const title = String(p?.title ?? "Untitled product");
    const inventory = invOf(p);

    // Must have high stock
    if (inventory < MIN_STOCK) continue;

    // Filter gift cards (heuristic)
    if (title.toLowerCase().includes("gift card")) continue;

    // If status exists and is not ACTIVE, skip
    const status = (p?.status ?? "").toString().toUpperCase();
    if (status && status !== "ACTIVE") continue;

    // Dead condition: no sale in window (or never sold)
    const lastSaleMs = lastSaleMsByProduct.get(productId);
    const isDead = !lastSaleMs || lastSaleMs < cutoffMs;
    if (!isDead) continue;

    const daysSince =
      lastSaleMs ? Math.floor((now.getTime() - lastSaleMs) / (24 * 60 * 60 * 1000)) : null;

    deadItems.push({
      product_id: productId,
      title,
      inventory,
      days_since_last_order: daysSince,
    });
  }

  console.log("DEAD_INV_DIAG", {
    productsCount: products.length,
    ordersCount: orders.length,
    minStock: MIN_STOCK,
    deadCount: deadItems.length,
    sample: deadItems.slice(0, 5).map((x) => ({ title: x.title, inv: x.inventory, days: x.days_since_last_order })),
  });

  if (deadItems.length === 0) return null;

  deadItems.sort((a, b) => b.inventory - a.inventory);

  const deadCount = deadItems.length;
  const severity: "high" | "medium" | "low" =
    deadCount >= 5 ? "high" : deadCount >= 2 ? "medium" : "low";

  const top = deadItems.slice(0, 8);

  return {
    key: "dead_inventory",
    title: severity === "high" ? "Cash tied up in dead inventory" : "Some products aren’t selling",
    severity,
    summary:
      `You have ${deadCount} products with stock (≥${MIN_STOCK}) and no sales in the last ${WINDOW_DAYS} days. ` +
      `Top: ${top.map((x) => `${x.title} (inv ${x.inventory})`).join(", ")}.`,
    suggested_action:
      "Discount or bundle these items, reduce visibility in collections, and archive true non-performers to free up cash.",
    items: top,
    evaluated_at: now.toISOString(),
    window_days: WINDOW_DAYS,
    min_stock_threshold: MIN_STOCK,
    dead_count: deadCount,
  };
}
