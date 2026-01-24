type InsightRow = {
  type: string;
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  suggested_action: string;
  data_snapshot: Record<string, any>;
};

export function evaluateInventoryVelocityRisk(ctx: any): InsightRow | null {
  const now = new Date(ctx.now ?? Date.now());
  const products = ctx.products ?? [];
  const orders = ctx.orders ?? [];

  // Build a map: productId -> { units, ordersCount, firstSeenAt }
  const stats = new Map<
    string,
    { units: number; ordersCount: number; firstSeenAt: number }
  >();

  for (const o of orders) {
    if (!o?.created_at) continue;
    if (o.cancelled_at) continue;

    const createdAt = new Date(o.created_at).getTime();
    const seenProductIds = new Set<string>();

    for (const li of o.line_items ?? []) {
      const pid = li?.product_id;
      const qty = Number(li?.quantity ?? 0);
      if (!pid || !Number.isFinite(qty) || qty <= 0) continue;

      const cur = stats.get(pid) ?? { units: 0, ordersCount: 0, firstSeenAt: createdAt };
      cur.units += qty;
      cur.firstSeenAt = Math.min(cur.firstSeenAt, createdAt);
      stats.set(pid, cur);

      seenProductIds.add(pid);
    }

    for (const pid of seenProductIds) {
      const cur = stats.get(pid);
      if (cur) cur.ordersCount += 1;
    }
  }

  // Score risky products
  const risky: any[] = [];

  for (const p of products) {
    const pid = p.id;
    const inv = Number(p.inventory_quantity ?? 0); // your build-context should map totalInventory -> inventory_quantity
    const s = stats.get(pid);

    const ordersCount = s?.ordersCount ?? 0;
    const units = s?.units ?? 0;

    // only consider products that actually sell (otherwise noise)
    if (ordersCount <= 0) continue;

    // days covered for velocity
    const firstSeenAt = s?.firstSeenAt ?? now.getTime();
    const daysCovered = Math.max(
      1,
      Math.min(30, Math.floor((now.getTime() - firstSeenAt) / (24 * 3600 * 1000)) + 1)
    );

    const velocity = units / daysCovered; // units/day
    const daysOfCover = velocity > 0 ? inv / velocity : Infinity;

    let severity: "high" | "medium" | null = null;

    if (inv === 0) severity = "high";
    else if (daysOfCover <= 3) severity = "high";
    else if (daysOfCover <= 7) severity = "medium";

    if (!severity) continue;

    risky.push({
      id: pid,
      title: p.title,
      inventory: inv,
      orders_30d: ordersCount,
      units_30d: units,
      velocity_units_per_day: Number(velocity.toFixed(2)),
      days_of_cover: Number(daysOfCover.toFixed(1)),
      severity,
    });
  }

  if (risky.length === 0) return null;

  // Rank: high first, then lowest days_of_cover
  risky.sort((a, b) => {
    const sa = a.severity === "high" ? 0 : 1;
    const sb = b.severity === "high" ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return a.days_of_cover - b.days_of_cover;
  });

  const top = risky.slice(0, 8);
  const highCount = risky.filter(r => r.severity === "high").length;
  const overallSeverity: "high" | "medium" = highCount > 0 ? "high" : "medium";

  const title =
    overallSeverity === "high"
      ? "Stockouts likely in the next few days"
      : "Inventory risk building on fast sellers";

  const description =
    `Based on the last 30 days of sales velocity, these items are likely to stock out soon: ` +
    top.map(t => `${t.title} (inv ${t.inventory}, ~${t.days_of_cover} days)`).join(", ") +
    ".";

  const suggested_action =
    "Restock the highest-velocity items first. If restock isn’t possible, pause ads and push substitutes in collections until inventory recovers.";

  return {
    type: "inventory_velocity_risk",
    title,
    description,
    severity: overallSeverity,
    suggested_action,
    data_snapshot: {
      window_days: 30,
      evaluated_at: new Date().toISOString(),
      items: top,
      totals: { risky_count: risky.length, high_count: highCount },
    },
  };
}
