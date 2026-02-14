// src/lib/shopify/register-privacy-webhooks.ts

/**
 * Shopify privacy/compliance webhooks should be configured in shopify.toml (CLI)
 * and in the Partner Dashboard, not created via REST from your callback.
 *
 * If you try to create topics like customers/data_request via REST in some API versions,
 * Shopify can return 404. So we intentionally no-op here.
 */
export async function registerPrivacyWebhooks(_args: { shopDomain: string }) {
  return { ok: true, skipped: true };
}
