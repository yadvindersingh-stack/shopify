// src/lib/shopify-admin.ts
export class ShopifyAuthError extends Error {
  status: number;
  code: "reauth_required" | "access_denied" | "unknown";
  constructor(status: number, code: ShopifyAuthError["code"], message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function looksLikeInvalidToken(text: string) {
  const t = (text || "").toLowerCase();
  return (
    t.includes("invalid api key or access token") ||
    t.includes("unrecognized login") ||
    t.includes("wrong password") ||
    t.includes("access denied") ||
    t.includes("not approved to access") ||
    t.includes("unauthorized")
  );
}

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
    // keep null
  }

  // --- HTTP-level auth failure (token expired / invalid)
  if (res.status === 401 || res.status === 403) {
    const msg = `Shopify GraphQL HTTP ${res.status}: ${text?.slice(0, 500)}`;
    // Most 401/403 here means token is invalid/expired OR access denied by Shopify.
    throw new ShopifyAuthError(res.status, "reauth_required", msg);
  }

  if (!res.ok) {
    throw new Error(`Shopify GraphQL HTTP ${res.status}: ${text?.slice(0, 500)}`);
  }

  // --- GraphQL-level errors (can include protected data / scope errors)
  if (json?.errors?.length) {
    const responseSnippet = text.slice(0, 800);
    const errText = JSON.stringify(json.errors);

    // If Shopify is telling us access denied / not approved / etc → treat as auth-ish
    if (looksLikeInvalidToken(errText) || looksLikeInvalidToken(responseSnippet)) {
      throw new ShopifyAuthError(403, "access_denied", `Shopify GraphQL errors: ${errText}`);
    }

    console.error("Shopify GraphQL errors:", errText, "| response:", responseSnippet);
    throw new Error(`Shopify GraphQL errors: ${errText} | response: ${responseSnippet}`);
  }

  return json?.data;
}
