import type { Metadata } from "next";
import "./globals.css";
import "@shopify/polaris/build/esm/styles.css";

export const metadata: Metadata = {
  title: "MerchPulse",
  description: "Embedded Shopify analytics app for operational insights and daily action lists.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY;

  return (
    <html lang="en">
      <head>
        {apiKey ? <meta name="shopify-api-key" content={apiKey} /> : null}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
