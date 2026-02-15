export default function Head() {
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY;

  return (
    <>
      {apiKey ? <meta name="shopify-api-key" content={apiKey} /> : null}
      <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
    </>
  );
}
