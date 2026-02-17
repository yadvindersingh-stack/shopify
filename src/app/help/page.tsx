export const dynamic = "force-dynamic";

export default function HelpPage() {
  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 16px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Help & Support</h1>
      <p style={{ color: "#444", lineHeight: 1.6 }}>
        MerchPulse helps you monitor store health by scanning orders, inventory, and pricing signals to surface operational risks.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 24 }}>How does MerchPulse work?</h2>
      <p style={{ color: "#444", lineHeight: 1.6 }}>
        The app reads store data using approved Shopify API scopes and generates insights inside Shopify Admin. It does not change storefront behavior.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 24 }}>How often does the app scan my store?</h2>
      <p style={{ color: "#444", lineHeight: 1.6 }}>
        Scans run automatically on a schedule. You can also trigger a manual scan from inside the app.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 24 }}>What happens if I uninstall?</h2>
      <p style={{ color: "#444", lineHeight: 1.6 }}>
        When the app is uninstalled, related store data is deleted in accordance with Shopify requirements.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 24 }}>Support</h2>
      <p style={{ color: "#444", lineHeight: 1.6 }}>
        Email: <a href="mailto:support@merchpulse.app">support@merchpulse.app</a>
      </p>
    </main>
  );
}
