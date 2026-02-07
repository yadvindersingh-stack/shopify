import { supabase } from "@/lib/supabase";
import { shopifyGraphql } from "@/lib/shopify-admin";
import { INSIGHT_CONTEXT_QUERY } from "@/lib/queries/insight-context";
import { buildInsightContext } from "@/core/insights/build-context";

import { evaluateSalesRhythmDrift } from "@/core/insights/sales-rhythm-drift";
import { evaluateInventoryVelocityRisk } from "@/core/insights/inventory-velocity-risk";

import { getActionableInsights } from "@/core/digest/get-actionable-insights";
import { renderDailyEmail } from "@/core/digest/render-daily-email";
import { sendDailyDigestEmail } from "@/lib/email";

type Severity = "low" | "medium" | "high";
export type ScanMode = "manual" | "auto";

type DbInsight = {
  shop_id: string;
  type: string;
  title: string;
  description: string;
  severity: Severity;
  suggested_action: string | null;
  data_snapshot: any;
};

const GUARD_HOURS: Record<string, number> = {
  inventory_pressure: 6,
  inventory_velocity_risk: 6,
  sales_rhythm_drift: 6,
  dead_inventory: 24 * 7,
  price_volatility_risk: 24, // keep sane default; you already have this insight
};

type Confidence = "high" | "medium" | "low";

type InsightOutput = {
  type: string;
  title: string;
  description: string;
  severity: Severity;
  suggested_action: string;
  confidence: Confidence;
  indicators?: any[];
  metrics?: Record<string, any>;
  items?: any[];
  evaluated_at: string;
  raw: any;
};

function normalizeSeverity(v: any): Severity {
  return v === "high" || v === "medium" || v === "low" ? v : "medium";
}

function normalizeConfidence(v: any, type: string): Confidence {
  const as = v === "high" || v === "medium" || v === "low" ? v : null;
  if (as) return as;

  if (type === "inventory_pressure") return "high";
  if (type === "dead_inventory") return "medium";
  if (type === "price_volatility_risk") return "medium";
  if (type === "sales_rhythm_drift") return "low";
  if (type === "inventory_velocity_risk") return "medium";
  return "medium";
}

function cleanObject(obj: any): Record<string, any> | undefined {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return undefined;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "number") out[k] = v;
    else if (typeof v === "string" && v.trim()) out[k] = v.trim();
    else if (Array.isArray(v) && v.length) out[k] = v.slice(0, 50);
    else if (typeof v === "object" && Object.keys(v).length) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function fallbackSuggestedAction(type: string): string {
  if (type === "inventory_pressure")
    return "Restock low items, pause ads for out-of-stock products, and add back-in-stock expectations.";
  if (type === "dead_inventory")
    return "Hide from key collections, bundle with a bestseller, test a small discount, and avoid reordering until sell-through improves.";
  if (type === "inventory_velocity_risk")
    return "Reorder the fastest movers early, and adjust merchandising so high-velocity items don’t stock out.";
  if (type === "price_volatility_risk")
    return "Check recent price edits, confirm promo rules, and validate the storefront price matches your intended strategy.";
  if (type === "sales_rhythm_drift")
    return "Check sessions and conversion today, verify discount codes and checkout, and compare against your normal sales rhythm.";
  return "Review the flagged data and take action to reduce revenue or trust risk.";
}

function toInsightOutput(input: any): InsightOutput | null {
  if (!input) return null;

  const type = String(input?.type || input?.key || "").trim();
  if (!type) return null;

  const title = String(input?.title || "").trim() || `Issue detected: ${type.replaceAll("_", " ")}`;

  const description =
    String(input?.description || "").trim() ||
    String(input?.summary || "").trim() ||
    "We detected a pattern worth reviewing.";

  const suggested_action =
    String(input?.suggested_action || input?.suggestedAction || "").trim() ||
    fallbackSuggestedAction(type);

  const severity = normalizeSeverity(input?.severity);
  const evaluated_at = String(input?.evaluated_at || input?.evaluatedAt || new Date().toISOString());

  const indicators = Array.isArray(input?.indicators) ? input.indicators : undefined;
  const metrics = cleanObject(input?.metrics);
  const items = Array.isArray(input?.items) ? input.items : undefined;

  const confidence = normalizeConfidence(input?.confidence, type);

  return {
    type,
    title,
    description,
    severity,
    suggested_action,
    confidence,
    indicators,
    metrics,
    items,
    evaluated_at,
    raw: input,
  };
}

