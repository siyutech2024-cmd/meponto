import { jsonResponse, memory } from "../../../lib/server/memory";
import { refreshCollectionsFromDatabase } from "../../../lib/server/persistence";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import type { Rider } from "../../../lib/data";

/**
 * Live rider monitor feed for the HQ / franchise / station dashboards.
 *
 *   GET /api/eastwind/riders-live?franchise=<name>&ponto=<name>
 *
 * Reads the latest Eastwind snapshot batch (rider_status_snapshots + KPI),
 * joins each rider to its MePonto profile (ninetyNineId → rider_ext_id, else
 * cpf → id_no, else phone) to attach ownership (franchise / ponto / leader),
 * then scopes:
 *   - HQ (no params)      → all riders, unmatched ones flagged 未归属
 *   - franchise=<name>    → only that franchise's riders
 *   - ponto=<name>        → only that station's riders
 *
 * Returns rows + status/franchise/ponto summaries + the header KPI snapshot.
 */

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

type SnapshotRow = {
  rider_ext_id: string | null;
  rider_name: string | null;
  phone: string | null;
  id_no: string | null;
  status: string | null;
  status_code: string | null;
  shift_start: string | null;
  shift_end: string | null;
  hot_zone: string | null;
  vehicle: string | null;
  online_mins: number | null;
  rest_mins: number | null;
  finished_cnt: number | null;
  lat: number | null;
  lng: number | null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const franchise = url.searchParams.get("franchise")?.trim() || "";
  const ponto = url.searchParams.get("ponto")?.trim() || "";

  const client = getSupabaseServerClient();

  // Latest batch timestamp.
  const { data: latest, error: latestErr } = await client
    .from("rider_status_snapshots")
    .select("captured_at")
    .order("captured_at", { ascending: false })
    .limit(1);
  if (latestErr) return jsonResponse({ error: latestErr.message }, { status: 500 });
  const capturedAt = latest?.[0]?.captured_at ?? null;

  let snapshots: SnapshotRow[] = [];
  let kpi: Record<string, unknown> | null = null;
  if (capturedAt) {
    const [{ data: snaps }, { data: kpis }] = await Promise.all([
      client.from("rider_status_snapshots").select("*").eq("captured_at", capturedAt),
      client.from("rider_kpi_snapshots").select("*").eq("captured_at", capturedAt).limit(1),
    ]);
    snapshots = (snaps ?? []) as SnapshotRow[];
    kpi = (kpis?.[0] as Record<string, unknown>) ?? null;
  }

  // Build rider-profile lookups for ownership join.
  await refreshCollectionsFromDatabase(["riders"]);
  const by99 = new Map<string, Rider>();
  const byCpf = new Map<string, Rider>();
  const byPhone = new Map<string, Rider>();
  for (const r of memory.riders as Rider[]) {
    if (r.ninetyNineId) by99.set(String(r.ninetyNineId), r);
    if (r.cpf) byCpf.set(digits(r.cpf), r);
    if (r.phone) byPhone.set(digits(r.phone), r);
  }

  const rows = snapshots.map((s) => {
    const match =
      (s.rider_ext_id && by99.get(String(s.rider_ext_id))) ||
      (s.id_no && byCpf.get(digits(s.id_no))) ||
      (s.phone && byPhone.get(digits(s.phone))) ||
      null;
    const ownerFranchise = match?.franchise || "";
    const ownerPonto = match?.ponto || "";
    return {
      riderExtId: s.rider_ext_id,
      name: match?.name || s.rider_name,
      phone: s.phone,
      status: s.status,
      statusCode: s.status_code,
      shift: [s.shift_start, s.shift_end].filter(Boolean).join("-"),
      hotZone: s.hot_zone,
      vehicle: s.vehicle,
      onlineMins: s.online_mins,
      restMins: s.rest_mins,
      finishedCnt: s.finished_cnt,
      lat: s.lat,
      lng: s.lng,
      franchise: ownerFranchise,
      ponto: ownerPonto,
      leader: match?.leader || "",
      assigned: Boolean(match && ownerFranchise),
    };
  });

  // Scope by portal.
  const scoped = rows.filter((r) => {
    if (franchise) return r.franchise === franchise;
    if (ponto) return r.ponto === ponto;
    return true; // HQ: everything, including 未归属
  });

  // Summaries.
  const statusCounts: Record<string, number> = {};
  const franchiseAgg: Record<string, { online: number; finished: number }> = {};
  const pontoAgg: Record<string, { online: number; finished: number }> = {};
  for (const r of scoped) {
    const st = r.status || "未知";
    statusCounts[st] = (statusCounts[st] || 0) + 1;
    const fr = r.franchise || "未归属";
    franchiseAgg[fr] = franchiseAgg[fr] || { online: 0, finished: 0 };
    franchiseAgg[fr].online += 1;
    franchiseAgg[fr].finished += r.finishedCnt || 0;
    const pt = r.ponto || "未归属";
    pontoAgg[pt] = pontoAgg[pt] || { online: 0, finished: 0 };
    pontoAgg[pt].online += 1;
    pontoAgg[pt].finished += r.finishedCnt || 0;
  }
  const toSorted = (agg: Record<string, { online: number; finished: number }>) =>
    Object.entries(agg)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.online - a.online);

  return jsonResponse({
    data: {
      capturedAt,
      kpi: kpi
        ? {
            ar: kpi.ar, caa: kpi.caa, acceptCnt: kpi.accept_cnt,
            overtime: kpi.overtime, tsh: kpi.tsh, finishedCnt: kpi.finished_cnt,
          }
        : null,
      riders: scoped,
      summary: {
        total: scoped.length,
        assigned: scoped.filter((r) => r.assigned).length,
        unassigned: scoped.filter((r) => !r.assigned).length,
        statusCounts,
        byFranchise: toSorted(franchiseAgg),
        byPonto: toSorted(pontoAgg),
      },
    },
  });
}
