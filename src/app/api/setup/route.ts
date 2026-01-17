import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resolveShop } from '@/lib/shopify';
import { ensureOrderWebhooks } from '@/lib/shopify-webhooks';

export async function POST(req: NextRequest) {
  const shop = await resolveShop(req);
  const { email, daily_enabled, weekly_enabled } = await req.json();
  const { error } = await supabase.from('digest_settings').upsert({
    shop_id: shop.id,
    email,
    daily_enabled,
    weekly_enabled,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest) {
  const shop = await resolveShop(req);
  const { data, error } = await supabase
    .from('digest_settings')
    .select('email, daily_enabled, weekly_enabled')
  .eq('shop_id', shop.id)
  .single();

const appUrl = process.env.SHOPIFY_APP_URL!;
const accessToken = shop.access_token;
const shopDomain = shop.shop_domain;

if (appUrl && accessToken && shopDomain) {
  try {
    await ensureOrderWebhooks({ shop: shopDomain, accessToken, appUrl });
    console.log('Webhooks ensured for shop', { shopDomain, appUrl });

  } catch (e) {
    console.log('webhook registration failed', e);
  }
}

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || {});
}
