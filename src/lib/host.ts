export const SHOPIFY_HOST_STORAGE_KEY = "shopifyHost";
export const SHOPIFY_SHOP_STORAGE_KEY = "shopifyShop";

export function isSafeShopifyHost(host?: string | null) {
  return Boolean(host && /^[A-Za-z0-9+/=_-]+$/.test(host) && host.length > 10);
}

export function buildPathWithHost(path: string, host?: string, shop?: string) {
  const params = new URLSearchParams();

  if (host) params.set("host", host);
  if (shop) params.set("shop", shop);

  if (!params.toString()) return path;

  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${params.toString()}`;
}

export function persistEmbeddedAppContext(args: { host?: string | null; shop?: string | null }) {
  if (typeof window === "undefined") return;

  try {
    if (isSafeShopifyHost(args.host)) {
      window.localStorage.setItem(SHOPIFY_HOST_STORAGE_KEY, args.host as string);
    }

    if (args.shop && args.shop.endsWith(".myshopify.com")) {
      window.localStorage.setItem(SHOPIFY_SHOP_STORAGE_KEY, args.shop.toLowerCase());
    }
  } catch {
    // Ignore storage issues and let the app continue with URL state.
  }
}

export function readPersistedHost(): string {
  if (typeof window === "undefined") return "";
  try {
    const stored = window.localStorage.getItem(SHOPIFY_HOST_STORAGE_KEY) || "";
    return isSafeShopifyHost(stored) ? stored : "";
  } catch {
    return "";
  }
}

export function readPersistedShop(): string {
  if (typeof window === "undefined") return "";
  try {
    const stored = (window.localStorage.getItem(SHOPIFY_SHOP_STORAGE_KEY) || "").toLowerCase();
    return stored.endsWith(".myshopify.com") ? stored : "";
  } catch {
    return "";
  }
}

export function clearPersistedHost() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SHOPIFY_HOST_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function getHostFromLocation(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const host = params.get("host");
  if (isSafeShopifyHost(host) && host) return host;
  return readPersistedHost();
}

export function getShopFromLocation(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const shop = (params.get("shop") || "").toLowerCase();
  if (shop.endsWith(".myshopify.com")) return shop;
  return readPersistedShop();
}
