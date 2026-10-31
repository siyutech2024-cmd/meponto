/**
 * Leader Mode weekly assessment (docs/leader-mode-design.md §2.4/§3).
 *
 * GET  ?week=2026-W36&franchise=SJBV — recompute-on-read: provisional
 *      snapshots are recalculated from the tagged T+1 KPI rows on every read;
 *      closed/settled snapshots are frozen and returned as stored.
 * POST { action: "closeWeek", week, franchise } — freeze a finished week
 *      (data-completeness gate; settlement generation lands in PR-2).
 *
 * Data path (data-core-cure-plan guard compliant — NO memory collections):
 *   reads  : fetchRows on app_state_records (franchises/pontos/riders/kpis)
 *   writes : leader_assessments real table via leader-repo
 * Scope: HQ unscoped · franchise portal → own franchise · ponto portal → own
 * station. Only leaderMode franchises appear — flag off ⇒ empty and no writes.
 */

import { requirePermission, scopeFromRequest } from "../../../lib/server/authz";
import { fetchRows } from "../../../lib/server/db-read";
import { closeWeekAssessments, listAssessments, upsertAssessments } from "../../../lib/server/db/leader-repo";
import {
  computeStationWeek,
  computeTrialProgress,
  defaultLeaderTargets,
  type TrialProgress,
  isoWeekOf,
  mergeLeaderWeekRows,
  weekIdToDates,
  type LeaderAssessment,
} from "../../../lib/leader-mode";
import { loadLeaderDaily } from "../../../lib/server/leader-daily";
import type { RiderDailyKpi } from "../../../lib/performance";
import type { Ponto, Rider } from "../../../lib/data";
import type { Franchise } from "../../../lib/network";

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: { "Content-Type": "application/json; charset=utf-8", ...(init?.headers ?? {}) },
  });
}

function todayYmd(): string {
  // America/Sao_Paulo local date (design hard rule 13).
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

async function loadWeekKpiRows(week: string): Promise<RiderDailyKpi[]> {
  const dates = weekIdToDates(week);
  if (dates.length === 0) return [];
  return fetchRows<RiderDailyKpi>("riderDailyKpis", [
    { op: "gte", field: "date", value: dates[0] },
    { op: "lte", field: "date", value: dates[6] },
  ]);
}

export async function GET(request: Request) {
  const forbidden = requirePermission(request, "view_dashboard");
  if (forbidden) return forbidden;

  const scope = await scopeFromRequest(request);
  const url = new URL(request.url);
  const today = todayYmd();
  const week = url.searchParams.get("week") ?? isoWeekOf(today);
  const franchiseParam = url.searchParams.get("franchise") ?? "";

  let franchises = (await fetchRows<Franchise>("franchises")).filter((f) => f.leaderMode === true);
  if (scope.franchise) franchises = franchises.filter((f) => f.name === scope.franchise);
  if (franchiseParam) franchises = franchises.filter((f) => f.name === franchiseParam);
  if (franchises.length === 0) return jsonResponse({ data: { week, today, franchises: [] } });

  const weekDays = weekIdToDates(week);
  const [pontos, riders, t1RowsAll, liveRowsAll] = await Promise.all([
    fetchRows<Ponto>("pontos"),
    fetchRows<Rider>("riders"),
    loadWeekKpiRows(week),
    weekDays.length ? loadLeaderDaily(weekDays[0], weekDays[6]) : Promise.resolve([]),
  ]);

  const result: Array<{
    franchise: string;
    assessments: LeaderAssessment[];
    /** Rows this week with no station tag but a rider bound to this franchise
     *  today — usually "binding happened after import" (未匹配/待回算队列). */
    untaggedRider99Ids: string[];
    /** Which days came from T+1 vs the live ledger (decision 6). */
    t1Dates: string[];
    liveDates: string[];
    /** Trial stations: 14-day progress toward promotion (decision 9). */
    trialProgress: Record<string, TrialProgress>;
  }> = [];

  const toPersist: LeaderAssessment[] = [];
  for (const franchise of franchises) {
    const franchiseRider99Ids = new Set(riders.filter((r) => r.franchise === franchise.name && r.ninetyNineId).map((r) => String(r.ninetyNineId)));
    const merged = mergeLeaderWeekRows({ franchise: franchise.name, dates: weekDays, t1Rows: t1RowsAll, liveRows: liveRowsAll, franchiseRider99Ids });
    const weekRowsAll = merged.rows;
    const weekRows = weekRowsAll.filter((row) => row.stationFranchise === franchise.name);
    const stored = await listAssessments(franchise.name, week);

    let stations = pontos.filter(
      (p) =>
        p.franchise === franchise.name &&
        (p.stationStatus === undefined || p.stationStatus === "active" || p.stationStatus === "trial"),
    );
    if (scope.station) {
      stations = stations.filter((p) => p.id === scope.station || p.name === scope.station);
    }

    const assessments: LeaderAssessment[] = [];
    for (const station of stations) {
      const existing = stored.find((row) => row.id === `${station.id}:${week}`);
      if (existing && existing.state !== "provisional") {
        assessments.push(existing); // frozen — never recomputed
        continue;
      }
      const leaderRider99Id = station.leaderRiderId
        ? riders.find((r) => r.id === station.leaderRiderId)?.ninetyNineId
        : undefined;
      const snapshot = computeStationWeek({
        station,
        franchise: franchise.name,
        week,
        weekRows,
        targets: defaultLeaderTargets, // per-franchise overrides land in PR-2
        today,
        leaderRider99Id,
        existing,
      });
      toPersist.push(snapshot);
      assessments.push(snapshot);
    }

    // Untagged queue: week rows without a station tag whose rider is bound to
    // this franchise TODAY (import predated the binding → needs re-import).
    const untagged = new Set<string>();
    for (const row of weekRowsAll) {
      if (row.stationId) continue;
      const rider = riders.find((r) => r.ninetyNineId === row.rider99Id);
      if (rider?.franchise === franchise.name) untagged.add(row.rider99Id);
    }

    // Trial progress over each trial station's own 14-day window (may span two
    // ISO weeks, so it reads its own date range; same T+1-else-live merge).
    const trialProgress: Record<string, TrialProgress> = {};
    const trialStations = stations.filter((st) => st.stationStatus === "trial" && st.trialStartedAt);
    if (trialStations.length) {
      const from = trialStations.map((st) => st.trialStartedAt!).sort()[0];
      const [t1Trial, liveTrial] = await Promise.all([
        fetchRows<RiderDailyKpi>("riderDailyKpis", [{ op: "gte", field: "date", value: from }, { op: "lte", field: "date", value: today }]),
        loadLeaderDaily(from, today),
      ]);
      const span: string[] = [];
      for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) <= today; d = new Date(d.getTime() + 864e5)) span.push(d.toISOString().slice(0, 10));
      const trialRows = mergeLeaderWeekRows({ franchise: franchise.name, dates: span, t1Rows: t1Trial, liveRows: liveTrial, franchiseRider99Ids }).rows;
      for (const st of trialStations) {
        trialProgress[st.id] = computeTrialProgress({ stationId: st.id, startedAt: st.trialStartedAt!, today, rows: trialRows, minOrdersPerActiveRider: defaultLeaderTargets.minOrdersPerActiveRider });
      }
    }

    result.push({ franchise: franchise.name, assessments, untaggedRider99Ids: Array.from(untagged), t1Dates: merged.t1Dates, liveDates: merged.liveDates, trialProgress });
  }

  await upsertAssessments(toPersist);
  return jsonResponse({ data: { week, today, franchises: result } });
}

