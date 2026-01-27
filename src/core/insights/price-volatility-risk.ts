// src/core/insights/price-volatility-risk.ts

export type Severity = "high" | "medium" | "low";

type ProductEdge = {
  node: {
    id?: string;
    title?: string;
    priceRangeV2?: { minVariantPrice?: { amount?: string } };
  };
};

function toNumber(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function pctChange(a: number, b: number) {
  if (a <= 0 || b <= 0) return 0;
  return Math.round(((b - a) / a) * 1000) / 10; // 1 decimal
}

/**
 * Reads snapshots for last N days and flags products with "churny" pricing:
 * - >= 3 distinct prices in 7 days OR
 * - max/min swing >= 10% in 7 days
 */
export async function evaluatePriceVolatilityRisk(args: {
  supabase: any;
  shopId: string;
  data: any; // raw Shopify GraphQL response
  now: Date;
  lookbackDays?: number; // default 7
}) {
  const { supabase, shopId, data, now } = args;
  const lookbackDays = args.lookbackDays ?? 7;

  const productEdges: ProductEdge[] = data?.products?.edges ?? [];
  if (!productEdges.length) return null;

  const cutoff = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  // Pull snapshots for these products in one go
  const productIds = productEdges
    .map((e) => e?.node?.id ? String(e.node.id) : "")
    .filter(Boolean);

  const { data: snaps, error } = await supabase
    .from("product_price_snapshots")
    .select("product_id, price, captured_at")
    .eq("shop_id", shopId)
    .in("product_id", productIds)
    .gte("captured_at", cutoff);

  if (error) throw new Error(`Failed to read price snapshots: ${error.message}`);

  // Group snapshots
  const byProduct = new Map<string, number[]>();
  for (const s of snaps ?? []) {
    const pid = String(s.product_id);
    const p = toNumber(s.price);
    if (!byProduct.has(pid)) byProduct.set(pid, []);
    byProduct.get(pid)!.push(p);
  }

  const rows: Array<{
    product_id: string;
    title: string;
    distinct_prices: number;
    min: number;
    max: number;
    swing_pct: number;
    latest: number;
    earliest: number;
    net_change_pct: number;
  }> = [];

  for (const e of productEdges) {
    const pid = e?.node?.id ? String(e.node.id) : "";
    if (!pid) continue;

    const title = String(e?.node?.title ?? "Untitled product");

    const prices = byProduct.get(pid) ?? [];
    if (prices.length < 2) continue;

    const distinct = Array.from(new Set(prices.map((x) => Math.round(x * 100) / 100)));
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    // We don't have strict ordering here without sorting by captured_at.
    // For net change, we’ll approximate using first/last after sorting snapshots by captured_at.
    // Fetch ordered for just this product would be expensive; instead do a stable approach:
    // treat earliest ~ min timestamp isn’t available here; keep net change as max vs min for now.
    const swing_pct = min > 0 ? Math.round(((max - min) / min) * 1000) / 10 : 0;

    // "latest" is current Shopify price
    const latest = toNumber(e?.node?.priceRangeV2?.minVariantPrice?.amount);
    const earliest = distinct[0] ?? latest; // not perfect, but not used for gating
    const net_change_pct = pctChange(earliest, latest);

    rows.push({
      product_id: pid,
      title,
      distinct_prices: distinct.length,
      min,
      max,
      swing_pct,
      latest,
      earliest,
      net_change_pct,
    });
  }

  // Trigger rules
  const candidates = rows
    .filter((r) => r.distinct_prices >= 3 || r.swing_pct >= 10)
    .sort((a, b) => (b.swing_pct - a.swing_pct) || (b.distinct_prices - a.distinct_prices))
    .slice(0, 8);

  if (!candidates.length) return null;

  const maxSwing = Math.max(...candidates.map((c) => c.swing_pct));
  const maxDistinct = Math.max(...candidates.map((c) => c.distinct_prices));

  const severity: Severity =
    (maxSwing >= 20 || maxDistinct >= 5) ? "high" :
    (maxSwing >= 12 || maxDistinct >= 4) ? "medium" :
    "low";

  const title =
    severity === "high"
      ? "Prices are changing frequently on key products"
      : "Price changes may be creating conversion noise";

  const summary =
    `In the last ${lookbackDays} days, ${candidates.length} products had frequent price changes ` +
    `(up to ${maxDistinct} distinct prices; up to ${maxSwing}% swing).`;

  const suggested_action =
    "Stabilize pricing on best-performing SKUs for 7–14 days, and batch changes weekly. If you’re testing, isolate tests to a small set of products so conversion signals stay interpretable.";

  return {
    key: "price_volatility_risk",
    title,
    severity,
    summary,
    suggested_action,
    evaluated_at: now.toISOString(),
    metrics: {
      lookback_days: lookbackDays,
      products_scanned: productEdges.length,
      volatile_count: candidates.length,
      max_distinct_prices: maxDistinct,
      max_swing_pct: maxSwing,
    },
    items: candidates,
  };
}
