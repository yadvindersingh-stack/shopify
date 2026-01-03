import { NextRequest, NextResponse } from 'next/server';
import { decodeShopFromBearer, readSessionFromCookie } from './lib/shopify';

const AUTH_ROUTES = ['/api/auth/start', '/api/auth/callback'];
const PUBLIC_APP_ROUTES = ['/app/error'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (AUTH_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }
  if (!pathname.startsWith('/app') && !pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  if (PUBLIC_APP_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  const authHeader = req.headers.get('authorization') || undefined;
  const bearerShop = await decodeShopFromBearer(authHeader);
  const cookieHeader = req.headers.get('cookie') || undefined;
  const cookieShop = await readSessionFromCookie(cookieHeader);
  const shop = bearerShop || cookieShop;

  if (!shop) {
    const shopParam = req.nextUrl.searchParams.get('shop');
    if (shopParam) {
      const url = req.nextUrl.clone();
      url.pathname = '/api/auth/start';
      url.searchParams.set('shop', shopParam);
      return NextResponse.redirect(url);
    }
    const errUrl = req.nextUrl.clone();
    errUrl.pathname = '/app/error';
    errUrl.search = '';
    return NextResponse.redirect(errUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*', '/api/:path*'],
};
