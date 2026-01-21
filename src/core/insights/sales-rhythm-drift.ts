export type IndicatorResult = {
  key: string;
  label: string;
  status: "likely" | "possible" | "unlikely" | "unknown";
  confidence: "high" | "medium" | "low";
  evidence: string;
};

export type SalesRhythmDriftResult = {
  key: "sales_rhythm_drift";
  title: string;
  severity: "low" | "medium" | "high";
  summary: string;
  indicators: IndicatorResult[];
  metrics: {
    timezone: string;
    compared_window: string;
    now_local_iso: string;

    orders_today_so_far: number;
    baseline_median: number;
    baseline_p25: number;
    baseline_p75: number;

    expected_low: number;
    expected_high: number;

    baseline_days_count: number;
    guard_minutes: number;
  };
  evaluated_at: string;
};

export type InsightContext = {
  shopTimezone: string; // IANA
  now: Date;

  orders: {
    id: string;
    created_at: string; // ISO
    total_price: number;
    cancelled_at?: string | null;
  }[];

  products: {
    id: string;
    title: string;
    price: number;
    inventory_quantity: number;
  }[];

  analytics?: {
    sessions_today_so_far?: number | null;
    sessions_baseline_median?: number | null;
  };
};

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1] ?? sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}

function toLocalParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = dtf.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    weekday: get("weekday"), // Mon/Tue...
    hh: Number(get("hour")),
    mm: Number(get("minute")),
    ss: Number(get("second")),
  };
}

function minutesSinceMidnight(date: Date, timeZone: string) {
  const p = toLocalParts(date, timeZone);
  return p.hh * 60 + p.mm;
}

