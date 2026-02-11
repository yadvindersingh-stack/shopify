// src/core/insights/sales-rhythm-drift.ts

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
  suggested_action: string;
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

  // optional items list (for UI preview)
  items?: Array<{ title: string; inv?: number; revenue?: number }>;
  evidence?: Record<string, any>;
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
    // optional (enriched by build-context)
    historical_revenue?: number;
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
    weekday: get("weekday"),
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

function safeNumber(n: any) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function formatLocalIso(now: Date, tz: string) {
  const p = toLocalParts(now, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}T${String(
    p.hh
  ).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}:${String(p.ss).padStart(2, "0")}`;
}

export async function evaluateSalesRhythmDrift(
  ctx: InsightContext
): Promise<SalesRhythmDriftResult | null> {
  const tz = ctx.shopTimezone || "UTC";
  const now = ctx.now ?? new Date();

  // Guard: don’t alert before local 06:00
  const guardMinutes = 6 * 60;
  const nowLocalMin = minutesSinceMidnight(now, tz);
  if (nowLocalMin < guardMinutes) return null;

  const nowWeekday = toLocalParts(now, tz).weekday;

  // Orders today so far (ignore cancelled)
  const ordersToday = (ctx.orders || []).filter(
    (o) =>
      !o.cancelled_at &&
      isSameLocalDay(o.created_at, now, tz) &&
      minutesSinceMidnight(new Date(o.created_at), tz) <= nowLocalMin
  );
  const ordersTodayCount = ordersToday.length;

  // Build two baselines:
  // - same weekday last N occurrences
  // - last 14 days any weekday (fallback)
  const perDayCountsAll = new Map<string, number>();
  const perDayCountsSameWk = new Map<string, number>();

  for (const o of ctx.orders || []) {
    if (o.cancelled_at) continue;
    const m = minutesSinceMidnight(new Date(o.created_at), tz);
    if (m > nowLocalMin) continue;

    const dk = localDateKey(o.created_at, tz);
    perDayCountsAll.set(dk, (perDayCountsAll.get(dk) ?? 0) + 1);

    if (sameLocalWeekday(o.created_at, tz, nowWeekday)) {
      perDayCountsSameWk.set(dk, (perDayCountsSameWk.get(dk) ?? 0) + 1);
    }
  }

  function lastNCounts(map: Map<string, number>, n: number) {
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, n)
      .map(([, v]) => v);
  }

  const sameWk = lastNCounts(perDayCountsSameWk, 8);
  const anyDay14 = lastNCounts(perDayCountsAll, 14);

  let baselineCounts: number[] = [];
  let comparedWindow = "";

  if (sameWk.length >= 3) {
    baselineCounts = sameWk;
    comparedWindow = `Same weekday, last ${sameWk.length} occurrences, up to current time-of-day`;
  } else if (anyDay14.length >= 3) {
    baselineCounts = anyDay14;
    comparedWindow = `Any weekday, last ${anyDay14.length} days, up to current time-of-day`;
  } else {
    // Not enough data to be confident
    return null;
  }

  const sorted = baselineCounts.slice().sort((a, b) => a - b);
  const baselineMedian = quantile(sorted, 0.5);
  const baselineP25 = quantile(sorted, 0.25);
  const baselineP75 = quantile(sorted, 0.75);

  // Expected band (robust-ish)
  const expectedLow = Math.max(0, Math.floor(baselineP25));
  const expectedHigh = Math.ceil(baselineP75);

  // Trigger: today below expected low
  if (ordersTodayCount >= expectedLow) return null;

  const delta = baselineMedian - ordersTodayCount;

  const severity: "low" | "medium" | "high" =
    delta >= 4 ? "high" : delta >= 2 ? "medium" : "low";

  // ---- Product context (fallback-safe) ----
  const products = Array.isArray(ctx.products) ? ctx.products : [];
  const rankedByRevenue = products
    .map((p) => ({
      id: p.id,
      title: p.title,
      inv: safeNumber(p.inventory_quantity),
      revenue: safeNumber((p as any).historical_revenue ?? p.historical_revenue ?? 0),
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const anyRevenue = rankedByRevenue.some((p) => p.revenue > 0);
  const topSellers = (anyRevenue ? rankedByRevenue.filter((p) => p.revenue > 0) : rankedByRevenue)
    .slice(0, 5);

  const lowStock = rankedByRevenue
    .filter((p) => p.inv <= 3)
    .sort((a, b) => a.inv - b.inv)
    .slice(0, 6);

  // items preview priority:
  // 1) low stock items (most actionable)
  // 2) top sellers (if we have revenue signal)
  // 3) fallback to “top inventory” items (so the UI never feels empty)
  let itemsPreview: Array<{ title: string; inv?: number; revenue?: number }> = [];

  if (lowStock.length > 0) {
    itemsPreview = lowStock.slice(0, 6).map((p) => ({ title: p.title, inv: p.inv, revenue: p.revenue }));
  } else if (topSellers.length > 0) {
    itemsPreview = topSellers.slice(0, 6).map((p) => ({ title: p.title, inv: p.inv, revenue: p.revenue }));
  } else {
    const topInventory = rankedByRevenue
      .slice()
      .sort((a, b) => b.inv - a.inv)
      .slice(0, 6);
    itemsPreview = topInventory.map((p) => ({ title: p.title, inv: p.inv, revenue: p.revenue }));
  }

  const indicators: IndicatorResult[] = [];

  indicators.push({
    key: "order_count_drop",
    label: "Order pace is below normal",
    status: "likely",
    confidence: severity === "high" ? "high" : "medium",
    evidence: `Orders so far today: ${ordersTodayCount}. Typical by this time: ~${Math.round(
      baselineMedian
    )}. Expected range: ${expectedLow}–${expectedHigh}.`,
  });

  // If we have sessions analytics (optional), hint at traffic vs conversion
  const sessionsToday = safeNumber(ctx.analytics?.sessions_today_so_far ?? 0);
  const sessionsBaseline = safeNumber(ctx.analytics?.sessions_baseline_median ?? 0);

  if (sessionsToday > 0 && sessionsBaseline > 0) {
    const trafficDown = sessionsToday < sessionsBaseline * 0.8;
    indicators.push({
      key: "traffic_signal",
      label: "Traffic signal",
      status: trafficDown ? "possible" : "unknown",
      confidence: "low",
      evidence: `Sessions so far: ${Math.round(sessionsToday)} vs baseline ~${Math.round(
        sessionsBaseline
      )}.`,
    });
  } else {
    indicators.push({
      key: "why_unknown",
      label: "Why this might be happening",
      status: "unknown",
      confidence: "low",
      evidence:
        "Common causes are traffic drops, conversion issues (checkout/discounts), or stockouts on key items.",
    });
  }

  if (lowStock.length > 0) {
    indicators.push({
      key: "stockout_risk",
      label: "Low stock could be constraining sales",
      status: "possible",
      confidence: "medium",
      evidence: `Low stock items: ${lowStock
        .slice(0, 4)
        .map((p) => `${p.title} (${p.inv})`)
        .join(", ")}.`,
    });
  }

  const title =
    severity === "high"
      ? "Sales are far below your normal rhythm today"
      : "Sales are below your normal rhythm today";

  // Crisp summary with at least one product hint when available
  const summaryParts: string[] = [];
  summaryParts.push(
    `Orders today are behind your usual pace for this time of day (${ordersTodayCount} vs ~${Math.round(
      baselineMedian
    )}).`
  );
  if (lowStock.length > 0) {
    summaryParts.push(
      `Possible constraint: low stock on ${lowStock
        .slice(0, 2)
        .map((p) => p.title)
        .join(" and ")}.`
    );
  }

  const suggested_action =
    "Do this now: open your storefront and complete a quick product → cart → checkout test, then verify stock on the top items listed below.";

  const evaluatedAt = new Date().toISOString();
  const nowLocalIso = formatLocalIso(now, tz);

  // IMPORTANT: Always provide evidence keys for UI “Key metrics”
  const evidence: Record<string, any> = {
    timezone: tz,
    now_local_iso: nowLocalIso,
    compared_window: comparedWindow,

    orders_today_so_far: ordersTodayCount,
    baseline_median: Math.round(baselineMedian),
    expected_low: expectedLow,
    expected_high: expectedHigh,
    baseline_days_count: baselineCounts.length,

    low_stock_count: lowStock.length,
    top_sellers_count: topSellers.length,
  };

  return {
    key: "sales_rhythm_drift",
    title,
    severity,
    summary: summaryParts.join(" "),
    suggested_action,
    indicators,
    metrics: {
      timezone: tz,
      compared_window: comparedWindow,
      now_local_iso: nowLocalIso,
      orders_today_so_far: ordersTodayCount,
      baseline_median: round2(baselineMedian),
      baseline_p25: round2(baselineP25),
      baseline_p75: round2(baselineP75),
      expected_low: expectedLow,
      expected_high: expectedHigh,
      baseline_days_count: baselineCounts.length,
      guard_minutes: guardMinutes,
    },
    evidence: {
      ...evidence,
      items_preview: itemsPreview, // helps your pipeline if you want to copy over
    },
    items: itemsPreview, // primary preview list for the UI/email
    evaluated_at: evaluatedAt,
  };
}
