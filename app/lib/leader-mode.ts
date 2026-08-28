/**
 * Leader Mode engine (docs/leader-mode-design.md).
 *
 * Pure functions only — no memory/persistence imports, so both API routes and
 * tests can use it. All week math uses the plain YYYY-MM-DD dates the T+1
 * import already carries (America/Sao_Paulo local dates by construction);
 * weeks run Monday 00:00 → Sunday 24:00 (design §5 hard rule 13).
 */

import type { RiderDailyKpi } from "./performance";
import type { Ponto } from "./data";
import type { Franchise } from "./network";
import type { Rider } from "./data";

// ---------------------------------------------------------------------------
// Targets (franchise-configurable within HQ guardrails; defaults per design)
// ---------------------------------------------------------------------------

export type LeaderTargets = {
  /** Soft floor — fails assessment only when missed (design D8 / §2.5). */
  minActiveRiders: number;
  /** "Active" = at least this many completed orders inside the week. */
  minOrdersPerActiveRider: number;
  minWeeklyOrders: number;
  /** Share of the leader's own orders in team total (only if leaderRiderId). */
  selfOrdersCapPct: number;
  /** Team size guardrails (D8: 5–12 default, HQ range 8–15 for the max). */
  maxTeamSize: number;
};

export const defaultLeaderTargets: LeaderTargets = {
  minActiveRiders: 5,
  minOrdersPerActiveRider: 10,
  minWeeklyOrders: 300,
  selfOrdersCapPct: 30,
  maxTeamSize: 12,
};

// ---------------------------------------------------------------------------
// Assessment snapshot (append-only collection `leaderAssessments`)
// ---------------------------------------------------------------------------

export type LeaderAssessmentState = "provisional" | "closed" | "settled" | "adjusted";

export type LeaderAssessmentGap = {
  metric: "activeRiders" | "weeklyOrders" | "selfOrdersPct";
  /** How far below target (positive number = deficit). */
  deficit: number;
  /** zh/en/pt copy is resolved in the UI layer from this key (guardrail #7). */
  hintKey: "recruit_more" | "raise_volume" | "self_share_over_cap";
};

export type LeaderAssessment = {
  id: string; // `${stationId}:${week}`
  stationId: string;
  stationName: string;
  franchise: string;
  week: string; // ISO week id, e.g. "2026-W36"
  state: LeaderAssessmentState;
  metrics: {
    boundRiders: number;
    activeRiders: number;
    totalOrders: number;
    avgOrdersPerActive: number;
    leaderSelfOrdersPct: number | null;
    /** Days of the week (Mon..Sun, past-or-today only) with imported rows. */
    dataDays: number;
    expectedDataDays: number;
  };
  targetsSnapshot: LeaderTargets;
  gaps: LeaderAssessmentGap[];
  passed: boolean;
  /** Trial stations are reported but never marked failed (design §2.2/P1). */
  trial: boolean;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
};

// ---------------------------------------------------------------------------
// Settlement components (design §2.5 / decisions P1+P2)
// ---------------------------------------------------------------------------

export type LeaderSettlementComponent = {
  key: string; // "base" | "bonus" | future additions
  label: { zh: string; en: string; pt: string }; // tri-lingual (guardrail #7)
  type: "per_order" | "kpi_bonus_per_order";
  /** R$ per completed order. */
  amountBRL: number;
  /** kpi_bonus_per_order only pays when the week's assessment passed. */
  requiresPassed: boolean;
  /** P1: trial stations earn base only. */
  paidDuringTrial: boolean;
  /** Forced to next-cycle start on edit (hard rule 5). */
  effectiveFrom: string;
  version: number;
};

export const defaultLeaderSettlementRules: LeaderSettlementComponent[] = [
  {
    key: "base",
    label: { zh: "基础提成", en: "Base commission", pt: "Comissão base" },
    type: "per_order",
    amountBRL: 0.35,
    requiresPassed: false,
    paidDuringTrial: true, // P1: trial settles the base component
    effectiveFrom: "2026-01-01",
    version: 1,
  },
  {
    key: "bonus",
    label: { zh: "考核提成", en: "Performance bonus", pt: "Bônus de desempenho" },
    type: "kpi_bonus_per_order",
    amountBRL: 0.15,
    requiresPassed: true,
    paidDuringTrial: false, // bonus starts after confirmation
    effectiveFrom: "2026-01-01",
    version: 1,
  },
];

