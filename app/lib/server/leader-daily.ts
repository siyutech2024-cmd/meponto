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
  frozenAt: string;
};

const COLLECTION = "leaderDailyOrders";
const BRT_OFFSET_H = 3;

/** Cities whose riders run leader mode (Boa Vista today). */
const LEADER_CITY_IDS = [CITY_IDS["São João da Boa Vista"]];

export function brtToday(): string {
  return new Date(Date.now() - BRT_OFFSET_H * 3600_000).toISOString().slice(0, 10);
}

type SnapRow = { captured_at: string; rider_ext_id: string | null; rider_name: string | null; finished_cnt: number | null };

async function snapshotsBetween(fromIso: string, toIso: string): Promise<SnapRow[]> {
  const client = getSupabaseServerClient();
  const out: SnapRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await client
      .from("rider_status_snapshots")
      .select("captured_at, rider_ext_id, rider_name, finished_cnt")
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
export async function liveOrdersForDay(date: string): Promise<Map<string, { name: string; orders: number; readings: number }>> {
  const dayStart = new Date(`${date}T0${BRT_OFFSET_H}:00:00Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);
  const lookback = new Date(dayStart.getTime() - 6 * 3600_000); // baseline window
  const rows = await snapshotsBetween(lookback.toISOString(), dayEnd.toISOString());
  const byRider = new Map<string, SnapRow[]>();
  for (const r of rows) {
    if (!r.rider_ext_id || r.finished_cnt == null) continue;
    const list = byRider.get(r.rider_ext_id) ?? [];
    list.push(r);
    byRider.set(r.rider_ext_id, list);
  }
  const result = new Map<string, { name: string; orders: number; readings: number }>();
  const startIso = dayStart.toISOString();
  for (const [ext, list] of byRider) {
    const counted = countDayOrders(list.map((r) => ({ at: r.captured_at, value: Number(r.finished_cnt ?? 0) })), startIso);
    if (counted.readings > 0) result.set(ext, { name: [...list].reverse().find((r) => r.rider_name)?.rider_name ?? "", ...counted });
  }
  return result;
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
export async function freezeLeaderDay(date: string): Promise<{ date: string; riders: number; withStation: number; skipped?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { date, riders: 0, withStation: 0, skipped: "bad date" };
  if (date >= brtToday()) return { date, riders: 0, withStation: 0, skipped: "day not over yet" };

  const [franchises, riders, pontos] = await Promise.all([
    fetchRows<Franchise>("franchises"),
    fetchRows<Rider>("riders"),
    fetchRows<Ponto>("pontos"),
  ]);
  const leaderFranchises = new Set(franchises.filter((f) => f.leaderMode === true).map((f) => f.name));
  if (leaderFranchises.size === 0) return { date, riders: 0, withStation: 0, skipped: "no leader-mode franchise" };

  const live = await liveOrdersForDay(date);
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
  return { date, riders: records.length, withStation: records.filter((r) => r.stationId).length };
}

export async function loadLeaderDaily(from: string, to: string): Promise<LeaderDailyOrders[]> {
  return fetchRows<LeaderDailyOrders>(COLLECTION, [
    { op: "gte", field: "date", value: from },
    { op: "lte", field: "date", value: to },
  ]);
}
