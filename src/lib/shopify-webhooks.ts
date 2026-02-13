type RegisterArgs = {
  shop: string; // storepulse-2.myshopify.com
  accessToken: string;
};

const APP_URL = process.env.SHOPIFY_APP_URL;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";

if (!APP_URL) throw new Error("Missing SHOPIFY_APP_URL");

async function createWebhook(args: RegisterArgs & { topic: string; path: string }) {
  const { shop, accessToken, topic, path } = args;

  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/webhooks.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({
      webhook: {
        topic,
        address: `${APP_URL}${path}`,
        format: "json",
      },
    }),
  });

  // If it already exists Shopify may return 422 depending on state; we tolerate non-200 only if it’s "already taken"
  const text = await res.text();
  if (!res.ok) {
    // tolerate duplicates / address already taken scenarios safely
    if (res.status === 422 && text.includes("has already been taken")) return;
    throw new Error(`Webhook create failed ${res.status}: ${text.slice(0, 300)}`);
  }
}

export async function registerMandatoryWebhooks(args: RegisterArgs) {
  await createWebhook({ ...args, topic: "app/uninstalled", path: "/api/webhooks/app-uninstalled" });
  await createWebhook({ ...args, topic: "customers/data_request", path: "/api/webhooks/customers-data-request" });
  await createWebhook({ ...args, topic: "customers/redact", path: "/api/webhooks/customers-redact" });
  await createWebhook({ ...args, topic: "shop/redact", path: "/api/webhooks/shop-redact" });
}