export type LeaderSettlementLine = {
  componentKey: string;
  label: LeaderSettlementComponent["label"];
  orders: number;
  amountBRL: number; // rate
  totalBRL: number;
  version: number;
  skippedReason?: "not_passed" | "trial";
};

/** Pure settlement math for one closed weekly assessment (P2: weekly payout). */
export function computeLeaderSettlement(
  assessment: Pick<LeaderAssessment, "metrics" | "passed" | "trial">,
  rules: LeaderSettlementComponent[],
): { lines: LeaderSettlementLine[]; totalBRL: number } {
  const orders = assessment.metrics.totalOrders;
  const lines: LeaderSettlementLine[] = [];
  for (const rule of rules) {
    const base = { componentKey: rule.key, label: rule.label, orders, amountBRL: rule.amountBRL, version: rule.version };
    if (assessment.trial && !rule.paidDuringTrial) {
      lines.push({ ...base, totalBRL: 0, skippedReason: "trial" });
      continue;
    }
    if (rule.requiresPassed && !assessment.passed) {
      lines.push({ ...base, totalBRL: 0, skippedReason: "not_passed" });
      continue;
    }
    lines.push({ ...base, totalBRL: Math.round(orders * rule.amountBRL * 100) / 100 });
  }
  const totalBRL = Math.round(lines.reduce((sum, l) => sum + l.totalBRL, 0) * 100) / 100;
  return { lines, totalBRL };
}

// ---------------------------------------------------------------------------
// Week helpers (ISO-8601, Monday-based)
// ---------------------------------------------------------------------------

function toUtcDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

/** ISO week id ("2026-W36") for a YYYY-MM-DD date. */
export function isoWeekOf(ymd: string): string {
  const d = toUtcDate(ymd);
  // Shift to the Thursday of the current week to determine the ISO year/week.
  const day = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** All 7 dates (YYYY-MM-DD, Mon..Sun) of the ISO week containing `ymd`. */
export function weekDates(ymd: string): string[] {
  const d = toUtcDate(ymd);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1)); // back to Monday
  return Array.from({ length: 7 }, (_, i) => {
    const cur = new Date(d);
    cur.setUTCDate(d.getUTCDate() + i);
    return cur.toISOString().slice(0, 10);
  });
}

/** All 7 dates (Mon..Sun) of an ISO week id like "2026-W36". */
export function weekIdToDates(week: string): string[] {
  const match = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!match) return [];
  const year = Number(match[1]);
  const weekNo = Number(match[2]);
  // Jan 4 is always in ISO week 1; walk back to its Monday, then add weeks.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  jan4.setUTCDate(jan4.getUTCDate() - (day - 1) + (weekNo - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const cur = new Date(jan4);
    cur.setUTCDate(jan4.getUTCDate() + i);
    return cur.toISOString().slice(0, 10);
  });
}

// ---------------------------------------------------------------------------
// Import-time attribution tagging (design D4)
// ---------------------------------------------------------------------------

/**
 * Stamp stationId/stationFranchise on a KPI row from the rider's binding of
 * TODAY (import day = the binding snapshot; history is never re-attributed).
 * Only tags riders whose franchise runs leader mode — with the flag off this
 * is a no-op, so São Paulo data is byte-identical to before.
 */
export function tagKpiAttribution(
  record: RiderDailyKpi,
  riders: Array<Pick<Rider, "ninetyNineId" | "ponto" | "franchise">>,
  pontos: Array<Pick<Ponto, "id" | "name" | "franchise">>,
  franchises: Array<Pick<Franchise, "name" | "leaderMode">>,
): void {
  const rider = riders.find((r) => r.ninetyNineId === record.rider99Id);
  if (!rider?.ponto || !rider.franchise) return;
  const franchise = franchises.find((f) => f.name === rider.franchise);
  if (!franchise?.leaderMode) return;
  const ponto = pontos.find((p) => p.name === rider.ponto);
  if (!ponto) return;
  record.stationId = ponto.id;
  record.stationFranchise = franchise.name;
}

