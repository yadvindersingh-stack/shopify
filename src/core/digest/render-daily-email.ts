type DigestInsight = {
  title: string;
  description: string | null;
  suggested_action: string | null;
  data_snapshot?: Record<string, any> | null;
};

function clampLine(s?: string | null, max = 160) {
  if (!s) return "";
  const trimmed = s.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? trimmed.slice(0, max - 1) + "…" : trimmed;
}

function titleCaseDate(d = new Date()) {
  // e.g., "09 Feb 2026"
  const day = String(d.getDate()).padStart(2, "0");
  const mon = d.toLocaleString("en-US", { month: "short" });
  const yr = d.getFullYear();
  return `${day} ${mon} ${yr}`;
}

function divider() {
  return "────────────────────────────────────────";
}

function safeArr(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

function extractEvidence(snapshot?: Record<string, any> | null) {
  // Your insight cards use "evidence" as a key sometimes; also allow "metrics"
  const ev = snapshot?.evidence;
  const metrics = snapshot?.metrics;

  // Evidence could be:
  // - array of {label,value} or {key,label,status,...}
  // - object of key->value
  // - empty
  if (Array.isArray(ev)) return ev.slice(0, 6);
  if (ev && typeof ev === "object") {
    return Object.entries(ev).slice(0, 6).map(([k, v]) => ({ label: k, value: v }));
  }
  if (metrics && typeof metrics === "object") {
    return Object.entries(metrics).slice(0, 6).map(([k, v]) => ({ label: k, value: v }));
  }
  return [];
}

function extractItemsPreview(snapshot?: Record<string, any> | null) {
  // Common shapes we’ve used:
  // snapshot.items_preview: string[]
  // snapshot.items: [{title, inv, ...}]
  // snapshot.items: string[]
  const itemsPreview = safeArr(snapshot?.items_preview).slice(0, 6);
  if (itemsPreview.length) return itemsPreview.map(String);

  const items = safeArr(snapshot?.items).slice(0, 6);
  if (!items.length) return [];

  if (typeof items[0] === "string") return items.map(String);

  // objects -> try title/name/id
  return items
    .map((x) => x?.title || x?.name || x?.handle || x?.id)
    .filter(Boolean)
    .map(String);
}

function formatValue(v: any) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function renderDailyEmail(args: {
  shopDomain: string;
  insights: DigestInsight[];
  appUrl?: string; // optional: pass SHOPIFY_APP_URL so we can show a link
}) {
  const { shopDomain, insights, appUrl } = args;

  const lines: string[] = [];

  // Header
  lines.push(`MerchPulse — Daily scan`);
  lines.push(`${shopDomain} • ${titleCaseDate()}`);
  lines.push(divider());
  lines.push("");

  // Summary
  if (!insights.length) {
    lines.push("✅ No issues found today.");
    lines.push("");
    lines.push("If you want extra confidence, open the app and run a manual scan.");
    lines.push("");
    if (appUrl) lines.push(`Open MerchPulse: ${appUrl}`);
    return lines.join("\n");
  }

  lines.push(
    `Issues found: ${insights.length} (showing all)`
  );
  lines.push("Fix these first — they’re the highest leverage items for a solo merchant.");
  lines.push("");
  lines.push(divider());

  // Body
  insights.forEach((i, idx) => {
    const title = clampLine(i.title, 120) || `Insight #${idx + 1}`;
    const what = clampLine(i.description, 220);
    const action = clampLine(i.suggested_action, 220);

    const snapshot = i.data_snapshot || {};
    const evidence = extractEvidence(snapshot);
    const items = extractItemsPreview(snapshot);

    lines.push("");
    lines.push(`${idx + 1}. ${title}`);
    lines.push("");

    if (what) {
      lines.push(`What we saw:`);
      lines.push(`- ${what}`);
      lines.push("");
    }

    if (action) {
      lines.push(`Do this now:`);
      lines.push(`- ${action}`);
      lines.push("");
    }

    if (items.length) {
      lines.push(`Items (sample):`);
      items.forEach((t) => lines.push(`- ${clampLine(t, 90)}`));
      lines.push("");
    }

    if (evidence.length) {
      lines.push(`Evidence:`);
      evidence.forEach((e: any) => {
        const label = e?.label || e?.key || "";
        const value = e?.value ?? e?.status ?? "";
        const line = label ? `${label}: ${formatValue(value)}` : formatValue(e);
        if (line) lines.push(`- ${clampLine(line, 120)}`);
      });
      lines.push("");
    }

    // Keep it clean: no raw JSON dump in email.
    lines.push(divider());
  });

  lines.push("");
  if (appUrl) {
    lines.push(`Open MerchPulse: ${appUrl}`);
  } else {
    lines.push("Open MerchPulse in Shopify Admin to see full details.");
  }

  return lines.join("\n");
}
