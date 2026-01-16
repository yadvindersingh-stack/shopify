type RegisterArgs = {
  shop: string;
  accessToken: string;
  appUrl: string; // https://merchpulse.vercel.app
  apiVersion?: string; // 2024-10 etc
};

async function shopifyRest(
  shop: string,
  accessToken: string,
  apiVersion: string,
  path: string,
  method: "GET" | "POST",
  body?: any
) {
  const url = `https://${shop}/admin/api/${apiVersion}/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    throw new Error(`Shopify REST ${method} ${path} HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  return json;
}

// Idempotent-ish: list existing, create missing
export async function ensureOrderWebhooks(args: RegisterArgs) {
  const apiVersion = args.apiVersion || process.env.SHOPIFY_API_VERSION || "2024-10";
  const shop = args.shop.toLowerCase();
  const address = `${args.appUrl.replace(/\/+$/, "")}/api/webhooks/shopify`;

  const existing = await shopifyRest(shop, args.accessToken, apiVersion, "webhooks.json", "GET");
  const hooks: any[] = existing?.webhooks || [];

  const wantTopics = ["orders/create", "orders/cancelled"];

  const missing = wantTopics.filter((t) => {
    return !hooks.some((h) => h?.topic === t && h?.address === address);
  });

  for (const topic of missing) {
    await shopifyRest(shop, args.accessToken, apiVersion, "webhooks.json", "POST", {
      webhook: {
        topic,
        address,
        format: "json",
      },
    });
  }

  return { address, created: missing };
}
