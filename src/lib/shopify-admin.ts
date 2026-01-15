export async function shopifyGraphql(args: {
  shop: string;
  accessToken: string;
  query: string;
  variables?: Record<string, any>;
}) {
  const { shop, accessToken, query, variables } = args;

  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  const shopDomain = shop
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  const url = `https://${shopDomain}/admin/api/${version}/graphql.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // leave as null
  }

  if (!res.ok) {
    throw new Error(`Shopify GraphQL HTTP ${res.status}: ${text?.slice(0, 300)}`);
  }

if (json?.errors?.length) {
  // include a short snippet of the full response for debugging
  const responseSnippet = text.slice(0, 800);
  console.error(
    "Shopify GraphQL errors:",
    JSON.stringify(json.errors),
    "| response:",
    responseSnippet
  );
  throw new Error(
    `Shopify GraphQL errors: ${JSON.stringify(json.errors)} | response: ${responseSnippet}`
  );
}

  // Some errors can be inside data + userErrors, but your current exception is top-level errors.
  return json?.data;
}
