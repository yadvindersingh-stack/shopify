import { Indicator } from "../indicator";
import { IndicatorResult } from "../types";

export const PriceIntegrityIndicator: Indicator = {
  key: "price_integrity",
  label: "Recent price changes",

  async evaluate(ctx): Promise<IndicatorResult> {
    return {
      key: this.key,
      label: this.label,
      status: "unknown",
      confidence: "medium",
      evidence:
        "Recent price changes were not evaluated yet.",
    };
  },
};
