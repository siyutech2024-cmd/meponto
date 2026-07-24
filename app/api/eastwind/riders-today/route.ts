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
      .select("captured_at, rider_ext_id, rider_name, phone, id_no, status, shift_start, shift_end, hot_zone, vehicle, online_mins, rest_mins, finished_cnt")
      .gte("captured_at", dayStart)
      .order("captured_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) return jsonResponse({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    scan.push(...(data as ScanRow[]));
    if (data.length < pageSize) break;
  }

  // Latest row per rider (key: ext id, else phone, else name). Scan is DESC,
  // so the first occurrence IS the latest.
  const latest = new Map<string, ScanRow>();
  for (const row of scan) {
    const key = row.rider_ext_id || digits(row.phone) || row.rider_name || "";
    if (!key || latest.has(key)) continue;
    latest.set(key, row);
  }

  // Pass 2: fetch raw (per-rider perf) only for the batches that actually
  // hold someone's latest row — usually just the newest few.
  const batches = [...new Set([...latest.values()].map((r) => r.captured_at))].sort().reverse();
  const perfByKey = new Map<string, RiderShiftPerf>();
  for (const batch of batches) {
    const { data } = await client
      .from("rider_status_snapshots")
      .select("captured_at, rider_ext_id, phone, rider_name, raw")
      .eq("captured_at", batch);
    for (const row of (data ?? []) as Array<{ rider_ext_id: string | null; phone: string | null; rider_name: string | null; raw: unknown }>) {
      const key = row.rider_ext_id || digits(row.phone) || row.rider_name || "";
      const mine = latest.get(key);
      if (!mine || mine.captured_at !== batch) continue;
      perfByKey.set(key, extractRiderPerf(row.raw));
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

  const rows = [...latest.entries()].map(([key, s]) => {
    const match =
      (s.rider_ext_id && by99.get(String(s.rider_ext_id))) ||
      (s.id_no && byCpf.get(digits(s.id_no))) ||
      (s.phone && byPhone.get(digits(s.phone))) || null;
    const fr = match && !isPlaceholder(match.franchise) ? match.franchise : "";
    const pt = match && !isPlaceholder(match.ponto) ? match.ponto : "";
    return {
      key,
      riderExtId: s.rider_ext_id,
      name: match?.name || s.rider_name,
      phone: s.phone,
      status: s.status,
      shift: [s.shift_start, s.shift_end].filter(Boolean).join("-"),
      hotZone: s.hot_zone,
      vehicle: s.vehicle,
      onlineMins: s.online_mins,
      restMins: s.rest_mins,
      finishedCnt: s.finished_cnt,
      franchise: fr,
      ponto: pt,
      lastSeenAt: s.captured_at,
      perf: perfByKey.get(key) ?? null,
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
