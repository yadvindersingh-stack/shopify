export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 16px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Privacy Policy</h1>

      <p style={{ color: "#444", lineHeight: 1.6 }}>
        MerchPulse provides operational insights for Shopify merchants by analyzing store data through Shopify APIs.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 24 }}>1. Data we access</h2>
      <p style={{ color: "#444", lineHeight: 1.6 }}>
        When installed, MerchPulse may access order data, product and inventory data, and store metadata (such as timezone) as permitted by the app’s approved Shopify access scopes.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 24 }}>2. How we use data</h2>
      <p style={{ color: "#444", lineHeight: 1.6 }}>
        We use store data only to generate insights, detect operational risks, and produce scheduled scan summaries and email digests when enabled by the merchant.
        We do not sell merchant data or share it with third parties for marketing.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 24 }}>3. Data storage</h2>
      <p style={{ color: "#444", lineHeight: 1.6 }}>
        MerchPulse stores only the data needed to operate the app, including configuration settings and scan results. Access tokens are stored securely and used only to communicate with Shopify APIs.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 24 }}>4. Data retention</h2>
      <p style={{ color: "#444", lineHeight: 1.6 }}>
        Data is retained only while the app remains installed. When the app is uninstalled, associated store data is deleted.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 24 }}>5. Shopify privacy compliance</h2>
      <p style={{ color: "#444", lineHeight: 1.6 }}>
        MerchPulse supports Shopify’s required privacy and compliance webhooks, including customers/data_request, customers/redact, shop/redact, and app/uninstalled,
        and responds to deletion/redaction requests as required.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 24 }}>6. Contact</h2>
      <p style={{ color: "#444", lineHeight: 1.6 }}>
        For privacy inquiries: <a href="mailto:support@ustaavenio.resend.app">support@ustaavenio.resend.app</a>
      </p>
    </main>
  );
}
