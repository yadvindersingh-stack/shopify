import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resolveShop } from '@/lib/shopify';
import { sendTestEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const shop = await resolveShop(req);
  const { data: settings } = await supabase.from('digest_settings').select('email').eq('shop_id', shop.id).single();
  if (!settings) return NextResponse.json({ error: 'No email set' }, { status: 400 });
  await sendTestEmail(settings.email);
  return NextResponse.json({ success: true });
}
