import type { InsightContext } from "./context";

export function buildInsightContext(shopId: string, now: Date, data: any): InsightContext {
  const shopTimezone = data?.shop?.ianaTimezone || "UTC";

  // Orders (minimal shape used by sales rhythm drift)
  const orderEdges = Array.isArray(data?.orders?.edges) ? data.orders.edges : [];
  const orders = orderEdges.map((e: any) => ({
    id: e?.node?.id,
    created_at: e?.node?.createdAt,
    cancelled_at: e?.node?.cancelledAt ?? null,
    total_price: Number(e?.node?.totalPriceSet?.shopMoney?.amount || 0),
  }));

  // Revenue per product from line items (used by velocity)
  const revenueByProduct: Record<string, number> = {};
  for (const e of orderEdges) {
    const o = e?.node;
    if (!o || o.cancelledAt) continue;
    const liEdges = Array.isArray(o?.lineItems?.edges) ? o.lineItems.edges : [];
    for (const liE of liEdges) {
      const li = liE?.node;
      const productId = li?.product?.id;
      if (!productId) continue;
      const amount = Number(li?.originalTotalSet?.shopMoney?.amount || 0);
      revenueByProduct[productId] = (revenueByProduct[productId] || 0) + amount;
    }
  }

  // Products from products.edges
  const productEdges = Array.isArray(data?.products?.edges) ? data.products.edges : [];
  const products = productEdges
    .map((e: any) => e?.node)
    .filter(Boolean)
    .map((p: any) => {
      const inv = Number(p?.totalInventory ?? 0);
      const price = Number(p?.priceRangeV2?.minVariantPrice?.amount ?? 0);
      const id = String(p?.id || "");
      const title = String(p?.title || "Untitled product");

      return {
        id,
        title,
        price: Number.isFinite(price) ? price : 0,
        inventory_quantity: Number.isFinite(inv) ? inv : 0,
        historical_revenue: Number.isFinite(revenueByProduct[id] || 0) ? revenueByProduct[id] || 0 : 0,
      };
    });

  return {
    shopId,
    shopTimezone,
    now,
    orders,
    products,
  };
}
