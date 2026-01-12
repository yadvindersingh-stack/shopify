export function buildPathWithHost(path: string, host?: string) {
  if (!host) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}host=${encodeURIComponent(host)}`;
}


export function getHostFromLocation(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const host = params.get("host");
  if (host) return host;
  try {
    const stored = window.localStorage.getItem("shopifyHost") || "";
    return stored;
  } catch {
    return "";
  }
}
