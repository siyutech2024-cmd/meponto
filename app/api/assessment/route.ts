import { appendServerAudit, jsonResponse, memory } from "../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission, roleFromRequest, scopeFromRequest } from "../../lib/server/authz";
import { defaultAssessmentRule, evaluateMetric, type AssessmentMetric, type AssessmentRule } from "../../lib/assessment";

const COLLECTIONS = ["assessmentRules", "riderDailyKpis", "riders"];

/** Monday-anchored natural week containing `date`. */
function weekWindow(date: string): { from: string; to: string } {
  const d = new Date(`${date}T12:00:00Z`);
  const back = (d.getUTCDay() - 1 + 7) % 7;
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - back);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function activeRule(): AssessmentRule {
  return memory.assessmentRules.find((rule) => rule.id === "rule-active") ?? defaultAssessmentRule;
}

type GroupActual = {
  name: string;
  sub: string;
  riders: number;
  orders: number;
  days: number;
  metrics: Record<string, { actual: number | null; status: string; adjust: number }>;
  totalAdjust: number;
  commissionPct: number;
};

/** Orders-weighted weekly averages per group, evaluated against the rule. */
function buildBoard(rule: AssessmentRule, from: string, to: string, level: "franchise" | "station", onlyFranchise?: string): GroupActual[] {
  const byNinetyNine = new Map(memory.riders.filter((r) => r.ninetyNineId).map((r) => [r.ninetyNineId!, r]));
  // Weekly aggregation of REAL daily data per franchise (display only):
  //  - %TSH / %TSH critical: reconstructed from real hours (Σ in-shift online ÷
  //    Σ signed shift hours), not a flat average.
  //  - AR / CAA: completed-order weighted average.
  //  - orders / online hours: summed; riders / days: distinct counts.
  type Acc = {
    sub: string; riders: Set<string>; orders: number; dates: Set<string>;
    inShift: number; signedHours: number; // for %TSH reconstruction
    w: Record<string, { sum: number; weight: number }>;
  };
  const groups = new Map<string, Acc>();

  for (const row of memory.riderDailyKpis) {
    if (row.date < from || row.date > to) continue;
    const rider = byNinetyNine.get(row.rider99Id);
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
    const put = (metric: string, value: number | null, weight: number) => {
      if (value === null || !Number.isFinite(value) || weight <= 0) return;
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
      const metrics: GroupActual["metrics"] = {};
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
        commissionPct: Math.max(rule.minCommissionPct, rule.minCommissionPct + totalAdjust),
      };
    })
    .sort((a, b) => b.orders - a.orders);
}

export async function GET(request: Request) {
  const forbidden = requirePermission(request, "view_analytics");
  if (forbidden) return forbidden;
  await refreshCollectionsFromDatabase(COLLECTIONS);

  const url = new URL(request.url);
  const anchor = url.searchParams.get("week") || new Date().toISOString().slice(0, 10);
  const win = weekWindow(anchor);
  const rule = activeRule();
  const scope = await scopeFromRequest(request);

  if (scope.station) {
    // Station portal: only its own row.
    const stationBoard = buildBoard(rule, win.from, win.to, "station").filter((row) => row.name === scope.station);
    return jsonResponse({ data: { rule, week: win, scoped: true, franchises: [], stations: stationBoard } });
  }
  if (scope.franchise) {
    // Franchise portal: own franchise summary + per-station split.
    const franchiseBoard = buildBoard(rule, win.from, win.to, "franchise", scope.franchise);
    const stationBoard = buildBoard(rule, win.from, win.to, "station", scope.franchise);
    return jsonResponse({ data: { rule, week: win, scoped: true, franchises: franchiseBoard, stations: stationBoard } });
  }

  const franchiseBoard = buildBoard(rule, win.from, win.to, "franchise");
  const stationBoard = buildBoard(rule, win.from, win.to, "station");
  return jsonResponse({ data: { rule, week: win, scoped: false, franchises: franchiseBoard, stations: stationBoard } });
}

export async function POST(request: Request) {
  const forbidden = requirePermission(request, "view_analytics");
  if (forbidden) return forbidden;
  await refreshCollectionsFromDatabase(COLLECTIONS);

  const scope = await scopeFromRequest(request);
  if (scope.franchise || scope.station) return jsonResponse({ error: "仅总部可修改考核规则" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Partial<AssessmentRule> & { action?: string };
  if (body.action !== "saveRule") return jsonResponse({ error: "unknown action" }, { status: 400 });

  const base = activeRule();
  const sanitizeMetric = (raw: Partial<AssessmentMetric>, fallback: AssessmentMetric): AssessmentMetric => ({
    key: fallback.key,
    label: fallback.label,
    meetOp: raw.meetOp === "<=" ? "<=" : raw.meetOp === ">=" ? ">=" : fallback.meetOp,
    meetThreshold: Number.isFinite(Number(raw.meetThreshold)) ? Number(raw.meetThreshold) : fallback.meetThreshold,
    meetAdjust: Number.isFinite(Number(raw.meetAdjust)) ? Math.abs(Number(raw.meetAdjust)) : fallback.meetAdjust,
    failOp: raw.failOp === "<=" ? "<=" : raw.failOp === ">=" ? ">=" : fallback.failOp,
    failThreshold: Number.isFinite(Number(raw.failThreshold)) ? Number(raw.failThreshold) : fallback.failThreshold,
    failAdjust: Number.isFinite(Number(raw.failAdjust)) ? Math.abs(Number(raw.failAdjust)) : fallback.failAdjust,
  });

  const incoming = Array.isArray(body.metrics) ? body.metrics : [];
  const rule: AssessmentRule = {
    id: "rule-active",
    city: String(body.city ?? base.city).slice(0, 40),
    periodWeeks: Math.max(1, Math.min(8, Number(body.periodWeeks) || base.periodWeeks)),
    effectiveDate: /^\d{4}-\d{2}-\d{2}$/.test(String(body.effectiveDate)) ? String(body.effectiveDate) : base.effectiveDate,
    minCommissionPct: Number.isFinite(Number(body.minCommissionPct)) ? Number(body.minCommissionPct) : base.minCommissionPct,
    exclusive: Boolean(body.exclusive ?? base.exclusive),
    note: String(body.note ?? base.note).slice(0, 300),
    metrics: base.metrics.map((fallback) => sanitizeMetric(incoming.find((m) => (m as AssessmentMetric).key === fallback.key) ?? {}, fallback)),
    updatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    updatedBy: roleFromRequest(request),
  };

  const index = memory.assessmentRules.findIndex((item) => item.id === "rule-active");
  if (index === -1) memory.assessmentRules.unshift(rule);
  else memory.assessmentRules[index] = rule;

  appendServerAudit({ actor: roleFromRequest(request), action: "ASSESSMENT_RULE_SAVED", entity: "AssessmentRule", entityId: rule.id, detail: `规则更新：最小抽佣 ${rule.minCommissionPct}%，生效 ${rule.effectiveDate}。`, risk: "Medium" });
  await flushPendingToDatabase();
  return jsonResponse({ data: rule }, { status: 201 });
}
