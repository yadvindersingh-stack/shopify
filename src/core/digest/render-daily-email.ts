type InsightRow = {
  title: string;
  description: string | null;
  suggested_action: string | null;
};

export function renderDailyEmail(insights: InsightRow[]) {
  const lines: string[] = [];

  lines.push(`Here’s what changed in your store today:\n`);

  insights.forEach((i, idx) => {
    lines.push(`${idx + 1}) ${i.title}`);
    if (i.description) lines.push(i.description);
    if (i.suggested_action) lines.push(`→ ${i.suggested_action}`);
    lines.push(""); // spacer
  });

  lines.push(`View details in MerchPulse →`);

  return lines.join("\n");
}
