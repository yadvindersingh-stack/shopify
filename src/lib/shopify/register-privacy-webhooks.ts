export async function registerPrivacyWebhooks(_args: { shopDomain: string }) {
  /**
   * IMPORTANT:
   * Shopify’s mandatory privacy/compliance webhooks (customers/data_request, customers/redact, shop/redact)
   * should NOT be “registered like normal topics” via REST in many setups — this often causes:
   *   "could not find the webhook topic customers/data_request"
   *
   * What we do instead:
   *  1) Implement webhook endpoints in our app (/api/webhooks/...)
   *  2) Verify webhook HMAC signatures on receipt
   *  3) Configure these mandatory webhooks in the Shopify App / Dev Dashboard
   *
   * Keeping this function as a no-op prevents import errors and keeps the auth flow clean.
   */
  return;
}
