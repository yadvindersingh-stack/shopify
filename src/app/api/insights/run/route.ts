import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resolveShop } from '@/lib/shopify';
import { sendInsightsEmail } from '@/lib/email';

// --- MVP insight logic ---
async function fetchShopifyData(shop: { id: string; shop_domain: string; access_token: string }) {
  // TODO: Replace with real Shopify API calls
  // Simulate data for insights
  return {
    orders: [
      { date: '2025-12-25', count: 30 },
      { date: '2026-01-01', count: 20 },
    ],
    refunds: [
      { sku: 'SKU123', count: 10, prev: 2 },
    ],
    topProduct: { title: 'Demo Product', sales: 100, inventory: 0 },
  };
}

async function generateInsights(shop: { id: string; shop_domain: string; access_token: string }) {
  const data = await fetchShopifyData(shop);
  const insights = [];

  // 1. Orders down >20% vs previous 7 days
  const last7 = data.orders[1].count;
  const prev7 = data.orders[0].count;
  if (prev7 > 0 && last7 < prev7 * 0.8) {
    insights.push({
      shop_id: shop.id,
      type: 'orders_down',
      title: 'Orders down >20% vs previous 7 days',
      description: `Orders dropped from ${prev7} to ${last7}.`,
      severity: 'medium',
      suggested_action: 'Review marketing and traffic sources.',
      data_snapshot: { last7, prev7 },
    });
  }

  // 2. Refund spike by SKU
  for (const r of data.refunds) {
    if (r.count > r.prev + 5) {
      insights.push({
        shop_id: shop.id,
        type: 'refund_spike',
        title: 'Refund spike by SKU',
        description: `Refunds for SKU ${r.sku} spiked to ${r.count} (was ${r.prev}).`,
        severity: 'high',
        suggested_action: 'Investigate refund reasons for this SKU.',
        data_snapshot: r,
      });
    }
  }

  // 3. High-sales product low inventory
  if (data.topProduct.sales > 50 && data.topProduct.inventory === 0) {
    insights.push({
      shop_id: shop.id,
      type: 'low_inventory',
      title: 'High-sales product low inventory',
      description: `Top-selling product (${data.topProduct.title}) is out of stock!`,
      severity: 'high',
      suggested_action: 'Restock this product ASAP.',
      data_snapshot: data.topProduct,
    });
  }

  // Store insights
  for (const i of insights) {
    await supabase.from('insights').insert(i);
  }
  return insights;
}

export async function POST(req: NextRequest) {
  const shop = await resolveShop(req);
  const insights = await generateInsights(shop);
  // Send email
  const { data: settings } = await supabase.from('digest_settings').select('email').eq('shop_id', shop.id).single();
  if (settings && settings.email) {
    await sendInsightsEmail(settings.email, insights);
  }
  return NextResponse.json({ success: true, insights });
}
