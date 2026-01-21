import type { InventoryPressureResult } from "@/core/insights/inventory-pressure";

export function normalizeInventoryPressureToInsight(input: InventoryPressureResult) {
  const primary = input.indicators?.[0];

  const suggested_action =
    input.metrics.mode === "velocity"
      ? `Restock the flagged SKUs now. Consider pausing ads/promos for the lowest-supply items and enabling back-in-stock notifications.`
      : `Restock or reorder the lowest-inventory items first. Consider enabling back-in-stock notifications for those products.`;

  return {
    type: "inventory_pressure",
    title: input.title,
    description: input.summary,
    severity: input.severity,
    suggested_action: primary?.evidence ? `${primary.evidence} ${suggested_action}` : suggested_action,
    data_snapshot: {
      metrics: input.metrics,
      indicators: input.indicators,
      evaluated_at: input.evaluated_at,
    },
  };
}
