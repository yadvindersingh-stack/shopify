import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { exchangeCodeForToken, signSessionCookie } from '@/lib/shopify';

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get('shop');
  const code = req.nextUrl.searchParams.get('code');
  if (!shop || !code) {
    return NextResponse.redirect(new URL('/app/error', process.env.SHOPIFY_APP_URL).toString());
  }
  const access_token = await exchangeCodeForToken(shop, code);
  await supabase.from('shops').upsert({ shop_domain: shop, access_token });
  const res = NextResponse.redirect(new URL('/app/setup', process.env.SHOPIFY_APP_URL).toString());
  res.headers.append('Set-Cookie', await signSessionCookie(shop));
  return res;
}
