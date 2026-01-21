import fetch from "node-fetch";

const SHOP = "storepulse-2.myshopify.com";
const TOKEN = "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"; // from your shops table
const VERSION = "2024-10";

const endpoint = `https://${SHOP}/admin/api/${VERSION}/orders.json`;

async function createOrder(processedAt: string) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      order: {
        line_items: [
          {
            title: "Test Product",
            price: "29.99",
            quantity: 1,
          },
        ],
        financial_status: "paid",
        processed_at: processedAt,
      },
    }),
  });

  const json = await res.json();
  console.log(json.order?.id, processedAt);
}

(async () => {
  const base = new Date("2026-01-06T09:00:00-05:00");

  for (let d = 0; d < 10; d++) {
    for (let i = 0; i < 5; i++) {
      const t = new Date(base);
      t.setDate(base.getDate() + d);
      t.setMinutes(5 + i * 10);
      await createOrder(t.toISOString());
    }
  }
})();
