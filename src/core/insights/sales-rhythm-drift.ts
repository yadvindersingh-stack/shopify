import { Insight } from "./types";
import { InsightContext } from "./context";
import { detectSalesRhythmDriftDTD } from "./detectors/sales-rhythm-drift";

import { InventoryPressureIndicator } from "./indicators/inventory-pressure";
import { PriceIntegrityIndicator } from "./indicators/price-integrity";
import { FulfillmentFrictionIndicator } from "./indicators/fulfillment-friction";

export async function evaluateSalesRhythmDrift(
  ctx: InsightContext
): Promise<Insight | null> {
  const drift = detectSalesRhythmDriftDTD(ctx);

  if (!drift.detected) return null;

  const indicators = await Promise.all([
    InventoryPressureIndicator.evaluate(ctx),
    PriceIntegrityIndicator.evaluate(ctx),
    FulfillmentFrictionIndicator.evaluate(ctx),
  ]);

  const baselineRange = `${Math.round(drift.baseline_p25)}–${Math.round(drift.baseline_p75)}`;

  return {
    key: "sales_rhythm_drift",
    title: "Orders are unusually low today",
    severity: drift.severity ?? "medium",
    summary: `By now, you have ${drift.orders_today_so_far} orders. You usually have around ${Math.round(
      drift.baseline_median
    )} (${baselineRange}) by this time on ${new Date(ctx.now).toLocaleDateString("en-US", { weekday: "long" })}.`,

    indicators,

    metrics: {
      orders_today_so_far: drift.orders_today_so_far,
      baseline_median: drift.baseline_median,
      baseline_p25: drift.baseline_p25,
      baseline_p75: drift.baseline_p75,
      expected_low: drift.expected_low,
      compared_window: drift.compared_window_label,
      timezone: drift.timezone,
    },

    evaluated_at: drift.evaluated_at_store,
  };
}