function localDateKey(iso: string, timeZone: string) {
  const p = toLocalParts(new Date(iso), timeZone);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

function isSameLocalDay(iso: string, now: Date, timeZone: string) {
  return localDateKey(iso, timeZone) === localDateKey(now.toISOString(), timeZone);
}

function sameLocalWeekday(iso: string, timeZone: string, weekday: string) {
  const p = toLocalParts(new Date(iso), timeZone);
  return p.weekday === weekday;
}

export async function evaluateSalesRhythmDrift(ctx: InsightContext): Promise<SalesRhythmDriftResult | null> {
  const tz = ctx.shopTimezone || "UTC";
  const now = ctx.now ?? new Date();

  // ✅ 6-hour guard in SHOP TIMEZONE
  const guardMinutes = 6 * 60; // 360
  const nowLocalMin = minutesSinceMidnight(now, tz);
  if (nowLocalMin < guardMinutes) return null;

  const nowWeekday = toLocalParts(now, tz).weekday;

  // Orders today so far (ignore cancelled)
  const ordersToday = ctx.orders.filter(
    (o) =>
      !o.cancelled_at &&
      isSameLocalDay(o.created_at, now, tz) &&
      minutesSinceMidnight(new Date(o.created_at), tz) <= nowLocalMin
  );
  const ordersTodayCount = ordersToday.length;

  // Baseline: same weekday in provided window, count orders up to same time-of-day, per local day
  const baselineDays = new Map<string, number>(); // dateKey -> count

  for (const o of ctx.orders) {
    if (o.cancelled_at) continue;
    if (!sameLocalWeekday(o.created_at, tz, nowWeekday)) continue;

    const m = minutesSinceMidnight(new Date(o.created_at), tz);
    if (m > nowLocalMin) continue;

    const dk = localDateKey(o.created_at, tz);
    baselineDays.set(dk, (baselineDays.get(dk) ?? 0) + 1);
  }

  // Keep last 8 occurrences (≈ 8 weeks)
  // Baseline candidates: per local day counts up to same time-of-day
const perDayCountsAll = new Map<string, number>();      // any weekday
const perDayCountsSameWk = new Map<string, number>();   // same weekday only

for (const o of ctx.orders) {
  if (o.cancelled_at) continue;

  const m = minutesSinceMidnight(new Date(o.created_at), tz);
  if (m > nowLocalMin) continue;

  const dk = localDateKey(o.created_at, tz);
  perDayCountsAll.set(dk, (perDayCountsAll.get(dk) ?? 0) + 1);

  if (sameLocalWeekday(o.created_at, tz, nowWeekday)) {
    perDayCountsSameWk.set(dk, (perDayCountsSameWk.get(dk) ?? 0) + 1);
  }
}

// helper to get last N day counts
function lastNCounts(map: Map<string, number>, n: number) {
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, n)
    .map(([, v]) => v);
}

const sameWk = lastNCounts(perDayCountsSameWk, 8);   // ~8 occurrences
const anyDay14 = lastNCounts(perDayCountsAll, 14);   // last 14 days

let baselineCounts: number[] = [];
let comparedWindow = "";

// Tier selection (prod-grade)
if (sameWk.length >= 3) {
  baselineCounts = sameWk;
  comparedWindow = `Same weekday, last ${sameWk.length} occurrences, up to current time-of-day`;
} else if (anyDay14.length >= 3) {
  baselineCounts = anyDay14;
  comparedWindow = `Any weekday, last ${anyDay14.length} days, up to current time-of-day (fallback)`;
} else if (anyDay14.length >= 2) {
  baselineCounts = anyDay14;
  comparedWindow = `Any weekday, last ${anyDay14.length} days, up to current time-of-day (minimum fallback)`;
} else {
  return null; // truly insufficient
}



  const sorted = [...baselineCounts].sort((a, b) => a - b);
  if (sorted.length < 3) return null;

  const p25 = Math.round(quantile(sorted, 0.25));
  const p50 = Math.round(quantile(sorted, 0.5));
  const p75 = Math.round(quantile(sorted, 0.75));

  const expectedLow = p25;
  const expectedHigh = p75;

  // Severity rules (your chosen Option A)
  let severity: "low" | "medium" | "high" = "low";
  const highThreshold = Math.max(1, Math.floor(p25 / 2));

  if (ordersTodayCount < expectedLow) severity = "medium";
  if ((ordersTodayCount === 0 && p50 >= 3) || ordersTodayCount < highThreshold) severity = "high";

  if (severity === "low") return null;

  // Indicators (v1)
  const indicators: IndicatorResult[] = [];

  const sessionsToday = ctx.analytics?.sessions_today_so_far ?? null;
  const sessionsBaseline = ctx.analytics?.sessions_baseline_median ?? null;

  if (sessionsToday != null && sessionsBaseline != null && sessionsBaseline > 0) {
    const ratio = sessionsToday / sessionsBaseline;
    let status: IndicatorResult["status"] = "unlikely";
    let confidence: IndicatorResult["confidence"] = "medium";
    if (ratio < 0.7) status = "likely";
    else if (ratio < 0.9) status = "possible";

    indicators.push({
      key: "traffic_drop",
      label: "Traffic today is lower than normal",
      status,
      confidence,
      evidence: `Sessions so far: ${sessionsToday} vs baseline median ${sessionsBaseline} for this time.`,
    });
  } else {
    indicators.push({
      key: "traffic_drop",
      label: "Traffic today is lower than normal",
      status: "unknown",
      confidence: "low",
      evidence: "Traffic baseline not available yet (analytics baseline not computed in v1).",
    });
  }

  const lowStock = ctx.products.filter((p) => (p.inventory_quantity ?? 0) <= 3).slice(0, 5);
  indicators.push({
    key: "stock_pressure",
    label: "Inventory pressure on best sellers",
    status: lowStock.length >= 2 ? "possible" : "unlikely",
    confidence: lowStock.length >= 2 ? "medium" : "low",
    evidence: lowStock.length
      ? `Low stock (≤3): ${lowStock.map((p) => p.title).slice(0, 3).join(", ")}`
      : "No obvious low-stock signal from current inventory.",
  });

  indicators.push({
    key: "price_integrity",
    label: "Recent price changes",
    status: "unknown",
    confidence: "low",
    evidence: "Price-change evaluation not enabled yet (no price history in v1).",
  });

  //const comparedWindow = `Same weekday, last ${sorted.length} occurrences, up to current time-of-day`;

  const summary =
    `Orders so far today (${ordersTodayCount}) are below your normal range for this time ` +
    `(${expectedLow}–${expectedHigh}, median ${p50}).`;

  return {
    key: "sales_rhythm_drift",
    title: severity === "high" ? "Orders are unusually low today" : "Orders are trending lower than normal",
    severity,
    summary,
    indicators,
    metrics: {
      timezone: tz,
      compared_window: comparedWindow,
      now_local_iso: now.toISOString(),
      orders_today_so_far: ordersTodayCount,
      baseline_median: p50,
      baseline_p25: p25,
      baseline_p75: p75,
      expected_low: expectedLow,
      expected_high: expectedHigh,
      baseline_days_count: sorted.length,
      guard_minutes: guardMinutes,
    },
    evaluated_at: new Date().toISOString(),
  };
}