function toDbInsight(shopId: string, out: InsightOutput): DbInsight {
  const items_preview =
    Array.isArray(out.items) && out.items.length
      ? out.items.slice(0, 5).map((x: any) => {
          if (!x || typeof x !== "object") return x;
          const t = x.title || x.name || x.product_title;
          const inv = x.inv ?? x.inventory ?? x.totalInventory ?? x.inventory_quantity;
          const days = x.days_since_last_sale ?? x.days ?? x.daysSince;
          return { title: t, inv, days, bucket: x.bucket };
        })
      : null;

  const items_full =
    Array.isArray(out.items) && out.items.length ? out.items.slice(0, 25) : null;

  return {
    shop_id: shopId,
    type: out.type,
    title: out.title,
    description: out.description,
    severity: out.severity,
    suggested_action: out.suggested_action,
    data_snapshot: {
      confidence: out.confidence,
      evaluated_at: out.evaluated_at,
      // promote for UI
      indicators: out.indicators ?? null,
      metrics: out.metrics ?? null,
      items_preview,
      items: items_full,
      // keep raw for advanced view/debug
      raw: out.raw,
    },
  };
}

// ----- Scheduling: next 11am in shop timezone; stored as UTC ISO -----
function getNext11AmISO(shopTimezone: string) {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: shopTimezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const hour = Number(get("hour"));

  const candidateUtc = new Date(Date.UTC(y, m - 1, d, 11, 0, 0));
  if (Number.isFinite(hour) && hour >= 11) candidateUtc.setUTCDate(candidateUtc.getUTCDate() + 1);

  return candidateUtc.toISOString();
}

async function writeScanRun(args: {
  shopId: string;
  shopTimezone: string;
  status: "ok" | "error";
  summary: any;
}) {
  const nowIso = new Date().toISOString();
  const nextIso = getNext11AmISO(args.shopTimezone || "UTC");

  const { error } = await supabase.from("scan_runs").upsert(
    {
      shop_id: args.shopId,
      last_scan_at: nowIso,
      next_scan_at: nextIso,
      last_scan_status: args.status,
      last_scan_summary: args.summary,
      updated_at: nowIso,
    },
    { onConflict: "shop_id" }
  );

  if (error) console.log("SCAN_RUN_WRITE_FAILED", error.message);
}

async function alreadyInsertedWithin(shopId: string, type: string, hours: number) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("insights")
    .select("id")
    .eq("shop_id", shopId)
    .eq("type", type)
    .gte("created_at", since)
    .limit(1);

  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

