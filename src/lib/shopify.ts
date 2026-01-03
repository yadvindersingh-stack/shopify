import '@shopify/shopify-api/adapters/node';
import { SignJWT, jwtVerify } from 'jose';
import { shopifyApi, ApiVersion } from '@shopify/shopify-api';
import { supabase } from './supabase';

const SESSION_COOKIE = 'shop_session';
const SESSION_TTL = '30d';
const DEFAULT_API_VERSION = (process.env.SHOPIFY_API_VERSION as ApiVersion | undefined) ?? ApiVersion.July24;

const SHOPIFY_API_KEY = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_APP_URL = process.env.SHOPIFY_APP_URL;

if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET || !SHOPIFY_APP_URL) {
  throw new Error('Missing required Shopify env: NEXT_PUBLIC_SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL');
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is required');
  return new TextEncoder().encode(secret);
}

export const shopify = shopifyApi({
  apiKey: SHOPIFY_API_KEY,
  apiSecretKey: SHOPIFY_API_SECRET,
  scopes: (process.env.SHOPIFY_SCOPES || '').split(',').map(s => s.trim()).filter(Boolean),
  hostName: new URL(SHOPIFY_APP_URL).host,
  apiVersion: DEFAULT_API_VERSION,
  isEmbeddedApp: true,
});

export async function signSessionCookie(shop: string) {
  const token = await new SignJWT({ shop })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(SESSION_TTL)
    .sign(getSessionSecret());
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=None; Max-Age=${60 * 60 * 24 * 30}; Secure`;
}

export async function readSessionFromCookie(cookieHeader?: string): Promise<string | null> {
  if (!cookieHeader) return null;
  const cookies = Object.fromEntries(cookieHeader.split(';').map(c => c.trim().split('=')));
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    return typeof payload.shop === 'string' ? payload.shop : null;
  } catch {
    return null;
  }
}

export async function decodeShopFromBearer(authHeader?: string): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SHOPIFY_API_SECRET));
    const dest = typeof payload.dest === 'string' ? payload.dest : undefined;
    const iss = typeof payload.iss === 'string' ? payload.iss : undefined;
    const url = dest || iss;
    if (!url) return null;
    const host = new URL(url).host;
    return host;
  } catch {
    return null;
  }
}

export async function getShopRecord(shop_domain: string) {
  const { data, error } = await supabase
    .from('shops')
    .select('id, shop_domain, access_token')
    .eq('shop_domain', shop_domain)
    .single();
  if (error || !data) return null;
  return data;
}

export async function resolveShop(req: Request) {
  const authHeader = req.headers.get('authorization');
  const bearerShop = await decodeShopFromBearer(authHeader || undefined);
  let shop = bearerShop;
  if (!shop) {
    const cookieHeader = req.headers.get('cookie') || undefined;
    shop = await readSessionFromCookie(cookieHeader);
  }
  if (!shop) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const record = await getShopRecord(shop);
  if (!record) {
    throw new Response(JSON.stringify({ error: 'Shop not found' }), { status: 401 });
  }
  return record;
}

export async function exchangeCodeForToken(shop: string, code: string) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code,
    }),
  });
  const json = await res.json();
  if (!json.access_token) {
    throw new Error('Failed to exchange code for token');
  }
  return json.access_token as string;
}
