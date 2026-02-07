import type { InsightContext } from "./context";

export function buildInsightContext(shopId: string, now: Date, data: any): InsightContext {
  const shopTimezone = data?.shop?.ianaTimezone || "UTC";

  const orders = (data?.orders?.edges || []).map((e: any) => ({
    id: e.node.id,
    created_at: e.node.createdAt,
    cancelled_at: e.node.cancelledAt,
    total_price: Number(e.node.totalPriceSet?.shopMoney?.amount || 0),
  }));

  // Revenue per product from line items (historical)
  const revenueByProduct: Record<string, number> = {};
  for (const e of data?.orders?.edges || []) {
    for (const li of e.node.lineItems?.edges || []) {
      const productId = li.node.product?.id;
      if (!productId) continue;
      const amount = Number(li.node.originalTotalSet?.shopMoney?.amount || 0);
      revenueByProduct[productId] = (revenueByProduct[productId] || 0) + amount;
    }
  }

  const productEdges = data?.products?.edges ?? [];
  const productNodes = Array.isArray(productEdges)
    ? productEdges.map((e: any) => e?.node).filter(Boolean)
    : [];

  const products = productNodes.map((p: any) => {
    const price = Number(p?.priceRangeV2?.minVariantPrice?.amount || 0);
    const inv = Number(p?.totalInventory ?? 0);
    const revenue = revenueByProduct[p?.id] || 0;

    return {
      id: p?.id,
      title: p?.title || "Untitled product",
      price: Number.isFinite(price) ? price : 0,
      inventory_quantity: Number.isFinite(inv) ? inv : 0,
      historical_revenue: Number.isFinite(revenue) ? revenue : 0,
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
