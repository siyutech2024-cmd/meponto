import { fetchRows } from "../../../lib/server/db-read";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import { extractRiderPerf, type RiderShiftPerf } from "../../../lib/eastwind";
import type { Rider } from "../../../lib/data";

// Repository-layer route: reads riders via db-read (no in-memory collections).
const jsonResponse = <T,>(data: T, init?: ResponseInit) =>
  Response.json(data, { headers: { "Cache-Control": "no-store" }, ...init });

/**
 * READ-ONLY daily accumulation view for the rider board.
 *
 *   GET /api/eastwind/riders-today?franchise=<name>&ponto=<name>
 *
 * For every rider that appeared in ANY Eastwind snapshot today (São Paulo
 * time), returns their LATEST row of the day — snapshot counters (orders
 * done, online minutes, accepted/declined/cancelled/delayed, AR/%TSH) are
 * already day-cumulative, so "latest row" = "today's totals so far".
 * Riders whose shift ended earlier today are still included (their last
 * appearance is used). Scoping matches riders-live: HQ sees all, franchise
 * and station portals only their own riders.
 */

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const SP_UTC_OFFSET_H = 3; // São Paulo is UTC-3 (no DST since 2019)

type ScanRow = {
  captured_at: string; rider_ext_id: string | null; rider_name: string | null;
  phone: string | null; id_no: string | null; status: string | null;
  shift_start: string | null; shift_end: string | null; hot_zone: string | null;
  vehicle: string | null; online_mins: number | null; rest_mins: number | null;
  finished_cnt: number | null;
  accept_cnt: number | null; declined_cnt: number | null;
  cancelled_cnt: number | null; delayed_cnt: number | null;
  source: string | null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const franchise = url.searchParams.get("franchise")?.trim() || "";
  const ponto = url.searchParams.get("ponto")?.trim() || "";

  // Start of "today" in São Paulo, expressed in UTC.
  const now = new Date();
  const sp = new Date(now.getTime() - SP_UTC_OFFSET_H * 3600_000);
  const dayStart = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), SP_UTC_OFFSET_H)).toISOString();
  const spDate = sp.toISOString().slice(0, 10);

  const client = getSupabaseServerClient();

  // Pass 1: lightweight scan of ALL today's snapshot rows (no raw JSON) to
  // find each rider's latest batch. Paged past PostgREST's 1000-row cap.
  const pageSize = 1000;
  const scan: ScanRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("rider_status_snapshots")
      .select("captured_at, rider_ext_id, rider_name, phone, id_no, status, shift_start, shift_end, hot_zone, vehicle, online_mins, rest_mins, finished_cnt, accept_cnt, declined_cnt, cancelled_cnt, delayed_cnt, source")
      .gte("captured_at", dayStart)
      // captured_at is the BATCH time — every rider in one round shares it, so
      // it is nowhere near unique. Without the id tiebreak, offset paging
      // repeated some snapshot rows and dropped others, and the day board lost
      // riders at random.
      .order("captured_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) return jsonResponse({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    scan.push(...(data as ScanRow[]));
    if (data.length < pageSize) break;
  }

  // IMPORTANT — slot semantics: Eastwind RESETS every counter at the start of
  // each shift slot (11:00-14:00 / 14:00-18:00 / 18:00-22:00). A snapshot is
  // therefore SLOT-cumulative, not day-cumulative. Full-day totals = for each
  // rider, take the LAST snapshot of EACH slot they worked, then SUM across
  // slots. Keyed by rider + slot label; scan is DESC so first hit per key is
  // that slot's final state.
  const riderKeyOf = (r: { rider_ext_id: string | null; phone: string | null; rider_name: string | null }) =>
    r.rider_ext_id || digits(r.phone) || r.rider_name || "";
  const slotOf = (r: { shift_start: string | null; shift_end: string | null }) =>
    [r.shift_start, r.shift_end].filter(Boolean).join("-") || "?";
  const latestBySlot = new Map<string, ScanRow>(); // `${riderKey}|${slot}` → final row of that slot
  // 计数(接单/拒单/取消/超时)的当日累计口径:计数器每班段清零且班段内单调
  // 递增 → **班段内取 MAX**(任何一批抓到都算数,不再依赖"末批恰好点到
  // 卡片"),跨班段相加 = 当日累计。这是"计数器不清零"方案的核心。
  type CntKey = "accept_cnt" | "declined_cnt" | "cancelled_cnt" | "delayed_cnt";
  const CNT_KEYS: CntKey[] = ["accept_cnt", "declined_cnt", "cancelled_cnt", "delayed_cnt"];
  const maxBySlot = new Map<string, Record<CntKey, number | null>>();
  // 模式二规则:出现在 PRO 源(新 Eastwind 账号)快照里的骑手 = PRO。
  const proKeys = new Set<string>();
  for (const row of scan) {
    const key = riderKeyOf(row);
    if (!key) continue;
    if (row.source === "pro") proKeys.add(key);
    const slotKey = `${key}|${slotOf(row)}`;
    if (!latestBySlot.has(slotKey)) latestBySlot.set(slotKey, row);
    const acc = maxBySlot.get(slotKey) ?? { accept_cnt: null, declined_cnt: null, cancelled_cnt: null, delayed_cnt: null };
    for (const k of CNT_KEYS) {
      const v = row[k];
      if (v != null && (acc[k] == null || v > acc[k]!)) acc[k] = v;
    }
    maxBySlot.set(slotKey, acc);
  }

  // Pass 2: fetch raw (per-rider slot perf) only for the batches that hold a
  // slot-final row — the tail batch of each slot plus the newest one.
  const batches = [...new Set([...latestBySlot.values()].map((r) => r.captured_at))].sort().reverse();
  const perfBySlotKey = new Map<string, RiderShiftPerf>();
  for (const batch of batches) {
    const { data } = await client
      .from("rider_status_snapshots")
      .select("captured_at, rider_ext_id, phone, rider_name, shift_start, shift_end, raw")
      .eq("captured_at", batch);
    for (const row of (data ?? []) as Array<{ captured_at: string; rider_ext_id: string | null; phone: string | null; rider_name: string | null; shift_start: string | null; shift_end: string | null; raw: unknown }>) {
      const slotKey = `${riderKeyOf(row)}|${slotOf(row)}`;
      const mine = latestBySlot.get(slotKey);
      if (!mine || mine.captured_at !== batch) continue;
      perfBySlotKey.set(slotKey, extractRiderPerf(row.raw));
    }
  }

  // Ownership join — same matching rules as riders-live, but read through the
  // repository layer instead of the in-memory collections.
  const riderProfiles = await fetchRows<Rider>("riders");
  const by99 = new Map<string, Rider>(), byCpf = new Map<string, Rider>(), byPhone = new Map<string, Rider>();
  for (const r of riderProfiles) {
    if (r.ninetyNineId) by99.set(String(r.ninetyNineId), r);
    if (r.cpf) byCpf.set(digits(r.cpf), r);
    if (r.phone) byPhone.set(digits(r.phone), r);
  }
  const isPlaceholder = (v: string | undefined | null) => !v || v === "Unassigned" || v === "未归属" || v === "未关联";

  // Aggregate slot-final rows into per-rider DAY totals.
  type SlotEntry = { slot: string; row: ScanRow; perf: RiderShiftPerf | null };
  const byRider = new Map<string, SlotEntry[]>();
  for (const [slotKey, row] of latestBySlot) {
    const [key] = [slotKey.slice(0, slotKey.lastIndexOf("|"))];
    const slot = slotKey.slice(slotKey.lastIndexOf("|") + 1);
    const list = byRider.get(key) ?? [];
    list.push({ slot, row, perf: perfBySlotKey.get(slotKey) ?? null });
    byRider.set(key, list);
  }

  const sumOrNull = (vals: Array<number | null | undefined>) => {
    const known = vals.filter((v): v is number => v != null);
    return known.length ? known.reduce((a, b) => a + b, 0) : null;
  };

  const rows = [...byRider.entries()].map(([key, slots]) => {
    // Newest slot row carries identity/status; counters are summed over slots.
    slots.sort((a, b) => b.row.captured_at.localeCompare(a.row.captured_at));
    const s = slots[0].row;
    const match =
      (s.rider_ext_id && by99.get(String(s.rider_ext_id))) ||
      (s.id_no && byCpf.get(digits(s.id_no))) ||
      (s.phone && byPhone.get(digits(s.phone))) || null;
    const fr = match && !isPlaceholder(match.franchise) ? match.franchise : "";
    const pt = match && !isPlaceholder(match.ponto) ? match.ponto : "";
    const onlineMins = sumOrNull(slots.map((x) => x.row.online_mins));
    // 计数来自"班段 MAX"聚合(见上),不再取末批 raw —— 末批没点到卡片时
    // 旧算法会把整个班段算丢。
    const slotMax = (k: CntKey) => sumOrNull(slots.map((x) => maxBySlot.get(`${key}|${x.slot}`)?.[k]));
    const acceptCnt = slotMax("accept_cnt");
    const declinedCnt = slotMax("declined_cnt");
    // Day-level AR is recomputed from the summed counts (rates can't be
    // averaged across slots); %TSH is online-minutes-weighted.
    const ar = acceptCnt != null && declinedCnt != null && acceptCnt + declinedCnt > 0
      ? Math.round((acceptCnt / (acceptCnt + declinedCnt)) * 1000) / 10
      : null;
    const tshParts = slots.filter((x) => x.perf?.tsh != null && x.row.online_mins != null && x.row.online_mins > 0);
    const tshWeight = tshParts.reduce((a, x) => a + (x.row.online_mins as number), 0);
    const tsh = tshWeight > 0
      ? Math.round((tshParts.reduce((a, x) => a + (x.perf!.tsh as number) * (x.row.online_mins as number), 0) / tshWeight) * 10) / 10
      : null;
    return {
      key,
      riderExtId: s.rider_ext_id,
      name: match?.name || s.rider_name,
      phone: s.phone,
      status: s.status,
      // All slots worked today, oldest first (e.g. "11:00-14:00 · 14:00-18:00").
      shift: slots.map((x) => x.slot).filter((x) => x !== "?").reverse().join(" · ") || "—",
      hotZone: s.hot_zone,
      vehicle: s.vehicle,
      onlineMins,
      restMins: sumOrNull(slots.map((x) => x.row.rest_mins)),
      finishedCnt: sumOrNull(slots.map((x) => x.row.finished_cnt)),
      franchise: fr,
      ponto: pt,
      // 模式二: 池标记 —— PRO 源出现过即 PRO(source 是事实),档案匹配兜底。
      pool: proKeys.has(key) || match?.pool === "pro" ? ("pro" as const) : ("standard" as const),
      lastSeenAt: s.captured_at,
      slots: slots.length,
      perf: {
        ar,
        caa: null,
        overtime: null,
        tsh,
        acceptCnt,
        declinedCnt,
        cancelledCnt: slotMax("cancelled_cnt"),
        delayedCnt: slotMax("delayed_cnt"),
        joinTime: null,
      } as RiderShiftPerf,
    };
  });

  const scoped = rows.filter((r) => {
    if (franchise) return r.franchise === franchise;
    if (ponto) return r.ponto === ponto;
    return true;
  });
  scoped.sort((a, b) => (b.finishedCnt ?? 0) - (a.finishedCnt ?? 0));

  const sum = (f: (r: (typeof scoped)[number]) => number | null | undefined) =>
    scoped.reduce((acc, r) => acc + (f(r) ?? 0), 0);

  return jsonResponse({
    data: {
      date: spDate,
      batches: batches.length,
      latestBatch: batches[0] ?? null,
      riders: scoped,
      summary: {
        riders: scoped.length,
        // PRO 小计(金色小字用):与 T+1 看板顶卡同一套"总数 + PRO 其中"口径。
        ridersPro: scoped.filter((r) => r.pool === "pro").length,
        finishedPro: scoped.filter((r) => r.pool === "pro").reduce((acc, r) => acc + (r.finishedCnt ?? 0), 0),
        finished: sum((r) => r.finishedCnt),
        onlineMins: sum((r) => r.onlineMins),
        accepted: sum((r) => r.perf?.acceptCnt),
        declined: sum((r) => r.perf?.declinedCnt),
        cancelled: sum((r) => r.perf?.cancelledCnt),
        delayed: sum((r) => r.perf?.delayedCnt),
      },
    },
  });
}