export async function POST(request: Request) {
  const forbidden = requirePermission(request, "manage_leaders");
  if (forbidden) return forbidden;

  const body = (await request.json().catch(() => ({}))) as { action?: string; week?: string; franchise?: string };
  if (body.action !== "closeWeek") return jsonResponse({ error: "unknown action" }, { status: 400 });

  const week = String(body.week ?? "");
  const franchiseName = String(body.franchise ?? "");
  if (!/^\d{4}-W\d{2}$/.test(week) || !franchiseName) {
    return jsonResponse({ error: "week (YYYY-Www) and franchise are required" }, { status: 400 });
  }

  const franchises = await fetchRows<Franchise>("franchises", [{ op: "eq", field: "name", value: franchiseName }]);
  if (!franchises.some((f) => f.leaderMode === true)) {
    return jsonResponse({ error: "franchise not found or leaderMode off" }, { status: 404 });
  }

  const today = todayYmd();
  if (isoWeekOf(today) === week) {
    return jsonResponse({ error: "cannot close the current week — wait for Sunday 24:00" }, { status: 400 });
  }

  const stored = await listAssessments(franchiseName, week);
  const provisional = stored.filter((row) => row.state === "provisional");
  // Completeness gate = "this city's T+1 report was imported for all 7 days"
  // (2026-10-30). The old per-station check could never pass for a small team
  // that simply had nobody riding on one day — the week stayed open forever.
  // A day counts when it has the T+1 import OR the frozen live ledger.
  const dates = weekIdToDates(week);
  const [weekRows, riders, liveRows] = await Promise.all([loadWeekKpiRows(week), fetchRows<Rider>("riders"), loadLeaderDaily(dates[0], dates[6])]);
  const franchiseRiders = new Set(riders.filter((r) => r.franchise === franchiseName && r.ninetyNineId).map((r) => String(r.ninetyNineId)));
  const merged = mergeLeaderWeekRows({ franchise: franchiseName, dates, t1Rows: weekRows, liveRows, franchiseRider99Ids: franchiseRiders });
  const importedDays = new Set([...merged.t1Dates, ...merged.liveDates]);
  const missingDays = dates.filter((d) => !importedDays.has(d));
  if (missingDays.length > 0) {
    return jsonResponse({ error: "data incomplete — missing T+1 imports for some days", missingDays }, { status: 409 });
  }

  const closedAt = new Date().toISOString();
  await closeWeekAssessments(franchiseName, week, closedAt);
  // NOTE: audit-trail entry moves to the audit fact table with Wave 3
  // (auditEntries lives in memory today; this route must stay memory-free).
  return jsonResponse({ data: { week, franchise: franchiseName, closed: provisional.length } });
}
