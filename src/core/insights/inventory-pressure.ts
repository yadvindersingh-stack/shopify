export type IndicatorResult = {
  key: string;
  label: string;
  status: "likely" | "possible" | "unlikely" | "unknown";
  confidence: "high" | "medium" | "low";
  evidence: string;
};

export type InventoryPressureResult = {
  key: "inventory_pressure";
  title: string;
  severity: "low" | "medium" | "high";
  summary: string;
  indicators: IndicatorResult[];
  metrics: {
    timezone: string;
    window_days: number;
    evaluated_at: string;

    mode: "velocity" | "low_inventory_only";
    top_products_considered: number;

    flagged_count: number;
    flagged: Array<{
      product_id: string;
      title: string;
      inventory: number;
      units_sold_window?: number;
      daily_rate?: number;
      days_of_supply?: number;
    }>;
  };
  evaluated_at: string;
};

export type InventoryContext = {
  shopTimezone: string;
  now: Date;

  // minimal product fields
  products: {
    id: string;
    title: string;
    inventory_quantity: number; // totalInventory
    price: number;
  }[];

  // orders include line items for velocity (optional)
  orders: {
    created_at: string;
    cancelled_at?: string | null;
    line_items?: { product_id: string; quantity: number }[];
  }[];
};

const WINDOW_DAYS = 14;

// Thresholds (tune later, keep simple now)
const HIGH_DAYS_SUPPLY = 3;
const MED_DAYS_SUPPLY = 7;

const HIGH_INV_ONLY = 5;
const MED_INV_ONLY = 15;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function evaluateInventoryPressure(
  ctx: InventoryContext
): Promise<InventoryPressureResult | null> {
  const tz = ctx.shopTimezone || "UTC";
  const now = ctx.now ?? new Date();

  const byId = new Map(ctx.products.map((p) => [p.id, p]));
  const hasLineItems =
    ctx.orders?.some((o) => Array.isArray(o.line_items) && o.line_items.length > 0) ?? false;

  // Build velocity map over last WINDOW_DAYS (ignore cancelled)
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const unitsByProduct = new Map<string, number>();

  if (hasLineItems) {
    for (const o of ctx.orders) {
      if (o.cancelled_at) continue;
      const created = new Date(o.created_at);
      if (created < cutoff) continue;
      if (!o.line_items?.length) continue;

      for (const li of o.line_items) {
        if (!li.product_id) continue;
        unitsByProduct.set(li.product_id, (unitsByProduct.get(li.product_id) ?? 0) + (li.quantity ?? 0));
      }
    }
  }

  const mode: "velocity" | "low_inventory_only" =
    hasLineItems && unitsByProduct.size > 0 ? "velocity" : "low_inventory_only";

  let flagged: InventoryPressureResult["metrics"]["flagged"] = [];
  let severity: "low" | "medium" | "high" = "low";

  if (mode === "velocity") {
    // pick top 10 products by units sold in window
    const top = Array.from(unitsByProduct.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    for (const [productId, unitsSold] of top) {
      const p = byId.get(productId);
      if (!p) continue;

      const dailyRate = unitsSold / WINDOW_DAYS; // units/day
      const inv = p.inventory_quantity ?? 0;
      const daysSupply = dailyRate > 0 ? inv / dailyRate : Infinity;

      // flag thresholds
      if (daysSupply < HIGH_DAYS_SUPPLY) {
        severity = "high";
        flagged.push({
          product_id: productId,
          title: p.title,
          inventory: inv,
          units_sold_window: unitsSold,
          daily_rate: round2(dailyRate),
          days_of_supply: round2(daysSupply),
        });
      } else if (daysSupply < MED_DAYS_SUPPLY) {
        if (severity !== "high") severity = "medium";
        flagged.push({
          product_id: productId,
          title: p.title,
          inventory: inv,
          units_sold_window: unitsSold,
          daily_rate: round2(dailyRate),
          days_of_supply: round2(daysSupply),
        });
      }
    }

    if (flagged.length === 0) return null;

    // Sort worst first
    flagged = flagged.sort((a, b) => (a.days_of_supply ?? 9999) - (b.days_of_supply ?? 9999));
   } else {
    // Low-inventory-only fallback (no velocity).
    // Production stance: ANY stockout is worth alerting.

    const all = [...ctx.products].map(p => ({
      id: p.id,
      title: p.title,
      inv: Number(p.inventory_quantity ?? 0),
    }));

    // Ignore products that don't track inventory? (optional)
    // If you want to ignore "infinite" inventory products, you'd need a flag from Shopify.
    // For now we treat missing inventory as 0, which is conservative.

    const zeros = all.filter(p => p.inv === 0);
    const veryLow = all.filter(p => p.inv > 0 && p.inv <= 2);
    const low10 = all.filter(p => p.inv > 2 && p.inv <= 10);

    // HIGH if any stockout
    if (zeros.length > 0) {
      severity = "high";
      flagged = zeros
        .sort((a, b) => a.inv - b.inv)
        .slice(0, 10)
        .map(p => ({ product_id: p.id, title: p.title, inventory: p.inv }));
    }
    // MEDIUM if any very-low
    else if (veryLow.length > 0) {
      severity = "medium";
      flagged = veryLow
        .sort((a, b) => a.inv - b.inv)
        .slice(0, 10)
        .map(p => ({ product_id: p.id, title: p.title, inventory: p.inv }));
    }
    // MEDIUM if many low-ish items
    else if (low10.length >= 3) {
      severity = "medium";
      flagged = low10
        .sort((a, b) => a.inv - b.inv)
        .slice(0, 10)
        .map(p => ({ product_id: p.id, title: p.title, inventory: p.inv }));
    } else {
      return null;
    }

    flagged = flagged.sort((a, b) => (a.inventory ?? 9999) - (b.inventory ?? 9999));
  }


  const top3 = flagged.slice(0, 3);

  const title =
    severity === "high"
      ? "Stockouts likely soon on top products"
      : "Inventory is getting tight on key products";

  const summary =
    mode === "velocity"
      ? `Based on the last ${WINDOW_DAYS} days, some best sellers are projected to stock out in under ${severity === "high" ? HIGH_DAYS_SUPPLY : MED_DAYS_SUPPLY} days.`
      : `Multiple products are at low inventory levels (≤${severity === "high" ? HIGH_INV_ONLY : MED_INV_ONLY}).`;

  const indicators: IndicatorResult[] =
    mode === "velocity"
      ? [
          {
            key: "days_of_supply",
            label: "Days of supply (velocity-based)",
            status: severity === "high" ? "likely" : "possible",
            confidence: "high",
            evidence: `Worst offenders: ${top3
              .map((p) => `${p.title} (~${p.days_of_supply} days)`)
              .join(", ")}.`,
          },
        ]
      : [
          {
            key: "low_inventory",
            label: "Low inventory on multiple products",
            status: severity === "high" ? "likely" : "possible",
            confidence: "medium",
            evidence: `Lowest inventory: ${top3.map((p) => `${p.title} (${p.inventory})`).join(", ")}.`,
          },
        ];

  return {
    key: "inventory_pressure",
    title,
    severity,
    summary,
    indicators,
    metrics: {
      timezone: tz,
      window_days: WINDOW_DAYS,
      evaluated_at: new Date().toISOString(),
      mode,
      top_products_considered: mode === "velocity" ? Math.min(10, unitsByProduct.size) : Math.min(25, ctx.products.length),
      flagged_count: flagged.length,
      flagged,
    },
    evaluated_at: new Date().toISOString(),
  };
}
