import { appendServerAudit, jsonResponse, memory } from "../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission, roleFromRequest, scopeFromRequest } from "../../lib/server/authz";
import { buildAssessmentBoard, defaultAssessmentRule, weekWindow, type AssessmentMetric, type AssessmentRule } from "../../lib/assessment";

const COLLECTIONS = ["assessmentRules", "riderDailyKpis", "riders"];

/** Monday-anchored natural week containing `date`. */
function activeRule(): AssessmentRule {
  return memory.assessmentRules.find((rule) => rule.id === "rule-active") ?? defaultAssessmentRule;
}

/**
 * Board computation lives in app/lib/assessment.ts (buildAssessmentBoard) since
 * 2026-09-05: the wallet's franchise-commission line uses the same function, so
 * the percentage here and the amount there can never disagree.
 */
function buildBoard(rule: AssessmentRule, from: string, to: string, level: "franchise" | "station", onlyFranchise?: string, pool?: string) {
  return buildAssessmentBoard(rule, from, to, level, memory.riderDailyKpis, memory.riders, onlyFranchise, pool);
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
  // 模式二 R10: pool chip on the existing assessment page — no new menu.
  const poolParam = url.searchParams.get("pool") ?? "";
  const pool = poolParam === "pro" || poolParam === "standard" ? poolParam : "";

  if (scope.station) {
    // Station portal: only its own row.
    const stationBoard = buildBoard(rule, win.from, win.to, "station", undefined, pool).filter((row) => row.name === scope.station);
    return jsonResponse({ data: { rule, week: win, scoped: true, franchises: [], stations: stationBoard } });
  }
  if (scope.franchise) {
    // Franchise portal: own franchise summary + per-station split.
    const franchiseBoard = buildBoard(rule, win.from, win.to, "franchise", scope.franchise, pool);
    const stationBoard = buildBoard(rule, win.from, win.to, "station", scope.franchise, pool);
    return jsonResponse({ data: { rule, week: win, scoped: true, franchises: franchiseBoard, stations: stationBoard } });
  }

  const franchiseBoard = buildBoard(rule, win.from, win.to, "franchise", undefined, pool);
  const stationBoard = buildBoard(rule, win.from, win.to, "station", undefined, pool);
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
    // 佣金生效周(2026-09-05):只接受 YYYY-MM-DD;缺省沿用已保存值(再缺省由
    // commissionEffectiveFrom() 回落到 2026-08-31)。之前的周不受影响。
    commissionEffectiveFrom: /^\d{4}-\d{2}-\d{2}$/.test(String(body.commissionEffectiveFrom ?? ""))
      ? String(body.commissionEffectiveFrom)
      : base.commissionEffectiveFrom,
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
