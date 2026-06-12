/**
 * Franchise assessment rules (考核规则) — HQ defines quality thresholds and
 * commission adjustments (mirrors the Eastwind service-quality rule sheet);
 * franchise/station portals see the rule plus their week-to-date actuals.
 */

export type AssessmentMetricKey = "tsh" | "tshCritical" | "ar" | "caa";

export type AssessmentMetric = {
  key: AssessmentMetricKey;
  label: string;
  /** 达标: actual `meetOp` meetThreshold → +meetAdjust (percentage points). */
  meetOp: ">=" | "<=";
  meetThreshold: number;
  meetAdjust: number;
  /** 未达标: actual `failOp` failThreshold → -failAdjust. */
  failOp: ">=" | "<=";
  failThreshold: number;
  failAdjust: number;
};

export type AssessmentRule = {
  id: string; // "rule-active"
  city: string;
  periodWeeks: number;
  effectiveDate: string; // YYYY-MM-DD
  minCommissionPct: number;
  exclusive: boolean;
  note: string;
  metrics: AssessmentMetric[];
  updatedAt: string;
  updatedBy: string;
};

/** Default mirrors the Eastwind São Paulo sheet (2026-05-24). */
export const defaultAssessmentRule: AssessmentRule = {
  id: "rule-active",
  city: "圣保罗",
  periodWeeks: 1,
  effectiveDate: "2026-05-24",
  minCommissionPct: 5,
  exclusive: false,
  note: "",
  metrics: [
    { key: "tsh", label: "%TSH", meetOp: ">=", meetThreshold: 90, meetAdjust: 5, failOp: "<=", failThreshold: 80, failAdjust: 5 },
    { key: "tshCritical", label: "%TSH in Critical Shifts", meetOp: ">=", meetThreshold: 80, meetAdjust: 8, failOp: "<=", failThreshold: 75, failAdjust: 8 },
    { key: "ar", label: "AR", meetOp: ">=", meetThreshold: 85, meetAdjust: 10, failOp: "<=", failThreshold: 70, failAdjust: 10 },
    { key: "caa", label: "CAA", meetOp: "<=", meetThreshold: 0.7, meetAdjust: 7, failOp: ">=", failThreshold: 1.3, failAdjust: 7 },
  ],
  updatedAt: "",
  updatedBy: "",
};

export const assessmentRules: AssessmentRule[] = [];

export type MetricStatus = "meet" | "mid" | "fail" | "na";

export function evaluateMetric(metric: AssessmentMetric, actual: number | null): { status: MetricStatus; adjust: number } {
  if (actual === null || !Number.isFinite(actual)) return { status: "na", adjust: 0 };
  const cmp = (op: ">=" | "<=", threshold: number) => (op === ">=" ? actual >= threshold : actual <= threshold);
  if (cmp(metric.meetOp, metric.meetThreshold)) return { status: "meet", adjust: metric.meetAdjust };
  if (cmp(metric.failOp, metric.failThreshold)) return { status: "fail", adjust: -metric.failAdjust };
  return { status: "mid", adjust: 0 };
}
