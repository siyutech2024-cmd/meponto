/**
 * Leader Mode · daily live order ledger (业务方 2026-10-30, decision 6).
 *
 * Until Boa Vista's T+1 report is imported, the leader assessment counts each
 * rider's orders from the realtime board. Once a day (cron, 00:10 São Paulo)
 * the previous day is FROZEN into `leaderDailyOrders` — one record per rider
 * per day, stamped with the leader station the rider belonged to at freeze
 * time (design D4: attribution is fixed when recorded, never re-attributed).
 *
 * APPEND-ONLY: records are inserted with ignoreDuplicates — an existing day is
 * never rewritten (re-running a day is a no-op). Separate collection, so T+1
 * rows (riderDailyKpis) are never touched; for any day that HAS a T+1 import,
 * the assessment uses T+1 and ignores these (see mergeLeaderWeekRows).
 *
 * Counting: the board shows a running counter per rider that may reset (shift
 * slot / platform day). Orders for day D = sum of the counter's increases
 * inside D, where a drop counts as a reset (the new value is all new work),
 * starting from the rider's last reading before D (so a counter that does not
 * reset at midnight isn't double-counted).
 */

import { getSupabaseServerClient } from "../supabase/server";
import { fetchRows } from "./db-read";
import type { Ponto, Rider } from "../data";
import type { Franchise } from "../network";
import { CITY_IDS } from "../cities";

export type LeaderDailyOrders = {
  id: string; // `ldo-${date}-${rider99Id}`
  date: string; // YYYY-MM-DD (São Paulo)
  rider99Id: string;
  riderName: string;
  completedOrders: number;
  stationId?: string;
  stationName?: string;
  stationFranchise: string;
  source: "live";
  readings: number; // snapshot rows seen that day (evidence)
  /** Online minutes that day (sum over shifts, same reset rule as orders).
   *  Present on days frozen from 2026-11-03 on; older records lack it. */
  onlineMins?: number;
  frozenAt: string;
};

const COLLECTION = "leaderDailyOrders";
const BRT_OFFSET_H = 3;

/** Cities whose riders run leader mode (Boa Vista today). */
const LEADER_CITY_IDS = [CITY_IDS["São João da Boa Vista"]];

export function brtToday(): string {
  return new Date(Date.now() - BRT_OFFSET_H * 3600_000).toISOString().slice(0, 10);
}

type SnapRow = { captured_at: string; rider_ext_id: string | null; rider_name: string | null; finished_cnt: number | null; online_mins: number | null; phone: string | null; id_no: string | null };
export type LiveDayRider = { name: string; orders: number; readings: number; onlineMins: number; phone: string | null; idNo: string | null };

async function snapshotsBetween(fromIso: string, toIso: string): Promise<SnapRow[]> {
  const client = getSupabaseServerClient();
  const out: SnapRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await client
      .from("rider_status_snapshots")
      .select("captured_at, rider_ext_id, rider_name, finished_cnt, online_mins, phone, id_no")
      .in("city_id", LEADER_CITY_IDS)
      .gte("captured_at", fromIso)
      .lt("captured_at", toIso)
      .order("captured_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(`snapshots: ${error.message}`);
    out.push(...((data ?? []) as SnapRow[]));
    if (!data || data.length < page) break;
  }
  return out;
}

