// Privacy/compliance webhooks are configured in shopify.app.toml (Shopify-managed).
// Do NOT attempt to create these topics via REST from your app.
// This module exists only to avoid broken imports while you refactor.

export async function registerPrivacyWebhooks(_args: {
  shop: string;
  accessToken: string;
}) {
  return { ok: true, skipped: true };
}
