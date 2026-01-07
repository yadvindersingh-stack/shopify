import { Indicator } from "../indicator";
import { IndicatorResult } from "../types";

export const FulfillmentFrictionIndicator: Indicator = {
  key: "fulfillment_friction",
  label: "Fulfillment issues",

  async evaluate(ctx): Promise<IndicatorResult> {
    return {
      key: this.key,
      label: this.label,
      status: "unknown",
      confidence: "medium",
      evidence:
        "Cancellation and refund patterns were not evaluated yet.",
    };
  },
};
