import crypto from "crypto";

async function shopifyRest(args: {
  shop: string;
  accessToken: string;
  method: "POST" | "GET" | "DELETE";
  path: string; // e.g. /admin/api/2024-10/webhooks.json
  body?: any;
}) {
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  const url = `https://${args.shop}/admin/api/${version}${args.path}`;

  const res = await fetch(url, {
    method: args.method,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": args.accessToken,
    },
    body: args.body ? JSON.stringify(args.body) : undefined,
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok) {
    throw new Error(`Shopify REST ${res.status}: ${text?.slice(0, 400)}`);
  }
  return json;
}

export async function registerPrivacyWebhooks(args: { shop: string; accessToken: string }) {
  const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  if (!appUrl) throw new Error("Missing SHOPIFY_APP_URL");

  const address = `${appUrl}/api/webhooks/privacy`;

  // These are the standard required topics for privacy law compliance
  const topics = ["customers/data_request", "customers/redact", "shop/redact"];

  for (const topic of topics) {
    // Idempotent create: Shopify will error if duplicate; we swallow duplicates.
    try {
      await shopifyRest({
        shop: args.shop,
        accessToken: args.accessToken,
        method: "POST",
        path: "/webhooks.json",
        body: {
          webhook: {
            topic,
            address,
            format: "json",
          },
        },
      });
    } catch (e: any) {
      const msg = e?.message || String(e);
      // Most common: already exists
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("taken")) {
        continue;
      }
      // Sometimes Shopify returns "address has already been taken"
      if (msg.toLowerCase().includes("address") && msg.toLowerCase().includes("taken")) {
        continue;
      }
      throw e;
    }
  }

  return { ok: true, address, topics };
}
