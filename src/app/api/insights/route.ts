import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resolveShop } from '@/lib/shopify';

export async function GET(req: NextRequest) {
  const shop = await resolveShop(req);
  const { data: insights } = await supabase.from('insights').select('*').eq('shop_id', shop.id).order('created_at', { ascending: false });
  return NextResponse.json(insights || []);
}
