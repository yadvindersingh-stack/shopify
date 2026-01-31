type DigestInsight = {
  title: string;
  description: string | null;
  suggested_action: string | null;
  data_snapshot?: Record<string, any> | null;
};

function firstLine(s?: string | null) {
  if (!s) return "";
  const trimmed = s.trim().replace(/\s+/g, " ");
  // keep it short
  return trimmed.length > 140 ? trimmed.slice(0, 137) + "…" : trimmed;
}

export function renderDailyEmail(args: {
  shopDomain: string;
  insights: DigestInsight[];
}) {
  const { shopDomain, insights } = args;

  const lines: string[] = [];
  lines.push(`MerchPulse — Daily scan for ${shopDomain}`);
  lines.push("");

  lines.push(`Today we found ${insights.length} issue${insights.length === 1 ? "" : "s"} worth fixing:`);
  lines.push("");

  insights.forEach((i, idx) => {
    lines.push(`${idx + 1}) ${firstLine(i.title)}`);

    const what = firstLine(i.description);
    if (what) lines.push(`What we saw: ${what}`);

    const action = firstLine(i.suggested_action);
    if (action) lines.push(`Do this now: ${action}`);

    lines.push(""); // spacer
  });

  lines.push(`Open MerchPulse →`);
  return lines.join("\n");
}
