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


/**
 * 自然周窗口(周一 → 周日),圣保罗日历。
 *
 * 业务方 2026-08-07 定:一周 = 周一到周日。考核、例会、骑手排行榜必须共用
 * 同一个"周",否则骑手说"我这周第 3",运营在考核页查是另一个数,解释不清。
 *
 * 之前这段逻辑只写在 api/assessment 里;排行榜要用,就提到这里两处复用 ——
 * 各写一份迟早会漂移。
 *
 * @param date 锚点日期 YYYY-MM-DD(通常是今天)
 */
export function weekWindow(date: string): { from: string; to: string } {
  const d = new Date(`${date}T12:00:00Z`);
  // getUTCDay(): 周日=0 … 周六=6。减 1 再取模,把周一变成 0。
  const back = (d.getUTCDay() - 1 + 7) % 7;
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - back);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