/** Orders per rider for one São Paulo calendar day, from the realtime board. */
export async function liveOrdersForDay(date: string): Promise<Map<string, LiveDayRider>> {
  const dayStart = new Date(`${date}T0${BRT_OFFSET_H}:00:00Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);
  const lookback = new Date(dayStart.getTime() - 6 * 3600_000); // baseline window
  const rows = await snapshotsBetween(lookback.toISOString(), dayEnd.toISOString());
  const byRider = new Map<string, SnapRow[]>();
  for (const r of rows) {
    if (!r.rider_ext_id) continue;
    const list = byRider.get(r.rider_ext_id) ?? [];
    list.push(r);
    byRider.set(r.rider_ext_id, list);
  }
  const result = new Map<string, LiveDayRider>();
  const startIso = dayStart.toISOString();
  for (const [ext, list] of byRider) {
    const withCount = list.filter((r) => r.finished_cnt != null);
    const counted = countDayOrders(withCount.map((r) => ({ at: r.captured_at, value: Number(r.finished_cnt ?? 0) })), startIso);
    // Online minutes: the board's per-shift counter, same increase/reset rule.
    const online = countDayOrders(list.filter((r) => r.online_mins != null).map((r) => ({ at: r.captured_at, value: Number(r.online_mins ?? 0) })), startIso);
    const inDay = list.filter((r) => Date.parse(r.captured_at) >= Date.parse(startIso));
    if (inDay.length === 0) continue; // only seen in the look-back window
    const last = [...inDay].reverse();
    result.set(ext, {
      name: last.find((r) => r.rider_name)?.rider_name ?? "",
      orders: counted.orders,
      readings: inDay.length,
      onlineMins: online.orders,
      phone: last.find((r) => r.phone)?.phone ?? null,
      idNo: last.find((r) => r.id_no)?.id_no ?? null,
    });
  }
  return result;
}

/**
 * The newest realtime batch for the leader-mode city (last 30 min): each
 * rider's counters as the board shows them right now — today's orders and
 * online minutes so far. One small query; used for "today, live" views.
 */
export async function latestCityBatch(): Promise<{ batchAt: string; riders: Map<string, { name: string; orders: number; onlineMins: number; status: string | null }> } | null> {
  const client = getSupabaseServerClient();
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const latest = await client
    .from("rider_status_snapshots")
    .select("captured_at")
    .in("city_id", LEADER_CITY_IDS)
    .gte("captured_at", since)
    .order("captured_at", { ascending: false })
    .limit(1);
  const batchAt = (latest.data?.[0] as { captured_at: string } | undefined)?.captured_at;
  if (!batchAt) return null;
  const { data, error } = await client
    .from("rider_status_snapshots")
    .select("rider_ext_id, rider_name, finished_cnt, online_mins, status")
    .eq("captured_at", batchAt)
    .in("city_id", LEADER_CITY_IDS);
  if (error) throw new Error(`latest batch: ${error.message}`);
  const riders = new Map<string, { name: string; orders: number; onlineMins: number; status: string | null }>();
  for (const r of (data ?? []) as Array<{ rider_ext_id: string | null; rider_name: string | null; finished_cnt: number | null; online_mins: number | null; status: string | null }>) {
    if (!r.rider_ext_id) continue;
    riders.set(String(r.rider_ext_id), { name: r.rider_name ?? "", orders: Number(r.finished_cnt ?? 0), onlineMins: Number(r.online_mins ?? 0), status: r.status });
  }
  return { batchAt, riders };
}

/**
 * Pure counter → orders for one day. `readings` sorted by time; readings
 * before `dayStartIso` only set the baseline. Increases are new orders; a drop
 * is a counter reset, so the new value itself is new orders.
 */
export function countDayOrders(readings: Array<{ at: string; value: number }>, dayStartIso: string): { orders: number; readings: number } {
  let prev: number | null = null;
  let orders = 0;
  let count = 0;
  const startMs = Date.parse(dayStartIso); // compare as instants — DB returns "+00:00", we write "Z"
  for (const r of readings) {
    if (Date.parse(r.at) < startMs) {
      prev = r.value;
      continue;
    }
    count += 1;
    if (prev === null) orders += r.value; // first reading of the day, no baseline
    else if (r.value >= prev) orders += r.value - prev;
    else orders += r.value; // counter reset
    prev = r.value;
  }
  return { orders, readings: count };
}

/**
 * Freeze one past day. Insert-only: a day already frozen keeps its records.
 * Returns how many records were offered for insert.
 */
export async function freezeLeaderDay(date: string): Promise<{ date: string; riders: number; withStation: number; pointsCredited?: number; points?: number; roster?: { created: number; bound: number; marked?: number }; skipped?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { date, riders: 0, withStation: 0, skipped: "bad date" };
  if (date >= brtToday()) return { date, riders: 0, withStation: 0, skipped: "day not over yet" };

  const live = await liveOrdersForDay(date);

  // Roster check (业务方 2026-11-03: every rider in the online records must be
  // in the Boa Vista riders list): the same binding the live feed runs, over
  // the whole day — creates missing profiles in the pool station, marks
  // riders whose profile belongs elsewhere as seen in Boa Vista. Never moves
  // a rider off another franchise.
  let roster: { created: number; bound: number; marked?: number } | null = null;
  if (live.size) {
    const { bindBoaVistaRiders } = await import("./boavista-binding");
    const feed = [...live.entries()].map(([ext, v]) => ({ rider_ext_id: ext, rider_name: v.name, phone: v.phone, id_no: v.idNo }));
    roster = await bindBoaVistaRiders(feed, date);
    if (roster.created || roster.bound || roster.marked || (roster as { stationed?: number }).stationed) {
      const { flushPendingToDatabase } = await import("./persistence");
      await flushPendingToDatabase();
    }
  }

  const [franchises, riders, pontos] = await Promise.all([
    fetchRows<Franchise>("franchises"),
    fetchRows<Rider>("riders"),
    fetchRows<Ponto>("pontos"),
  ]);
  const leaderFranchises = new Set(franchises.filter((f) => f.leaderMode === true).map((f) => f.name));
  if (leaderFranchises.size === 0) return { date, riders: 0, withStation: 0, skipped: "no leader-mode franchise" };
  const by99 = new Map(riders.filter((r) => r.ninetyNineId).map((r) => [String(r.ninetyNineId), r]));
  const now = new Date().toISOString();
  const records: LeaderDailyOrders[] = [];
  for (const [ext, v] of live) {
    const rider = by99.get(ext);
    if (!rider?.franchise || !leaderFranchises.has(rider.franchise)) continue;
    const station = rider.ponto && rider.ponto !== "Unassigned" ? pontos.find((p) => p.name === rider.ponto && p.franchise === rider.franchise) : undefined;
    records.push({
      id: `ldo-${date}-${ext}`,
      date,
      rider99Id: ext,
      riderName: rider.name || v.name,
      completedOrders: v.orders,
      ...(station ? { stationId: station.id, stationName: station.name } : {}),
      stationFranchise: rider.franchise,
      source: "live",
      readings: v.readings,
      onlineMins: v.onlineMins,
      frozenAt: now,
    });
  }
  if (records.length) {
    const client = getSupabaseServerClient();
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500).map((r) => ({ collection: COLLECTION, record_id: r.id, data: r, updated_at: now }));
      const { error } = await client.from("app_state_records").upsert(chunk, { onConflict: "collection,record_id", ignoreDuplicates: true });
      if (error) throw new Error(`leaderDailyOrders: ${error.message}`);
    }
  }
  // Order points (1 per order) from what is STORED for the day — a re-run
  // credits the frozen counts, never a fresh recount. Insert-only.
  const { creditLeaderDailyPoints } = await import("./leader-points");
  const pts = await creditLeaderDailyPoints(await loadLeaderDaily(date, date));
  return { date, riders: records.length, withStation: records.filter((r) => r.stationId).length, pointsCredited: pts.credited, points: pts.points, ...(roster ? { roster } : {}) };
}

export async function loadLeaderDaily(from: string, to: string): Promise<LeaderDailyOrders[]> {
  return fetchRows<LeaderDailyOrders>(COLLECTION, [
    { op: "gte", field: "date", value: from },
    { op: "lte", field: "date", value: to },
  ]);
}
