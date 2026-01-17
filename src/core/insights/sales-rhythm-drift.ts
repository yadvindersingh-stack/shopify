type OrderNode = {
  id: string;
  createdAt: string;
  cancelledAt?: string | null;
  totalPriceSet?: { shopMoney?: { amount?: string } };
};

type DriftStats = {
  orders: number;
  cancelled: number;
  gross: number; // in shop currency
  cancelRate: number; // 0..1
};

export type SalesRhythmDriftInsight = {
  type: "sales_rhythm_drift";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  suggested_action: string;
  data_snapshot: Record<string, any>;
};

function amountToNumber(a: any): number {
  const n = typeof a === "string" ? Number(a) : typeof a === "number" ? a : 0;
  return Number.isFinite(n) ? n : 0;
}

function dayKeyUTC(iso: string) {
  // v1: keep UTC. Later we can convert to shop timezone.
  return iso.slice(0, 10);
}

function buildWindowStats(orders: OrderNode[], startDayIncl: string, endDayExcl: string): DriftStats {
  let count = 0;
  let cancelled = 0;
  let gross = 0;

  for (const o of orders) {
    const day = dayKeyUTC(o.createdAt);
    if (day < startDayIncl || day >= endDayExcl) continue;

    count += 1;
    if (o.cancelledAt) cancelled += 1;
    gross += amountToNumber(o.totalPriceSet?.shopMoney?.amount);
  }

  const cancelRate = count ? cancelled / count : 0;
  return { orders: count, cancelled, gross, cancelRate };
}

function pctChange(curr: number, prev: number) {
  if (prev === 0) return curr === 0 ? 0 : 1; // treat as +100% if prev 0 and curr > 0
  return (curr - prev) / prev;
}

export function evaluateSalesRhythmDrift(input: {
  orders: OrderNode[];
  now: Date;
}): SalesRhythmDriftInsight | null {
  const { orders, now } = input;

  // Need at least some data
  if (!orders?.length) return null;

  const today = now.toISOString().slice(0, 10);

  // Define two 7-day windows (UTC)
  // current: [today-7, today)
  // previous: [today-14, today-7)
  const d = new Date(`${today}T00:00:00Z`);
  const day = (n: number) => {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10);
  };

  const currStart = day(-7);
  const currEnd = day(0);
  const prevStart = day(-14);
  const prevEnd = day(-7);

  const curr = buildWindowStats(orders, currStart, currEnd);
  const prev = buildWindowStats(orders, prevStart, prevEnd);

  // Not enough baseline
  if (prev.orders < 5) return null;

  const ordersDelta = pctChange(curr.orders, prev.orders);
  const grossDelta = pctChange(curr.gross, prev.gross);
  const cancelDelta = prev.cancelRate === 0 ? (curr.cancelRate > 0 ? 1 : 0) : curr.cancelRate / prev.cancelRate;

  // Severity logic (v1)
  let severity: "high" | "medium" | "low" | null = null;

  const ordersDown30 = ordersDelta <= -0.30;
  const ordersDown15 = ordersDelta <= -0.15;
  const grossDown30 = grossDelta <= -0.30;
  const cancelUp2x = cancelDelta >= 2 && curr.cancelRate >= 0.05;
  const cancelUp15x = cancelDelta >= 1.5 && curr.cancelRate >= 0.05;

  if (ordersDown30 && (grossDown30 || cancelUp2x)) severity = "high";
  else if (ordersDown15 || cancelUp15x) severity = "medium";
  else if (ordersDelta <= -0.10 || grossDelta <= -0.10) severity = "low";

  if (!severity) return null;

  const title =
    severity === "high"
      ? "Sales rhythm shifted sharply"
      : severity === "medium"
      ? "Sales rhythm drift detected"
      : "Sales rhythm slightly below baseline";

  const description =
    `Last 7 days vs prior 7 days: ` +
    `${curr.orders} orders (${Math.round(ordersDelta * 100)}%), ` +
    `${curr.gross.toFixed(2)} gross (${Math.round(grossDelta * 100)}%). ` +
    `Cancellation rate: ${(curr.cancelRate * 100).toFixed(1)}% (was ${(prev.cancelRate * 100).toFixed(1)}%).`;

  const suggested_action =
    cancelUp15x
      ? "Check recent cancellations for patterns (shipping delays, stockouts, discount issues). Validate fulfillment and customer messaging for the last week."
      : "Review top traffic sources and on-site changes from the last 7 days (theme, pricing, shipping thresholds). If a change was made, consider reverting or testing an alternative.";

  return {
    type: "sales_rhythm_drift",
    severity,
    title,
    description,
    suggested_action,
    data_snapshot: {
      windows: {
        current: { start: currStart, end: currEnd, ...curr },
        previous: { start: prevStart, end: prevEnd, ...prev },
      },
      deltas: { ordersDelta, grossDelta, cancelDelta },
    },
  };
}
