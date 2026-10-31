import { sessionFromRequest } from "../../../lib/auth-session";
import { fetchRows } from "../../../lib/server/db-read";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import { loadLeaderDaily } from "../../../lib/server/leader-daily";
import { defaultLeaderTargets, mergeLeaderWeekRows, rulesForWeek, weekDates } from "../../../lib/leader-mode";
import { CITY_IDS } from "../../../lib/cities";
import type { Ponto, Rider } from "../../../lib/data";
import type { Franchise } from "../../../lib/network";
import type { RiderDailyKpi } from "../../../lib/performance";

/**
 * Leader Mode · "Minha equipe" for the leader's own app (业务方 2026-10-30, 8b).
 *
 * GET (rider session) → the station this rider leads, each member's orders
 * today (live board) and this week (frozen days: T+1 if imported, else the
 * live ledger — the same merge the weekly assessment uses), who is online now,
 * team totals, target progress and the commission estimate.
 *
 * Privacy (design §5 rule 8): no member income, no CPF, phone never sent; the
 * 99 ID is reduced to its last 4 digits. Read-only, memory-free.
 */

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

const LEADER_CITY_IDS = [CITY_IDS["São João da Boa Vista"]];

function statusOf(s: string | null): "delivering" | "online" | "offline" {
  const v = (s ?? "").toLowerCase();
  if (/entreg|em rota/.test(v)) return "delivering";
  if (/desconect|não está online|nao esta online|offline/.test(v)) return "offline";
  return v ? "online" : "offline";
}

export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return json({ error: "Faça login.", code: "unauthenticated" }, 401);

  const [riders, pontos, franchises] = await Promise.all([
    fetchRows<Rider>("riders"),
    fetchRows<Ponto>("pontos"),
    fetchRows<Franchise>("franchises"),
  ]);
  const me = riders.find((r) => r.id === session.userId) ?? riders.find((r) => r.name === session.name);
  if (!me) return json({ error: "Cadastro não encontrado.", code: "not_found" }, 404);
  const station = pontos.find((p) => p.leaderRiderId === me.id && p.stationStatus !== "closed");
  if (!station) return json({ data: { isLeader: false } });
  const franchise = franchises.find((f) => f.name === station.franchise && f.leaderMode === true);
  if (!franchise) return json({ data: { isLeader: false } });

  const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const days = weekDates(today);
  const pastDays = days.filter((d) => d < today);
  const members = riders.filter((r) => r.ponto === station.name && r.franchise === station.franchise && r.ninetyNineId);
  const memberIds = new Set(members.map((r) => String(r.ninetyNineId)));
  const franchiseIds = new Set(riders.filter((r) => r.franchise === franchise.name && r.ninetyNineId).map((r) => String(r.ninetyNineId)));

  // Frozen days of this week, attributed to THIS station (D4).
  const weekByRider = new Map<string, number>();
  if (pastDays.length) {
    const [t1, live] = await Promise.all([
      fetchRows<RiderDailyKpi>("riderDailyKpis", [
        { op: "gte", field: "date", value: pastDays[0] },
        { op: "lte", field: "date", value: pastDays[pastDays.length - 1] },
      ]),
      loadLeaderDaily(pastDays[0], pastDays[pastDays.length - 1]),
    ]);
    const merged = mergeLeaderWeekRows({ franchise: franchise.name, dates: pastDays, t1Rows: t1, liveRows: live, franchiseRider99Ids: franchiseIds });
    for (const row of merged.rows) {
      if (row.stationId !== station.id) continue;
      weekByRider.set(String(row.rider99Id), (weekByRider.get(String(row.rider99Id)) ?? 0) + (row.completedOrders ?? 0));
    }
  }

  // Today so far: the latest live batch (last 30 min) for the members.
  const client = getSupabaseServerClient();
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const latest = await client
    .from("rider_status_snapshots")
    .select("captured_at")
    .in("city_id", LEADER_CITY_IDS)
    .gte("captured_at", since)
    .order("captured_at", { ascending: false })
    .limit(1);
  const batch = (latest.data?.[0] as { captured_at: string } | undefined)?.captured_at ?? null;
  const nowById = new Map<string, { orders: number; status: "delivering" | "online" | "offline"; onlineMins: number }>();
  if (batch && memberIds.size) {
    const { data } = await client
      .from("rider_status_snapshots")
      .select("rider_ext_id, status, finished_cnt, online_mins")
      .eq("captured_at", batch)
      .in("city_id", LEADER_CITY_IDS)
      .in("rider_ext_id", [...memberIds]);
    for (const r of (data ?? []) as Array<{ rider_ext_id: string; status: string | null; finished_cnt: number | null; online_mins: number | null }>) {
      nowById.set(String(r.rider_ext_id), { orders: Number(r.finished_cnt ?? 0), status: statusOf(r.status), onlineMins: Number(r.online_mins ?? 0) });
    }
  }

  const targets = defaultLeaderTargets;
  const rows = members.map((r) => {
    const id = String(r.ninetyNineId);
    const live = nowById.get(id);
    const todayOrders = live?.orders ?? 0;
    const weekOrders = (weekByRider.get(id) ?? 0) + todayOrders;
    return {
      name: r.name,
      id4: id.slice(-4),
      isLeader: r.id === me.id,
      status: live?.status ?? "offline",
      onlineMins: live?.onlineMins ?? 0,
      todayOrders,
      weekOrders,
      active: weekOrders >= targets.minOrdersPerActiveRider,
    };
  }).sort((a, b) => b.weekOrders - a.weekOrders || a.name.localeCompare(b.name));

  const weekOrders = rows.reduce((s, r) => s + r.weekOrders, 0);
  const activeRiders = rows.filter((r) => r.active).length;
  const selfOrders = rows.find((r) => r.isLeader)?.weekOrders ?? 0;
  const selfPct = weekOrders > 0 ? Math.round((selfOrders / weekOrders) * 1000) / 10 : 0;
  const passedSoFar = activeRiders >= targets.minActiveRiders && weekOrders >= targets.minWeeklyOrders && selfPct <= targets.selfOrdersCapPct;
  const rules = rulesForWeek(franchise.leaderSettlementRules, days[0]);
  const base = rules.find((x) => x.key === "base")?.amountBRL ?? 0;
  const bonus = rules.find((x) => x.key === "bonus")?.amountBRL ?? 0;
  const trial = station.stationStatus === "trial";
  const r2 = (n: number) => Math.round(n * 100) / 100;

  return json({
    data: {
      isLeader: true,
      station: { name: station.name, status: station.stationStatus ?? "active", trialStartedAt: station.trialStartedAt ?? null },
      week: { from: days[0], to: days[6], today },
      batchAt: batch,
      targets,
      rates: { base, bonus },
      totals: {
        members: rows.length,
        onlineNow: rows.filter((r) => r.status !== "offline").length,
        deliveringNow: rows.filter((r) => r.status === "delivering").length,
        todayOrders: rows.reduce((s, r) => s + r.todayOrders, 0),
        weekOrders,
        activeRiders,
        selfPct,
      },
      progress: { passedSoFar },
      // Estimate only — the real amount comes from the closed week's order.
      // Trial stations: bonus is paid regardless of targets (decision 2).
      estimate: {
        base: r2(weekOrders * base),
        bonus: r2(weekOrders * bonus),
        bonusCounts: trial || passedSoFar,
        total: r2(weekOrders * base + (trial || passedSoFar ? weekOrders * bonus : 0)),
      },
      members: rows,
    },
  });
}
