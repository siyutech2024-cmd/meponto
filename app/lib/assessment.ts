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
  /**
   * 加盟商佣金结算生效周(YYYY-MM-DD,必须是某个自然周的周一)。
   *
   * 2026-09-05 业务方定:总部按周付给加盟商佣金 = 考核抽佣比例 × 该加盟商普通池
   * 骑手当周行程收入;同时结算单显示"加盟商应付骑手 = 所有收入 − 现金"(即导入表
   * 的 今日统计 列)。**这个日期之前的周一律按旧口径显示,历史数据一个字节不动**
   * —— 那些周已经按旧口径结算过了。undefined 时取 COMMISSION_EFFECTIVE_FROM_DEFAULT。
   */
  commissionEffectiveFrom?: string;
};

/** 默认生效周:2026-08-31(周一)。已保存的旧规则没有这个字段时也从这周开始。 */
export const COMMISSION_EFFECTIVE_FROM_DEFAULT = "2026-08-31";

export function commissionEffectiveFrom(rule: Pick<AssessmentRule, "commissionEffectiveFrom">): string {
  const value = rule.commissionEffectiveFrom ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : COMMISSION_EFFECTIVE_FROM_DEFAULT;
}

/** 某个周窗口(周一 from)是否落在佣金新口径生效范围内。 */
export function commissionActiveForWeek(rule: Pick<AssessmentRule, "commissionEffectiveFrom">, weekFrom: string): boolean {
  return weekFrom >= commissionEffectiveFrom(rule);
}

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

// ---------------------------------------------------------------------------
// Weekly assessment board (考核看板) — pure computation shared by
// /api/assessment (display) and /api/wallet (franchise commission, 2026-09-05).
// It used to live inside the assessment route; the wallet needs the very same
// commissionPct so 佣金 and 考核页 can never show two different percentages.
// ---------------------------------------------------------------------------

/** The KPI daily-row fields the board reads (structural subset of RiderDailyKpi). */
export type BoardKpiRow = {
  date: string;
  rider99Id: string;
  completedOrders?: number | null;
  signedShiftHours?: number | null;
  inShiftOnlineHours?: number | null;
  tshCritical?: number | null;
  ar?: number | null;
  caa?: number | null;
};

/** The rider fields the board reads (structural subset of Rider). */
export type BoardRider = { ninetyNineId?: string; franchise?: string; ponto?: string; pool?: string };

export type BoardGroup = {
  name: string;
  sub: string;
  riders: number;
  orders: number;
  days: number;
  metrics: Record<string, { actual: number | null; status: MetricStatus; adjust: number }>;
  totalAdjust: number;
  commissionPct: number;
};

/**
 * Orders-weighted weekly averages per group, evaluated against the rule.
 *
 *  - %TSH / %TSH critical: reconstructed from real hours (Σ in-shift online ÷
 *    Σ signed shift hours), not a flat average.
 *  - AR / CAA: completed-order weighted average.
 *  - orders / online hours: summed; riders / days: distinct counts.
 *
 * @param pool 模式二 R10 · 周考核分池. "" = 全部, "pro" / "standard" = 只统计该池的
 *   骑手日报。PRO 与普通两套单量/AR 混在一起会让任何一边的考核结论失真。
 *   新 OL 报表若缺 AR(N7),对应 metric 的 actual 自然为 null,规则评估已按
 *   "无数据不加不减"处理 —— 自动降级为出勤 + 完单口径,无需额外分支。
 */
export function buildAssessmentBoard(
  rule: AssessmentRule,
  from: string,
  to: string,
  level: "franchise" | "station",
  kpiRows: BoardKpiRow[],
  riders: BoardRider[],
  onlyFranchise?: string,
  pool?: string,
): BoardGroup[] {
  const byNinetyNine = new Map(riders.filter((r) => r.ninetyNineId).map((r) => [r.ninetyNineId!, r]));
  type Acc = {
    sub: string; riders: Set<string>; orders: number; dates: Set<string>;
    inShift: number; signedHours: number; // for %TSH reconstruction
    w: Record<string, { sum: number; weight: number }>;
  };
  const groups = new Map<string, Acc>();

  for (const row of kpiRows) {
    if (row.date < from || row.date > to) continue;
    const rider = byNinetyNine.get(row.rider99Id);
    if (pool && (rider?.pool ?? "standard") !== pool) continue;
    const franchise = rider?.franchise ?? "未关联";
    if (onlyFranchise && franchise !== onlyFranchise) continue;
    const key = level === "franchise" ? franchise : rider?.ponto ?? "未关联";
    const sub = level === "station" ? franchise : "";
    const acc = groups.get(key) ?? { sub, riders: new Set<string>(), orders: 0, dates: new Set<string>(), inShift: 0, signedHours: 0, w: {} };
    acc.riders.add(row.rider99Id);
    acc.orders += row.completedOrders ?? 0;
    acc.dates.add(row.date);
    acc.inShift += row.inShiftOnlineHours ?? 0;
    acc.signedHours += row.signedShiftHours ?? 0;
    const put = (metric: string, value: number | null | undefined, weight: number) => {
      if (value === null || value === undefined || !Number.isFinite(value) || weight <= 0) return;
      const cell = acc.w[metric] ?? { sum: 0, weight: 0 };
      cell.sum += value * weight;
      cell.weight += weight;
      acc.w[metric] = cell;
    };
    const orderWeight = Math.max(1, row.completedOrders ?? 0);
    const hourWeight = row.signedShiftHours ?? 0; // critical-shift TSH stays on the hours basis
    put("tshCritical", row.tshCritical, hourWeight);
    put("ar", row.ar, orderWeight);
    put("caa", row.caa, orderWeight);
    groups.set(key, acc);
  }

  return [...groups.entries()]
    .map(([name, acc]) => {
      const metrics: BoardGroup["metrics"] = {};
      let totalAdjust = 0;
      for (const metric of rule.metrics) {
        let actual: number | null;
        if (metric.key === "tsh") {
          // True weekly %TSH from real hours.
          actual = acc.signedHours > 0 ? Math.round((acc.inShift / acc.signedHours) * 1000) / 10 : null;
        } else {
          const cell = acc.w[metric.key];
          actual = cell && cell.weight > 0 ? Math.round((cell.sum / cell.weight) * 10) / 10 : null;
        }
        const verdict = evaluateMetric(metric, actual);
        metrics[metric.key] = { actual, status: verdict.status, adjust: verdict.adjust };
        totalAdjust += verdict.adjust;
      }
      return {
        name,
        sub: acc.sub,
        riders: acc.riders.size,
        orders: acc.orders,
        days: acc.dates.size,
        metrics,
        totalAdjust,
        commissionPct: commissionPctFor(rule, totalAdjust),
      };
    })
    .sort((a, b) => b.orders - a.orders);
}

/** 抽佣比例 = max(最小抽佣, 最小抽佣 + Σ KPI 加减)。 */
export function commissionPctFor(rule: Pick<AssessmentRule, "minCommissionPct">, totalAdjust: number): number {
  return Math.max(rule.minCommissionPct, rule.minCommissionPct + totalAdjust);
}
