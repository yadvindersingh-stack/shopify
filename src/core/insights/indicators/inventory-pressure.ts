import { Indicator } from "../indicator";
import { IndicatorResult } from "../types";

export const InventoryPressureIndicator: Indicator = {
  key: "inventory_pressure",
  label: "Inventory availability",

  async evaluate(ctx): Promise<IndicatorResult> {
    // TODO: real logic in next step

    return {
      key: this.key,
      label: this.label,
      status: "unknown",
      confidence: "high",
      evidence:
        "Inventory levels for high-revenue products were not evaluated yet.",
    };
  },
};
