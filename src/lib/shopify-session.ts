import crypto from "crypto";

type SessionTokenPayload = {
  iss?: string;
  dest?: string;   // e.g. https://storepulse-2.myshopify.com
  aud?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  sub?: string;
  sid?: string;
};

function base64urlToBuffer(input: string) {
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

function safeJson<T>(buf: Buffer): T {
  return JSON.parse(buf.toString("utf8"));
}

export function shopFromDest(dest?: string) {
  if (!dest) return null;
  try {
    const url = new URL(dest);
    return url.host.toLowerCase();
  } catch {
    return null;
  }
}

export function verifyShopifySessionToken(token: string, apiSecret: string): SessionTokenPayload | null {
  try {
    const [headerB64, payloadB64, sigB64] = token.split(".");
    if (!headerB64 || !payloadB64 || !sigB64) return null;

    const header = safeJson<{ alg?: string }>(base64urlToBuffer(headerB64));
    if (header.alg !== "HS256") return null;

    const data = `${headerB64}.${payloadB64}`;
    const expected = crypto.createHmac("sha256", apiSecret).update(data).digest();
    const actual = base64urlToBuffer(sigB64);

    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

    const payload = safeJson<SessionTokenPayload>(base64urlToBuffer(payloadB64));

    const now = Math.floor(Date.now() / 1000);
    if (payload.nbf && now < payload.nbf) return null;
    if (payload.exp && now > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

export function getShopFromRequestAuthHeader(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer (.+)$/i);
  if (!m) return null;

  const token = m[1];
  const secret = process.env.SHOPIFY_API_SECRET || "";
  if (!secret) return null;

  const payload = verifyShopifySessionToken(token, secret);
  const shop = shopFromDest(payload?.dest);
  return shop;
}