// ---- Inventory pressure ----
function evaluateInventoryPressureFromShopifyData(data: any) {
  const edges = data?.products?.edges ?? [];
  const nodes = Array.isArray(edges) ? edges.map((e: any) => e?.node).filter(Boolean) : [];

  const invOf = (p: any) => {
    const v = p?.totalInventory ?? p?.inventory_quantity ?? p?.inventoryQuantity ?? p?.inventory ?? 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const normalized = nodes
    .map((p: any) => ({ id: p?.id, title: p?.title || "Untitled product", inv: invOf(p) }))
    .sort((a, b) => a.inv - b.inv);

  const low = normalized.filter((p) => p.inv <= 2);
  if (!low.length) return null;

  const hasZero = low.some((p) => p.inv === 0);
  const severity: "high" | "medium" = hasZero ? "high" : "medium";
  const top = low.slice(0, 5);

  return {
    key: "inventory_pressure",
    title: hasZero ? "Products are out of stock" : "Some products are running low",
    severity,
    summary:
      "These items have very low inventory: " +
      top.map((p) => `${p.title} (${p.inv})`).join(", ") +
      (low.length > top.length ? ` (+${low.length - top.length} more)` : "") +
      ".",
    suggested_action: hasZero
      ? "Restock or set expectations (preorder/backorder). Pause ads for out-of-stock items."
      : "Restock soon or adjust merchandising to avoid stockouts.",
    metrics: {
      low_sku_count: low.length,
      zero_inventory_count: low.filter((p) => p.inv === 0).length,
      min_inventory: low[0]?.inv ?? null,
    },
    items: low,
    evaluated_at: new Date().toISOString(),
    confidence: "high",
  };
}

// ---- Dead inventory ----
function evaluateDeadInventoryFromShopifyData(
  data: any,
  opts?: { windowDays?: number; minStock?: number }
) {
  const WINDOW_DAYS = opts?.windowDays ?? 30;
  const MIN_STOCK = opts?.minStock ?? 10;
  const SLOW_MOVER_DAYS = 90;

  const now = new Date();
  const cutoff30Ms = now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const cutoff90Ms = now.getTime() - SLOW_MOVER_DAYS * 24 * 60 * 60 * 1000;

  const pEdges = data?.products?.edges ?? [];
  const products = Array.isArray(pEdges) ? pEdges.map((e: any) => e?.node).filter(Boolean) : [];

  const oEdges = data?.orders?.edges ?? [];
  const orders = Array.isArray(oEdges) ? oEdges.map((e: any) => e?.node).filter(Boolean) : [];

  const lastSaleMsByProduct = new Map<string, number>();
  const everSoldSet = new Set<string>();

  for (const o of orders) {
    if (o?.cancelledAt) continue;
    const createdMs = o?.createdAt ? new Date(o.createdAt).getTime() : NaN;
    if (!Number.isFinite(createdMs)) continue;

    const liEdges = o?.lineItems?.edges ?? [];
    for (const liE of liEdges) {
      const li = liE?.node;
      const pid = li?.product?.id;
      if (!pid) continue;
      everSoldSet.add(pid);
      const prev = lastSaleMsByProduct.get(pid);
      if (!prev || createdMs > prev) lastSaleMsByProduct.set(pid, createdMs);
    }
  }

  const invOf = (p: any) => {
    const v = p?.totalInventory ?? p?.inventory_quantity ?? p?.inventoryQuantity ?? p?.inventory ?? 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const priceOf = (p: any) => {
    const amt = p?.priceRangeV2?.minVariantPrice?.amount ?? p?.price ?? 0;
    const n = Number(amt);
    return Number.isFinite(n) ? n : 0;
  };

  type Bucket = "never_sold" | "stopped_selling" | "slow_mover";
  const deadItems: any[] = [];

  for (const p of products) {
    const productId = p?.id;
    if (!productId) continue;

    const title = String(p?.title ?? "Untitled product");
    const inventory = invOf(p);
    const price = priceOf(p);

    if (inventory < MIN_STOCK) continue;
    if (title.toLowerCase().includes("gift card")) continue;

    const status = (p?.status ?? "").toString().toUpperCase();
    if (status && status !== "ACTIVE") continue;

    const lastSaleMs = lastSaleMsByProduct.get(productId);
    const everSold = everSoldSet.has(productId);

    let bucket: Bucket | null = null;
    if (!everSold) bucket = "never_sold";
    else if (lastSaleMs && lastSaleMs < cutoff30Ms)
      bucket = lastSaleMs >= cutoff90Ms ? "slow_mover" : "stopped_selling";

    if (!bucket) continue;

    const lastSaleAt = lastSaleMs ? new Date(lastSaleMs).toISOString() : null;
    const daysSince = lastSaleMs ? Math.floor((now.getTime() - lastSaleMs) / (24 * 60 * 60 * 1000)) : null;

    deadItems.push({
      product_id: productId,
      title,
      inventory,
      price,
      cash_trapped_estimate: Math.round(inventory * price * 100) / 100,
      bucket,
      last_sale_at: lastSaleAt,
      days_since_last_sale: daysSince,
    });
  }

  if (deadItems.length === 0) return null;

  deadItems.sort((a, b) => b.cash_trapped_estimate - a.cash_trapped_estimate);

  const totalTrapped = deadItems.reduce((sum, x) => sum + x.cash_trapped_estimate, 0);
  const severity: "high" | "medium" | "low" =
    totalTrapped >= 500 ? "high" : deadItems.length >= 3 ? "medium" : "low";

  return {
    key: "dead_inventory",
    title: severity === "high" ? "Cash is trapped in non-moving inventory" : "Some inventory isn’t moving",
    severity,
    summary:
      `We found ${deadItems.length} products with stock (≥${MIN_STOCK}) that haven’t sold recently. ` +
      `Estimated cash tied up: $${Math.round(totalTrapped)}.`,
    suggested_action:
      "Hide from key collections, bundle with a bestseller, test a small discount, and avoid reordering until sell-through improves.",
    evaluated_at: now.toISOString(),
    confidence: "medium",
    metrics: {
      dead_sku_count: deadItems.length,
      window_days: WINDOW_DAYS,
      min_stock_threshold: MIN_STOCK,
      total_cash_trapped_estimate: Math.round(totalTrapped * 100) / 100,
    },
    items: deadItems,
  };
}

export async function runScanForShop(args: {
  shopId: string;
  shopDomain: string;
  accessToken: string;
  mode: ScanMode;
}) {
  const evaluated: string[] = [];
  const skipped: Array<{ type: string; reason: string }> = [];

  const sinceIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const ordersQuery = `created_at:>=${sinceIso}`;

  const data = await shopifyGraphql({
    shop: args.shopDomain,
    accessToken: args.accessToken,
    query: INSIGHT_CONTEXT_QUERY,
    variables: { ordersQuery },
  });

  const ctx = buildInsightContext(args.shopDomain, new Date(), data);

  const candidatesRaw: any[] = [];

  const drift = await evaluateSalesRhythmDrift(ctx);
  evaluated.push("sales_rhythm_drift");
  if (drift) candidatesRaw.push(drift);

  const invPressure = evaluateInventoryPressureFromShopifyData(data);
  evaluated.push("inventory_pressure");
  if (invPressure) candidatesRaw.push(invPressure);

  const deadInv = evaluateDeadInventoryFromShopifyData(data, { windowDays: 30, minStock: 10 });
  evaluated.push("dead_inventory");
  if (deadInv) candidatesRaw.push(deadInv);

  const velocity = evaluateInventoryVelocityRisk(ctx);
  evaluated.push("inventory_velocity_risk");
  if (velocity) candidatesRaw.push(velocity);

  const inserts: DbInsight[] = [];

  for (const raw of candidatesRaw) {
    const out = toInsightOutput(raw);
    const type = String(raw?.key || raw?.type || "unknown");

    if (!out) {
      skipped.push({ type, reason: "normalize_failed" });
      continue;
    }

    const hours = GUARD_HOURS[out.type] ?? 6;
    const recently = await alreadyInsertedWithin(args.shopId, out.type, hours);
    if (recently) {
      skipped.push({ type: out.type, reason: `guard_${hours}h` });
      continue;
    }

    inserts.push(toDbInsight(args.shopId, out));
  }

  if (inserts.length > 0) {
    const { error: upsertErr } = await supabase
      .from("insights")
      .upsert(inserts, { onConflict: "shop_id,type" });

    if (upsertErr) throw new Error(`Upsert failed: ${upsertErr.message}`);
  }

  const summary = {
    inserted: inserts.length,
    keys: inserts.map((i) => i.type),
    evaluated,
    skipped,
    diag: {
      products_present: Boolean((data as any)?.products),
      products_edges: (data as any)?.products?.edges?.length ?? 0,
      orders_edges: (data as any)?.orders?.edges?.length ?? 0,
    },
  };

  const shopTimezone = (data as any)?.shop?.ianaTimezone || "UTC";
  await writeScanRun({ shopId: args.shopId, shopTimezone, status: "ok", summary });

  // Email only on auto runs, and only if enabled + actionable.
  if (args.mode === "auto") {
    try {
      const { data: settings } = await supabase
        .from("digest_settings")
        .select("email,daily_enabled")
        .eq("shop_id", args.shopId)
        .maybeSingle();

      if (settings?.daily_enabled && settings?.email) {
        const actionable = await getActionableInsights(args.shopId);
        if (Array.isArray(actionable) && actionable.length > 0) {
          const subject = `MerchPulse — ${actionable.length} issue${actionable.length > 1 ? "s" : ""} need attention`;
          const text = renderDailyEmail({ shopDomain: args.shopDomain, insights: actionable });
          await sendDailyDigestEmail({ to: settings.email, subject, body: text });
        }
      }
    } catch (e: any) {
      console.log("EMAIL_SEND_FAILED", e?.message || String(e));
    }
  }

  return summary;
}
