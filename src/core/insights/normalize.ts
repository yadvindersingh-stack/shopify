import type { SalesRhythmDriftResult } from "@/core/insights/sales-rhythm-drift";

export function normalizeSalesRhythmToInsight(input: SalesRhythmDriftResult) {
  const primary =
    input.indicators?.find((i) => i.status === "likely") ||
    input.indicators?.find((i) => i.status === "possible") ||
    input.indicators?.[0];

  const suggested_action =
    primary?.evidence ??
    "Check traffic, inventory, and any recent pricing changes for your best sellers.";

  return {
    type: "sales_rhythm_drift",
    title: input.title,
    description: input.summary,
    severity: input.severity,
    suggested_action,
    data_snapshot: {
      metrics: input.metrics,
      indicators: input.indicators,
      evaluated_at: input.evaluated_at,
    },
  };
}
