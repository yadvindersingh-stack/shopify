export type IndicatorStatus =
  | "likely"
  | "possible"
  | "unlikely"
  | "unknown";

export type IndicatorConfidence =
  | "high"
  | "medium"
  | "low";

export type IndicatorResult = {
  key: string;
  label: string;
  status: IndicatorStatus;
  confidence: IndicatorConfidence;
  evidence: string;
};

export type InsightSeverity = "high" | "medium";

export type Insight = {
  key: string;
  title: string;
  severity: InsightSeverity;
  summary: string;

  indicators: IndicatorResult[];

  metrics: Record<string, number | string>;
  evaluated_at: string;
};
