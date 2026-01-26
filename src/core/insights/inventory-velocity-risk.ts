// src/core/insights/inventory-velocity-risk.ts

export type Severity = "high" | "medium" | "low";
export type Confidence = "high" | "medium" | "low";

export type InventoryVelocityRiskItem = {
  product_id: string;
  title: string;
  inventory: number;
  price: number;
  window_days: number;
  units_sold_in_window: number;
  daily_units: number;
  days_to_stockout: number;
  confidence: Confidence;
  revenue_at_risk_estimate_7d: number; // proxy: min(inventory, daily_units*7)*price
  last_sale_at: string | null;
};

export type InventoryVelocityRiskInsight = {
  key: "inventory_velocity_risk";
  title: string;
  severity: Severity;
  summary: string;
  suggested_action: string;
  items: InventoryVelocityRiskItem[];
  metrics: {
    evaluated_window_days: number;
    candidates_considered: number;
    items_flagged: number;
  };
  evaluated_at: string;
};

// ---- Adapters (edit these if your ctx shape differs) ----
type CtxOrder = any;
type CtxProduct = any;

function getOrderCreatedAt(o: CtxOrder): number | null {
  const raw = o?.created_at ?? o?.createdAt ?? o?.created;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isCancelled(o: CtxOrder): boolean {
  return Boolean(o?.cancelled_at ?? o?.cancelledAt);
}

/**
 * Returns array of {product_id, quantity}.
 * Supports a few common shapes:
 * - o.line_items: [{product_id, quantity}]
 * - o.lineItems.edges[].node.product.id + quantity
 * - o.lineItems: [{product:{id}, quantity}]
 */
function extractLineItems(o: CtxOrder): Array<{ product_id: string; quantity: number }> {
  // Shape A: line_items (REST-like)
  const liA = o?.line_items;
  if (Array.isArray(liA)) {
    return liA
      .map((x: any) => ({
        product_id: String(x?.product_id ?? x?.product?.id ?? ""),
        quantity: Number(x?.quantity ?? 0),
      }))
      .filter((x: any) => x.product_id && Number.isFinite(x.quantity) && x.quantity > 0);
  }

  // Shape B: lineItems.edges.node (GraphQL-like)
  const edges = o?.lineItems?.edges;
  if (Array.isArray(edges)) {
    return edges
      .map((e: any) => e?.node)
      .filter(Boolean)
      .map((n: any) => ({
        product_id: String(n?.product?.id ?? ""),
        quantity: Number(n?.quantity ?? 0),
      }))
      .filter((x: any) => x.product_id && Number.isFinite(x.quantity) && x.quantity > 0);
  }

  // Shape C: lineItems flat
  const liC = o?.lineItems;
  if (Array.isArray(liC)) {
    return liC
      .map((n: any) => ({
        product_id: String(n?.product?.id ?? n?.product_id ?? ""),
        quantity: Number(n?.quantity ?? 0),
      }))
      .filter((x: any) => x.product_id && Number.isFinite(x.quantity) && x.quantity > 0);
  }

  return [];
}

function getProductId(p: CtxProduct): string {
  return String(p?.id ?? p?.product_id ?? "");
}

function getProductTitle(p: CtxProduct): string {
  return String(p?.title ?? "Untitled product");
}

function getProductInv(p: CtxProduct): number {
  const v =
    p?.inventory_quantity ??
    p?.totalInventory ??
    p?.total_inventory ??
    p?.inventory ??
    0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getProductPrice(p: CtxProduct): number {
  const v =
    p?.price ??
    p?.price_amount ??
    p?.priceRangeV2?.minVariantPrice?.amount ??
    0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ---- Core logic ----

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function confidenceFor(unitsSold: number, windowDays: number): Confidence {
  // Simple heuristic: enough events per window => higher confidence
  if (unitsSold >= Math.max(10, windowDays)) return "high";
  if (unitsSold >= Math.max(4, Math.floor(windowDays / 2))) return "medium";
  return "low";
}

function severityFor(daysToStockout: number): Severity | null {
  if (!Number.isFinite(daysToStockout)) return null;
  if (daysToStockout <= 3) return "high";
  if (daysToStockout <= 7) return "medium";
  if (daysToStockout <= 14) return "low";
  return null; // not risky enough
}

export function evaluateInventoryVelocityRisk(ctx: any): InventoryVelocityRiskInsight | null {
  const now = ctx?.now ? new Date(ctx.now) : new Date();
  const nowMs = now.getTime();

  const orders: CtxOrder[] = Array.isArray(ctx?.orders) ? ctx.orders : [];
  const products: CtxProduct[] = Array.isArray(ctx?.products) ? ctx.products : [];

  // Map products by id for joins
  const productById = new Map<string, CtxProduct>();
  for (const p of products) {
    const id = getProductId(p);
    if (id) productById.set(id, p);
  }

  // Precompute sales per product for multiple windows
  const WINDOWS = [7, 14, 30];

  type SalesAgg = {
    units: number;
    lastSaleMs: number | null;
  };

  // windowDays -> productId -> SalesAgg
  const salesByWindow = new Map<number, Map<string, SalesAgg>>();
  for (const w of WINDOWS) salesByWindow.set(w, new Map());

  for (const o of orders) {
    if (isCancelled(o)) continue;
    const createdMs = getOrderCreatedAt(o);
    if (!createdMs) continue;

    const items = extractLineItems(o);
    if (items.length === 0) continue;

    for (const w of WINDOWS) {
      const cutoffMs = nowMs - w * 24 * 60 * 60 * 1000;
      if (createdMs < cutoffMs) continue;

      const bucket = salesByWindow.get(w)!;

      for (const it of items) {
        const pid = it.product_id;
        if (!pid) continue;

        const prev = bucket.get(pid) ?? { units: 0, lastSaleMs: null };
        const units = prev.units + it.quantity;
        const lastSaleMs = prev.lastSaleMs ? Math.max(prev.lastSaleMs, createdMs) : createdMs;
        bucket.set(pid, { units, lastSaleMs });
      }
    }
  }

  // Choose best window per product (7d if enough data, else 14d, else 30d)
  const candidates: InventoryVelocityRiskItem[] = [];
  let candidatesConsidered = 0;

  for (const [pid, p] of productById.entries()) {
    const inv = getProductInv(p);
    const price = getProductPrice(p);
    if (inv <= 0) continue; // already out of stock; handled by inventory_pressure
    if (!Number.isFinite(inv)) continue;

    // Find a window where it actually sold
    let chosenWindow: number | null = null;
    let unitsSold = 0;
    let lastSaleMs: number | null = null;

    for (const w of WINDOWS) {
      const bucket = salesByWindow.get(w)!;
      const agg = bucket.get(pid);
      if (!agg) continue;

      // Choose first window with meaningful sales
      // (Prefer shorter window if it has any sales; but ensure not too sparse)
      if (agg.units >= 2 || w === 30) {
        chosenWindow = w;
        unitsSold = agg.units;
        lastSaleMs = agg.lastSaleMs;
        break;
      }
    }

    // If no sales in 30d, it’s not a velocity stockout risk (it’s dead inventory)
    if (!chosenWindow || unitsSold <= 0) continue;

    candidatesConsidered++;

    const dailyUnits = unitsSold / chosenWindow;
    if (dailyUnits <= 0) continue;

    const daysToStockout = inv / dailyUnits;
    const sev = severityFor(daysToStockout);
    if (!sev) continue;

    const conf = confidenceFor(unitsSold, chosenWindow);

    const unitsNext7d = dailyUnits * 7;
    const sellableUnits7d = Math.min(inv, unitsNext7d);
    const revAtRisk7d = round2(sellableUnits7d * price);

    const title = getProductTitle(p);

    candidates.push({
      product_id: pid,
      title,
      inventory: inv,
      price,
      window_days: chosenWindow,
      units_sold_in_window: unitsSold,
      daily_units: round2(dailyUnits),
      days_to_stockout: round2(daysToStockout),
      confidence: conf,
      revenue_at_risk_estimate_7d: revAtRisk7d,
      last_sale_at: lastSaleMs ? new Date(lastSaleMs).toISOString() : null,
    });
  }

  if (candidates.length === 0) return null;

  // Rank: soonest stockout first; tie-break by revenue-at-risk
  candidates.sort((a, b) => {
    if (a.days_to_stockout !== b.days_to_stockout) return a.days_to_stockout - b.days_to_stockout;
    return b.revenue_at_risk_estimate_7d - a.revenue_at_risk_estimate_7d;
  });

  const top = candidates.slice(0, 8);

  // Overall severity is max of top items
  const severity: Severity =
    top.some((x) => x.days_to_stockout <= 3) ? "high" :
    top.some((x) => x.days_to_stockout <= 7) ? "medium" :
    "low";

  const title =
    severity === "high"
      ? "Stockouts likely within days for fast sellers"
      : severity === "medium"
      ? "Some fast sellers may stock out soon"
      : "A few products are trending toward stockout";

  const summary =
    `Based on recent sales velocity, ${top.length} product(s) may stock out soon. ` +
    `Soonest: ${top[0].title} (~${top[0].days_to_stockout} days).`;

  const suggested_action =
    "Prioritize replenishment for the top items, pause ads or featured placement if inventory is too low, and add back-in-stock capture if restock timing is uncertain.";

  // Pick evaluated_window_days as the most common chosen window in top
  const windowCounts = top.reduce((acc, x) => {
    acc[x.window_days] = (acc[x.window_days] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const evaluated_window_days = Number(
    Object.entries(windowCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 7
  );

  return {
    key: "inventory_velocity_risk",
    title,
    severity,
    summary,
    suggested_action,
    items: top,
    metrics: {
      evaluated_window_days,
      candidates_considered: candidatesConsidered,
      items_flagged: candidates.length,
    },
    evaluated_at: now.toISOString(),
  };
}
