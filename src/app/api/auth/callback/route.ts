import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { exchangeCodeForToken, signSessionCookie } from '@/lib/shopify';

function buildHost(shop: string, existingHost?: string | null) {
  if (existingHost) return existingHost;
  const encoded = Buffer.from(`${shop}/admin`).toString('base64');
  return encoded;
}

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get('shop');
  const code = req.nextUrl.searchParams.get('code');
  const hostParam = req.nextUrl.searchParams.get('host');
  if (!shop || !code) {
    return NextResponse.redirect(new URL('/app/error', process.env.SHOPIFY_APP_URL).toString());
  }
  const access_token = await exchangeCodeForToken(shop, code);
  await supabase.from('shops').upsert({ shop_domain: shop, access_token });
  const host = buildHost(shop, hostParam);
  const target = new URL(`/app/setup?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`, process.env.SHOPIFY_APP_URL).toString();
  const res = NextResponse.redirect(target);
  res.headers.append('Set-Cookie', await signSessionCookie(shop));
  return res;
}
