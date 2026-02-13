import crypto from "crypto";

export async function verifyShopifyWebhook(req: Request) {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error("Missing SHOPIFY_API_SECRET");

  const hmac = req.headers.get("x-shopify-hmac-sha256") || "";
  const raw = await req.text(); // IMPORTANT: raw body

  const digest = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("base64");

  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(hmac, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid webhook HMAC");
  }

  return { raw, json: raw ? JSON.parse(raw) : null };
}
