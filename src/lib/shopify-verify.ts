import crypto from "crypto";

const SHOPIFY_API_SECRET = (() => {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    throw new Error("Missing SHOPIFY_API_SECRET");
  }
  return secret;
})();

export function verifyCallbackHmac(url: URL): boolean {
  const hmac = url.searchParams.get("hmac");
  if (!hmac) return false;

  // Build message from query params excluding hmac + signature
  const params: [string, string][] = [];
  url.searchParams.forEach((value, key) => {
    if (key === "hmac" || key === "signature") return;
    params.push([key, value]);
  });

  params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const message = params.map(([k, v]) => `${k}=${v}`).join("&");
  const digest = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET)
    .update(message)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
}

export async function verifyWebhookHmac(req: Request): Promise<{
  ok: boolean;
  rawBody: string;
}> {
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  if (!hmacHeader) return { ok: false, rawBody: "" };

  const rawBody = await req.text();

  const digest = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET)
    .update(rawBody, "utf8")
    .digest("base64");

  const ok = crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  return { ok, rawBody };
}
