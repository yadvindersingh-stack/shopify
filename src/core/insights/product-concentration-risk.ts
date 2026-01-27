// src/core/insights/product-concentration-risk.ts

export type Severity = "high" | "medium" | "low";

type Edge<T> = { node: T };
type Money = { amount?: string | number };
type LineItemNode = {
  quantity?: number;
  product?: { id?: string | null };
  originalTotalSet?: { shopMoney?: Money };
};

type OrderNode = {
  createdAt?: string;
  cancelledAt?: string | null;
  lineItems?: { edges?: Array<Edge<LineItemNode>> };
};

type ProductNode = {
  id?: string;
  title?: string;
};

function toNumber(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function pct(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10; // 1 decimal, e.g. 82.3
}

export function evaluateProductConcentrationRisk(args: {
  data: any;
  now: Date;
  windowDays?: number; // default 14
}):
  | {
      key: "product_concentration";
      title: string;
      severity: Severity;
      summary: string;
      suggested_action: string;
      evaluated_at: string;
      metrics: Record<string, any>;
      items: Array<{
        product_id: string;
        title: string;
        revenue: number;
        units: number;
        revenue_pct: number;
        units_pct: number;
      }>;
    }
  | null {
  const { data, now } = args;
  const windowDays = args.windowDays ?? 14;

  const cutoffMs = now.getTime() - windowDays * 24 * 60 * 60 * 1000;

  const orderEdges: Array<Edge<OrderNode>> = data?.orders?.edges ?? [];
  const productEdges: Array<Edge<ProductNode>> = data?.products?.edges ?? [];

  const productTitleById = new Map<string, string>();
  for (const e of productEdges) {
    const p = e?.node;
    const id = p?.id ? String(p.id) : "";
    if (!id) continue;
    productTitleById.set(id, String(p?.title ?? "Untitled product"));
  }

  const revenueByProduct = new Map<string, number>();
  const unitsByProduct = new Map<string, number>();

  let totalRevenue = 0;
  let totalUnits = 0;

  for (const e of orderEdges) {
    const o = e?.node;
    if (!o) continue;
    if (o.cancelledAt) continue;

    const createdMs = o.createdAt ? new Date(o.createdAt).getTime() : NaN;
    if (!Number.isFinite(createdMs) || createdMs < cutoffMs) continue;

    const liEdges = o.lineItems?.edges ?? [];
    for (const liE of liEdges) {
      const li = liE?.node;
      const pid = li?.product?.id ? String(li.product.id) : "";
      if (!pid) continue;

      const qty = toNumber(li?.quantity);
      if (qty <= 0) continue;

      const amt = toNumber(li?.originalTotalSet?.shopMoney?.amount);

      unitsByProduct.set(pid, (unitsByProduct.get(pid) ?? 0) + qty);
      revenueByProduct.set(pid, (revenueByProduct.get(pid) ?? 0) + amt);

      totalUnits += qty;
      totalRevenue += amt;
    }
  }

  // If there’s no meaningful volume, don’t show this insight.
  if (totalUnits < 3 && totalRevenue < 50) return null;

  const rows = Array.from(
    new Set([...unitsByProduct.keys(), ...revenueByProduct.keys()])
  ).map((pid) => {
    const units = unitsByProduct.get(pid) ?? 0;
    const revenue = revenueByProduct.get(pid) ?? 0;
    return {
      product_id: pid,
      title: productTitleById.get(pid) ?? "Unknown product",
      units,
      revenue,
    };
  });

  rows.sort((a, b) => b.revenue - a.revenue);

  const top1 = rows.slice(0, 1);
  const top3 = rows.slice(0, 3);

  const top1Revenue = top1.reduce((s, r) => s + r.revenue, 0);
  const top3Revenue = top3.reduce((s, r) => s + r.revenue, 0);
  const top1Units = top1.reduce((s, r) => s + r.units, 0);
  const top3Units = top3.reduce((s, r) => s + r.units, 0);

  const revenueTop1Pct = pct(top1Revenue, totalRevenue);
  const revenueTop3Pct = pct(top3Revenue, totalRevenue);
  const unitsTop1Pct = pct(top1Units, totalUnits);
  const unitsTop3Pct = pct(top3Units, totalUnits);

  // Thresholds (tunable)
  const HIGH = 60;
  const MED = 80;

  let severity: Severity | null = null;

  if (revenueTop1Pct >= HIGH || unitsTop1Pct >= HIGH) {
    severity = "high";
  } else if (revenueTop3Pct >= MED || unitsTop3Pct >= MED) {
    severity = "medium";
  } else if (revenueTop3Pct >= 70 || unitsTop3Pct >= 70) {
    severity = "low";
  } else {
    return null;
  }

  const title =
    severity === "high"
      ? "Revenue is overly dependent on one product"
      : "Revenue is concentrated in a few products";

  const summary =
    `In the last ${windowDays} days, the top product accounts for ${revenueTop1Pct}% of revenue ` +
    `and ${unitsTop1Pct}% of units. Top 3 account for ${revenueTop3Pct}% of revenue and ${unitsTop3Pct}% of units.`;

  const suggested_action =
    severity === "high"
      ? "Reduce dependency risk: promote 1–2 secondary products (bundles, homepage placement), and ensure inventory/fulfillment for the top product is protected."
      : "Consider diversifying: test promotion for secondary products and check if the catalog/collections are overly pushing only a few items.";

  const items = rows
    .slice(0, 10)
    .map((r) => ({
      ...r,
      revenue: Math.round(r.revenue * 100) / 100,
      revenue_pct: pct(r.revenue, totalRevenue),
      units_pct: pct(r.units, totalUnits),
    }));

  return {
    key: "product_concentration",
    title,
    severity,
    summary,
    suggested_action,
    evaluated_at: now.toISOString(),
    metrics: {
      window_days: windowDays,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      total_units: totalUnits,
      revenue_top1_pct: revenueTop1Pct,
      revenue_top3_pct: revenueTop3Pct,
      units_top1_pct: unitsTop1Pct,
      units_top3_pct: unitsTop3Pct,
      products_considered: rows.length,
    },
    items,
  };
}
