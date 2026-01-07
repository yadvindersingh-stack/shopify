export async function shopifyRest<T = any>({
  shop,
  accessToken,
  path,
}: {
  shop: string;
  accessToken: string;
  path: string; // e.g. "/admin/api/2025-01/shop.json"
}): Promise<T> {
  const url = `https://${shop}${path}`;

  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(`Shopify REST ${res.status}: ${JSON.stringify(json)}`);
  }

  return json as T;
}
