import type { Indicator } from "../indicator";
import type { IndicatorResult } from "../types";
import type { InsightContext } from "../context";

function money(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  return n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${Math.round(n)}`;
}

export const InventoryPressureIndicator: Indicator = {
  key: "inventory_pressure",
  label: "Inventory availability",

  async evaluate(ctx: InsightContext): Promise<IndicatorResult> {
    const products = ctx.products || [];
    if (products.length === 0) {
      return {
        key: this.key,
        label: this.label,
        status: "unknown",
        confidence: "high",
        evidence: "No product inventory data available.",
      };
    }

    const ranked = [...products]
      .sort((a, b) => (b.historical_revenue || 0) - (a.historical_revenue || 0))
      .slice(0, 5);

    const topTitles = ranked.map((p) => p.title).filter(Boolean);
    if (ranked.length === 0) {
      return {
        key: this.key,
        label: this.label,
        status: "unknown",
        confidence: "high",
        evidence: "No sellable products found to evaluate inventory.",
      };
    }

    const low = ranked.filter((p) => (p.inventory_quantity ?? 0) <= 5);
    const veryLow = ranked.filter((p) => (p.inventory_quantity ?? 0) <= 2);

    // Status decision
    let status: IndicatorResult["status"] = "unlikely";
    if (low.length >= 2 || veryLow.length >= 1) status = "likely";
    else if (low.length === 1) status = "possible";

    // Evidence string
    const evidenceParts: string[] = [];
    evidenceParts.push(
      `Checked your top ${ranked.length} products by recent revenue (${topTitles.slice(0, 3).join(", ")}${topTitles.length > 3 ? ", …" : ""}).`
    );

    if (low.length === 0) {
      evidenceParts.push(`None of these are low on inventory (≤ 5 units).`);
    } else {
      const lowList = low
        .map((p) => `${p.title} (${p.inventory_quantity} left, ~${money(p.historical_revenue)} revenue in window)`)
        .join("; ");
      evidenceParts.push(`Low inventory detected: ${lowList}.`);
    }

    return {
      key: this.key,
      label: this.label,
      status,
      confidence: "high",
      evidence: evidenceParts.join(" "),
    };
  },
};
