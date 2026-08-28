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
  defaultLeaderTargets,
  isoWeekOf,
  weekIdToDates,
  type LeaderAssessment,
} from "../../../lib/leader-mode";
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

  const [pontos, riders, weekRowsAll] = await Promise.all([
    fetchRows<Ponto>("pontos"),
    fetchRows<Rider>("riders"),
    loadWeekKpiRows(week),
  ]);

  const result: Array<{
    franchise: string;
    assessments: LeaderAssessment[];
    /** Rows this week with no station tag but a rider bound to this franchise
     *  today — usually "binding happened after import" (未匹配/待回算队列). */
    untaggedRider99Ids: string[];
  }> = [];

  const toPersist: LeaderAssessment[] = [];
  for (const franchise of franchises) {
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

    result.push({ franchise: franchise.name, assessments, untaggedRider99Ids: Array.from(untagged) });
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
  const incomplete = provisional.filter((row) => row.metrics.dataDays < row.metrics.expectedDataDays);
  if (incomplete.length > 0) {
    return jsonResponse(
      {
        error: "data incomplete — missing T+1 imports for some days",
        stations: incomplete.map((row) => ({
          stationId: row.stationId,
          dataDays: row.metrics.dataDays,
          expected: row.metrics.expectedDataDays,
        })),
      },
      { status: 409 },
    );
  }

  const closedAt = new Date().toISOString();
  await closeWeekAssessments(franchiseName, week, closedAt);
  // NOTE: audit-trail entry moves to the audit fact table with Wave 3
  // (auditEntries lives in memory today; this route must stay memory-free).
  return jsonResponse({ data: { week, franchise: franchiseName, closed: provisional.length } });
}