// ---------------------------------------------------------------------------
// Weekly assessment computation (pure)
// ---------------------------------------------------------------------------

export function computeStationWeek(args: {
  station: Ponto;
  franchise: string;
  week: string;
  /** KPI rows already filtered to this week (any station). */
  weekRows: RiderDailyKpi[];
  targets: LeaderTargets;
  /** Today (YYYY-MM-DD) — caps expectedDataDays for in-progress weeks. */
  today: string;
  /** 99 id of the leader's own rider record (resolved by the caller from
   *  station.leaderRiderId → rider.ninetyNineId), for the self-ride cap. */
  leaderRider99Id?: string;
  existing?: Pick<LeaderAssessment, "state" | "createdAt">;
}): LeaderAssessment {
  const { station, franchise, week, weekRows, targets, today } = args;
  const rows = weekRows.filter((r) => r.stationId === station.id);

  // Per-rider aggregation.
  const byRider = new Map<string, number>();
  for (const row of rows) {
    byRider.set(row.rider99Id, (byRider.get(row.rider99Id) ?? 0) + (row.completedOrders ?? 0));
  }
  const totalOrders = Array.from(byRider.values()).reduce((a, b) => a + b, 0);
  const activeRiders = Array.from(byRider.values()).filter(
    (orders) => orders >= targets.minOrdersPerActiveRider,
  ).length;

  // Self-ride share (only when the leader's rider record is linked and its
  // 99 id shows up in this week's rows).
  let leaderSelfOrdersPct: number | null = null;
  if (args.leaderRider99Id && totalOrders > 0 && byRider.has(args.leaderRider99Id)) {
    const selfOrders = byRider.get(args.leaderRider99Id) ?? 0;
    leaderSelfOrdersPct = Math.round((selfOrders / totalOrders) * 1000) / 10;
  }

  // Data completeness: only past-or-today days can be expected to have rows.
  const dates = weekIdToDates(week);
  const expected = dates.filter((d) => d <= today).length;
  const daysWithData = new Set(rows.map((r) => r.date)).size;

  // Gap attribution — tells the leader WHAT to fix, not just the score.
  const gaps: LeaderAssessmentGap[] = [];
  if (activeRiders < targets.minActiveRiders) {
    gaps.push({ metric: "activeRiders", deficit: targets.minActiveRiders - activeRiders, hintKey: "recruit_more" });
  }
  if (totalOrders < targets.minWeeklyOrders) {
    gaps.push({ metric: "weeklyOrders", deficit: targets.minWeeklyOrders - totalOrders, hintKey: "raise_volume" });
  }
  if (leaderSelfOrdersPct !== null && leaderSelfOrdersPct > targets.selfOrdersCapPct) {
    gaps.push({
      metric: "selfOrdersPct",
      deficit: Math.round((leaderSelfOrdersPct - targets.selfOrdersCapPct) * 10) / 10,
      hintKey: "self_share_over_cap",
    });
  }

  const trial = station.stationStatus === "trial";
  const now = new Date().toISOString();
  return {
    id: `${station.id}:${week}`,
    stationId: station.id,
    stationName: station.name,
    franchise,
    week,
    state: args.existing?.state ?? "provisional",
    metrics: {
      boundRiders: byRider.size,
      activeRiders,
      totalOrders,
      avgOrdersPerActive: activeRiders > 0 ? Math.round((totalOrders / activeRiders) * 10) / 10 : 0,
      leaderSelfOrdersPct,
      dataDays: daysWithData,
      expectedDataDays: expected,
    },
    targetsSnapshot: targets,
    gaps,
    // Trial stations report gaps but are never failed here (trial thresholds
    // are judged by the trial flow, not the weekly pass line).
    passed: trial ? true : gaps.length === 0,
    trial,
    createdAt: args.existing?.createdAt ?? now,
    updatedAt: now,
  };
}
