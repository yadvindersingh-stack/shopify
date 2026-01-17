import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resolveShop } from '@/lib/shopify';

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
    
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || {});
}
