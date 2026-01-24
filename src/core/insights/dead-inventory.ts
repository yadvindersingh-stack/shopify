// src/core/insights/dead-inventory.ts

type Severity = "high" | "medium" | "low";

export type DeadInventoryInsight = {
  type: "dead_inventory";
  title: string;
  description: string;
  severity: Severity;
  suggested_action: string;
  data_snapshot: Record<string, any>;
};

/**
 * Dead Inventory v1
 * - ACTIVE products with inventory >= threshold
 * - no sales in last WINDOW_DAYS (default 30)
 * - ignore products "too new" (optional; only if createdAt exists)
 *
 * NOTE: This is resilient to different ctx shapes.
 * It expects ctx.orders and ctx.products but tolerates alternate field names.
 */
export function evaluateDeadInventory(ctx: any, opts?: { windowDays?: number; minStock?: number }) {
  const WINDOW_DAYS = opts?.windowDays ?? 30;
  const MIN_STOCK = opts?.minStock ?? 10;

  const now = ctx?.now ? new Date(ctx.now) : new Date();
  const cutoffMs = now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const orders = Array.isArray(ctx?.orders) ? ctx.orders : [];
  const products = Array.isArray(ctx?.products) ? ctx.products : [];

  // Map productId -> most recent order timestamp (ms)
  const lastSaleMsByProduct = new Map<string, number>();

  for (const o of orders) {
    const cancelled = o?.cancelled_at ?? o?.cancelledAt ?? null;
    if (cancelled) continue;

    const createdRaw = o?.created_at ?? o?.createdAt ?? null;
    const createdMs = createdRaw ? new Date(createdRaw).getTime() : NaN;
    if (!Number.isFinite(createdMs)) continue;

    // line items can be normalized already, but handle a few shapes:
    // - o.line_items: [{ product_id, quantity }]
    // - o.lineItems: [{ productId, quantity }]
    // - o.lineItems.edges[].node.product.id
    const lineItems = normalizeLineItems(o);

    for (const li of lineItems) {
      const pid = li.productId;
      if (!pid) continue;
      const prev = lastSaleMsByProduct.get(pid);
      if (!prev || createdMs > prev) lastSaleMsByProduct.set(pid, createdMs);
    }
  }

  const dead: Array<{
    product_id: string;
    title: string;
    inventory: number;
    days_since_last_order: number | null;
  }> = [];

  for (const p of products) {
    const productId = String(p?.id ?? p?.product_id ?? "");
    if (!productId) continue;

    const title = String(p?.title ?? "Untitled product");

    // inventory might be mapped as inventory_quantity, totalInventory, total_inventory
    const invRaw =
      p?.inventory_quantity ??
      p?.totalInventory ??
      p?.total_inventory ??
      p?.inventory ??
      0;

    const inventory = Number(invRaw);
    if (!Number.isFinite(inventory)) continue;

    // Filter: only if enough stock
    if (inventory < MIN_STOCK) continue;

    // Filter: ignore gift cards if title hints (v1 heuristic)
    if (title.toLowerCase().includes("gift card")) continue;

    // Filter: ACTIVE only if status exists (otherwise assume eligible)
    const status = (p?.status ?? p?.product_status ?? "").toString().toUpperCase();
    if (status && status !== "ACTIVE") continue;

    // Optional: ignore "too new" products if createdAt exists


    const lastSaleMs = lastSaleMsByProduct.get(productId);
    const isDead = !lastSaleMs || lastSaleMs < cutoffMs;
    if (!isDead) continue;

    const daysSince =
      lastSaleMs ? Math.floor((now.getTime() - lastSaleMs) / (24 * 60 * 60 * 1000)) : null;

    dead.push({
      product_id: productId,
      title,
      inventory,
      days_since_last_order: daysSince,
    });
  }

  if (dead.length === 0) return null;

  // Most “dead” first: highest inventory, then oldest last sale
  dead.sort((a, b) => {
    if (b.inventory !== a.inventory) return b.inventory - a.inventory;
    const ad = a.days_since_last_order ?? 9999;
    const bd = b.days_since_last_order ?? 9999;
    return bd - ad;
  });

  const deadCount = dead.length;

  const severity: Severity =
    deadCount >= 5 ? "high" : deadCount >= 2 ? "medium" : "low";

  const top = dead.slice(0, 8);

  const title =
    severity === "high"
      ? "Cash tied up in dead inventory"
      : "Some products aren’t selling";

  const description =
    `You have ${deadCount} active products with stock (≥${MIN_STOCK}) and no sales in the last ${WINDOW_DAYS} days. ` +
    `Top examples: ` +
    top.map((x) => `${x.title} (inv ${x.inventory})`).join(", ") +
    ".";

  const suggested_action =
    "Discount or bundle these items, feature them less in collections, and consider archiving true non-performers to free up cash.";

  const insight: DeadInventoryInsight = {
    type: "dead_inventory",
    title,
    description,
    severity,
    suggested_action,
    data_snapshot: {
      window_days: WINDOW_DAYS,
      min_stock_threshold: MIN_STOCK,
      dead_count: deadCount,
      items: top,
      evaluated_at: now.toISOString(),
    },
  };

  return insight;
}

function normalizeLineItems(order: any): Array<{ productId: string; quantity: number }> {
  const out: Array<{ productId: string; quantity: number }> = [];

  // Shape A: already normalized
  if (Array.isArray(order?.line_items)) {
    for (const li of order.line_items) {
      const pid = li?.product_id ?? li?.productId ?? li?.product?.id;
      const qty = Number(li?.quantity ?? 0);
      if (pid) out.push({ productId: String(pid), quantity: Number.isFinite(qty) ? qty : 0 });
    }
    return out;
  }

  // Shape B: camelCase array
  if (Array.isArray(order?.lineItems)) {
    for (const li of order.lineItems) {
      const pid = li?.productId ?? li?.product?.id ?? li?.product_id;
      const qty = Number(li?.quantity ?? 0);
      if (pid) out.push({ productId: String(pid), quantity: Number.isFinite(qty) ? qty : 0 });
    }
    return out;
  }

  // Shape C: GraphQL edges
  const edges = order?.lineItems?.edges;
  if (Array.isArray(edges)) {
    for (const e of edges) {
      const n = e?.node;
      const pid = n?.product?.id ?? null;
      const qty = Number(n?.quantity ?? 0);
      if (pid) out.push({ productId: String(pid), quantity: Number.isFinite(qty) ? qty : 0 });
    }
  }

  return out;
}
