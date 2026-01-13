export async function shopifyGraphql<T = any>({
  shop,
  accessToken,
  query,
  variables,
}: {
  shop: string; // storepulse-2.myshopify.com
  accessToken: string;
  query: string;
  variables?: Record<string, any>;
}): Promise<T> {
  const url = `https://${shop}/admin/api/2026-01/graphql.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(`Shopify GraphQL HTTP ${res.status}: ${JSON.stringify(json)}`);
  }

  if (json.errors?.length) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data as T;
}
