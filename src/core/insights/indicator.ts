import { InsightContext } from "./context";
import { IndicatorResult } from "./types";

export interface Indicator {
  key: string;
  label: string;

  evaluate(ctx: InsightContext): Promise<IndicatorResult>;
}
