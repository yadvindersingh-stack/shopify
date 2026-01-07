import { DateTime } from "luxon";
import { InsightContext } from "../context";
import { median, percentile, iqr } from "../utils/stats";
import { toStoreTime, nowInStoreTz } from "../utils/time";

export type SalesRhythmDriftResult = {
  detected: boolean;
  severity?: "high" | "medium";

  orders_today_so_far: number;

  baseline_values: number[];
  baseline_median: number;
  baseline_p25: number;
  baseline_p75: number;
  expected_low: number;

  compared_window_label: string;

  evaluated_at_store: string;
  timezone: string;
};

type Options = {
  lookbackDays: number;          // 56
  minBaselineDays: number;       // e.g. 4
  minMedianOrders: number;       // e.g. 6
  minDayProgressPct: number;     // e.g. 0.25
  dropRatioThreshold: number;    // e.g. 0.6 (40% drop)
  iqrMultiplier: number;         // e.g. 1.5
};

const DEFAULTS: Options = {
  lookbackDays: 56,
  minBaselineDays: 4,
  minMedianOrders: 6,
  minDayProgressPct: 0.25,
  dropRatioThreshold: 0.6,
  iqrMultiplier: 1.5,
};

function minuteOfDay(dt: DateTime): number {
  return dt.hour * 60 + dt.minute;
}

export function detectSalesRhythmDriftDTD(
  ctx: InsightContext,
  options: Partial<Options> = {}
): SalesRhythmDriftResult {
  const opt: Options = { ...DEFAULTS, ...options };
  const tz = ctx.shopTimezone || "UTC";
  const now = nowInStoreTz(ctx.now, tz);
  const evaluatedAtStore = now.toISO() ?? now.toJSDate().toISOString();

  const nowMinute = minuteOfDay(now);
  const dayProgress = nowMinute / 1440;

  // Time gate to avoid morning noise
  if (dayProgress < opt.minDayProgressPct) {
    return {
      detected: false,
      orders_today_so_far: 0,
      baseline_values: [],
      baseline_median: 0,
      baseline_p25: 0,
      baseline_p75: 0,
      expected_low: 0,
      compared_window_label: `Last ${opt.lookbackDays} days (same weekday)`,
      evaluated_at_store: evaluatedAtStore,
      timezone: tz,
    };
  }

  // Normalize orders into store tz
  const ordersLocal = ctx.orders.map((o) => ({
    ...o,
    local: toStoreTime(o.created_at, tz),
  }));

  const todayStr = now.toISODate(); // YYYY-MM-DD in store tz
  const weekday = now.weekday; // 1=Mon .. 7=Sun

  const ordersTodaySoFar = ordersLocal.filter((o) => {
    return o.local.toISODate() === todayStr && minuteOfDay(o.local) <= nowMinute;
  }).length;

  // Lookback window
  const start = now.minus({ days: opt.lookbackDays });

  // Collect baseline day candidates: same weekday within lookback window
  const byDate = new Map<string, { date: string; weekday: number; count: number; total: number }>();

  for (const o of ordersLocal) {
    if (o.local < start || o.local >= now) continue;

    const d = o.local.toISODate()!;
    const wd = o.local.weekday;

    // track totals for day + count up to nowMinute (for same-time-of-day comparison)
    let entry = byDate.get(d);
    if (!entry) {
      entry = { date: d, weekday: wd, count: 0, total: 0 };
      byDate.set(d, entry);
    }

    entry.total += 1;
    if (minuteOfDay(o.local) <= nowMinute) entry.count += 1;
  }

  // baseline: same weekday only
  const baselineCandidates = Array.from(byDate.values())
    .filter((d) => d.weekday === weekday)
    // filter low-signal days (very low overall volume days are noisy)
    .filter((d) => d.total >= 3)
    .map((d) => d.count);

  // Need enough baseline points
  if (baselineCandidates.length < opt.minBaselineDays) {
    return {
      detected: false,
      orders_today_so_far: ordersTodaySoFar,
      baseline_values: baselineCandidates,
      baseline_median: median(baselineCandidates),
      baseline_p25: percentile(baselineCandidates, 0.25),
      baseline_p75: percentile(baselineCandidates, 0.75),
      expected_low: 0,
      compared_window_label: `Last ${baselineCandidates.length} comparable days`,
      evaluated_at_store: evaluatedAtStore,
      timezone: tz,
    };
  }

  const m = median(baselineCandidates);
  const p25 = percentile(baselineCandidates, 0.25);
  const p75 = percentile(baselineCandidates, 0.75);
  const IQR = iqr(baselineCandidates);
  const expectedLow = m - opt.iqrMultiplier * IQR;

  // avoid tiny-store noise
  if (m < opt.minMedianOrders) {
    return {
      detected: false,
      orders_today_so_far: ordersTodaySoFar,
      baseline_values: baselineCandidates,
      baseline_median: m,
      baseline_p25: p25,
      baseline_p75: p75,
      expected_low: expectedLow,
      compared_window_label: `Last ${baselineCandidates.length} ${now.weekdayLong}s`,
      evaluated_at_store: evaluatedAtStore,
      timezone: tz,
    };
  }

  const relativeDrop = ordersTodaySoFar / (m || 1);

  const detected =
    ordersTodaySoFar < expectedLow &&
    relativeDrop <= opt.dropRatioThreshold;

  if (!detected) {
    return {
      detected: false,
      orders_today_so_far: ordersTodaySoFar,
      baseline_values: baselineCandidates,
      baseline_median: m,
      baseline_p25: p25,
      baseline_p75: p75,
      expected_low: expectedLow,
      compared_window_label: `Last ${baselineCandidates.length} ${now.weekdayLong}s`,
      evaluated_at_store: evaluatedAtStore,
      timezone: tz,
    };
  }

  const severity: "high" | "medium" =
    relativeDrop <= 0.4 ? "high" : "medium";

  return {
    detected: true,
    severity,
    orders_today_so_far: ordersTodaySoFar,
    baseline_values: baselineCandidates,
    baseline_median: m,
    baseline_p25: p25,
    baseline_p75: p75,
    expected_low: expectedLow,
    compared_window_label: `Last ${baselineCandidates.length} ${now.weekdayLong}s`,
    evaluated_at_store: evaluatedAtStore,
    timezone: tz,
  };
}
