import crypto from "crypto";

export function verifyShopifyWebhookHmac(args: {
  rawBody: Buffer;
  hmacHeader: string | null;
}) {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error("Missing SHOPIFY_API_SECRET");
  if (!args.hmacHeader) throw new Error("Missing X-Shopify-Hmac-Sha256");

  const digest = crypto.createHmac("sha256", secret).update(args.rawBody).digest("base64");

  // timing safe compare
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(args.hmacHeader, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid webhook HMAC");
  }
}
