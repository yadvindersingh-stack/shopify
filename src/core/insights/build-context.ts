import type { InsightContext } from "./context";

export function buildInsightContext(
  shopId: string,
  now: Date,
  data: any
): InsightContext {
  const shopTimezone = data?.shop?.ianaTimezone || "UTC";

  const orders = (data?.orders?.edges || []).map((e: any) => ({
    id: e.node.id,
    created_at: e.node.createdAt,
    cancelled_at: e.node.cancelledAt,
    total_price: Number(e.node.totalPriceSet?.shopMoney?.amount || 0),
  }));

  // Historical revenue per product from line items
  const revenueByProduct: Record<string, number> = {};

  for (const e of data?.orders?.edges || []) {
    for (const li of e.node.lineItems?.edges || []) {
      const productId = li.node.product?.id;
      if (!productId) continue;
      const amount = Number(li.node.originalTotalSet?.shopMoney?.amount || 0);
      revenueByProduct[productId] = (revenueByProduct[productId] || 0) + amount;
    }
  }

  const products = (data?.products?.edges || []).map((e: any) => ({
    id: e.node.id,
    title: e.node.title,
    price: Number(e.node.priceRangeV2?.minVariantPrice?.amount || 0),
    inventory_quantity: Number(e.node.totalInventory || 0),
    historical_revenue: revenueByProduct[e.node.id] || 0,
  }));

  return {
    shopId,
    shopTimezone,
    now,
    orders,
    products,
  };
}
