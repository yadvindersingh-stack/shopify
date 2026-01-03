import { NextRequest, NextResponse } from 'next/server';

const SHOPIFY_API_KEY = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY;
const SHOPIFY_SCOPES = process.env.SHOPIFY_SCOPES || 'read_orders,read_products,read_customers,read_analytics,read_inventory';
const SHOPIFY_REDIRECT_URI = process.env.SHOPIFY_APP_URL + '/api/auth/callback';

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get('shop');
  if (!shop) {
    const url = new URL('/app/error', process.env.SHOPIFY_APP_URL);
    return NextResponse.redirect(url.toString());
  }
  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SHOPIFY_SCOPES}&redirect_uri=${encodeURIComponent(SHOPIFY_REDIRECT_URI)}&response_type=code`;
  return NextResponse.redirect(authUrl);
}
