import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../../lib/server/persistence";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import type { Rider } from "../../../lib/data";
import { extractRiderPerf } from "../../../lib/eastwind";

/**
 * Live rider monitor feed for the HQ / franchise / station dashboards.
 *
 *   GET /api/eastwind/riders-live?franchise=<name>&ponto=<name>
 *
 * Reads the latest Eastwind snapshot batch (rider_status_snapshots + KPI),
 * joins each rider to its MePonto profile (ninetyNineId → rider_ext_id, else
 * cpf → id_no, else phone) to attach ownership (franchise / ponto / leader),
 * then scopes: HQ → all (unmatched flagged 未归属); franchise/ponto → own only.
 *
 * Returns rows (with a normalized status category + Chinese label) plus
 * per-status / per-franchise / per-ponto summaries and the header KPI.
 */

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

// Normalize Eastwind workStatus → a stable category + Chinese label.
// Categories are fixed so the dashboard columns/cards are always consistent.
type Cat = "delivering" | "online" | "notOnline" | "below" | "outArea" | "other";
const CAT_BY_CODE: Record<string, { cat: Cat; label: string }> = {
  "2": { cat: "delivering", label: "配送中" },
  "4": { cat: "online", label: "在线" },
  "3": { cat: "outArea", label: "不在区域内" },
};
// Classify by status TEXT first (the displayed status), code only as fallback.
// IMPORTANT: "Não está online" (未履约/未上线) contains "online" but is negated,
// so the not-online check must run BEFORE the online check.
function classify(statusCode: string | null, statusStr: string | null): { cat: Cat; label: string } {
  const s = (statusStr || "").toLowerCase();
  if (/entregando|em rota/.test(s)) return { cat: "delivering", label: "配送中" };
  if (/não está online|nao esta online|não conectado|nao conectado|ausente|offline|desconect|未履约|未上线|未在线/.test(s))
    return { cat: "notOnline", label: "未上线" };
  if (/conectado|em pausa|pausa|\bonline\b/.test(s)) return { cat: "online", label: "在线" };
  if (/abaixo|expectativ|不及预期/.test(s)) return { cat: "below", label: "不及预期" };
  if (/fora|área|area|不在区域/.test(s)) return { cat: "outArea", label: "不在区域内" };
  const byCode = statusCode != null ? CAT_BY_CODE[String(statusCode)] : undefined;
  if (byCode) return byCode;
  return { cat: "other", label: statusStr || "未知" };
}
const EMPTY_CATS = () => ({ delivering: 0, online: 0, notOnline: 0, below: 0, outArea: 0, other: 0 });

type SnapshotRow = {
  rider_ext_id: string | null; rider_name: string | null; phone: string | null; id_no: string | null;
  status: string | null; status_code: string | null; shift_start: string | null; shift_end: string | null;
  hot_zone: string | null; vehicle: string | null; online_mins: number | null; rest_mins: number | null;
  finished_cnt: number | null; lat: number | null; lng: number | null;
  error_show: string | null; raw: unknown;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const franchise = url.searchParams.get("franchise")?.trim() || "";
  const ponto = url.searchParams.get("ponto")?.trim() || "";

  const client = getSupabaseServerClient();
  const { data: latest, error: latestErr } = await client
    .from("rider_status_snapshots").select("captured_at").order("captured_at", { ascending: false }).limit(1);
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

  await refreshCollectionsFromDatabase(["riders"]);
  const by99 = new Map<string, Rider>(), byCpf = new Map<string, Rider>(), byPhone = new Map<string, Rider>();
  for (const r of memory.riders as Rider[]) {
    if (r.ninetyNineId) by99.set(String(r.ninetyNineId), r);
    if (r.cpf) byCpf.set(digits(r.cpf), r);
    if (r.phone) byPhone.set(digits(r.phone), r);
  }

  // Auto-materialize profiles for live riders the system doesn't know yet
  // (same pattern as RIDER_MATERIALIZED in /api/riders). They join the rider
  // list as "Unassigned" so operations only has to assign a franchise and
  // complete PIX — no manual onboarding step.
  let materialized = 0;
  for (const s of snapshots) {
    if (!s.rider_ext_id) continue;
    const known =
      by99.get(String(s.rider_ext_id)) ||
      (s.id_no && byCpf.get(digits(s.id_no))) ||
      (s.phone && byPhone.get(digits(s.phone)));
    if (known) continue;
    const rider: Rider = {
      // DETERMINISTIC id derived from the 99 ID: concurrent instances that
      // race to materialize the same rider produce the same record id, so the
      // DB write-through upserts instead of creating duplicates (random ids
      // split one rider's points across two profiles).
      id: `r99-${String(s.rider_ext_id)}`,
      name: s.rider_name || `99 ${s.rider_ext_id}`,
      cpf: s.id_no ?? "",
      pix: "",
      phone: s.phone ?? "",
      bairro: "",
      ponto: "Unassigned",
      leader: "Unassigned",
      invitedBy: "Eastwind 实时看板",
      chatRoom: "MePonto Intake",
      ar: 100,
      status: "Active",
      vehicleType: "Motorcycle",
      brand: "Unknown",
      model: "To confirm",
      rentalStatus: "Unknown",
      isMottu: false,
      onlineHours: 0,
      nightShiftCount: 0,
      incidentCount: 0,
      joinDate: new Date().toISOString().slice(0, 10),
      ninetyNineId: String(s.rider_ext_id),
      franchise: "Unassigned",
      birthday: "",
    };
    memory.riders.unshift(rider);
    by99.set(String(s.rider_ext_id), rider);
    if (rider.phone) byPhone.set(digits(rider.phone), rider);
    if (rider.cpf) byCpf.set(digits(rider.cpf), rider);
    materialized += 1;
    appendServerAudit({ actor: "Eastwind Live", action: "RIDER_MATERIALIZED", entity: "Rider", entityId: rider.id, detail: `Profile auto-created from live board for 99 ${s.rider_ext_id} (${rider.name}).`, risk: "Low" });
  }
  if (materialized > 0) await flushPendingToDatabase();

  const rows = snapshots.map((s) => {
    const match =
      (s.rider_ext_id && by99.get(String(s.rider_ext_id))) ||
      (s.id_no && byCpf.get(digits(s.id_no))) ||
      (s.phone && byPhone.get(digits(s.phone))) || null;
    const { cat, label } = classify(s.status_code, s.status);
    return {
      riderExtId: s.rider_ext_id, name: match?.name || s.rider_name, phone: s.phone,
      status: s.status, statusLabel: label, cat,
      shift: [s.shift_start, s.shift_end].filter(Boolean).join("-"),
      hotZone: s.hot_zone, vehicle: s.vehicle, onlineMins: s.online_mins, restMins: s.rest_mins,
      finishedCnt: s.finished_cnt, lat: s.lat, lng: s.lng,
      franchise: match?.franchise || "", ponto: match?.ponto || "", leader: match?.leader || "",
      // "Unassigned" is the placeholder franchise for auto-materialized
      // profiles — those riders are NOT assigned yet (the 只看未归属 filter
      // was matching nobody because the placeholder string is truthy).
      assigned: Boolean(match && match.franchise && match.franchise !== "Unassigned"),
      // No MePonto profile at all (99 ID / CPF / phone all unmatched) — the
      // riders page surfaces these so operations can onboard + assign.
      // (CPF deliberately NOT exposed here: list endpoints stay masked.)
      matched: Boolean(match),
      // Per-rider "Performance in Current Shift" detail (tolerant extraction
      // from the stored raw record; missing fields are null → shown as N/A).
      perf: extractRiderPerf(s.raw),
    };
  });

  const scoped = rows.filter((r) => {
    if (franchise) return r.franchise === franchise;
    if (ponto) return r.ponto === ponto;
    return true;
  });

  // Summaries.
  const cats = EMPTY_CATS();
  const frAgg: Record<string, { total: number; finished: number } & ReturnType<typeof EMPTY_CATS>> = {};
  const ptAgg: Record<string, { total: number; finished: number } & ReturnType<typeof EMPTY_CATS>> = {};
  for (const r of scoped) {
    cats[r.cat] += 1;
    for (const [key, name] of [["fr", r.franchise || "未归属"], ["pt", r.ponto || "未归属"]] as const) {
      const agg = key === "fr" ? frAgg : ptAgg;
      agg[name] = agg[name] || { total: 0, finished: 0, ...EMPTY_CATS() };
      agg[name].total += 1;
      agg[name].finished += r.finishedCnt || 0;
      agg[name][r.cat] += 1;
    }
  }
  const sortAgg = (agg: typeof frAgg) =>
    Object.entries(agg).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total);

  // Scope-level KPI (franchise/station views): aggregate the per-rider
  // "Performance in Current Shift" counters with Eastwind's OWN formulas —
  //   AR = accepts / (accepts + declines)
  //   CAA = cancels-after-accept / accepts
  //   ATRASO(overtime) = delayed / finished
  //   %TSH = online-minutes-weighted mean of per-rider TSH
  // Count-based (exact) when the counters exist; falls back to the mean of
  // per-rider percentages only where Eastwind omitted counters entirely.
  const scopeKpi = (() => {
    if (!franchise && !ponto) return null; // HQ keeps the city KPI row
    if (scoped.length === 0) return null;
    const r1 = (n: number) => Math.round(n * 10) / 10;
    let accept = 0, declined = 0, cancelled = 0, delayed = 0, finished = 0;
    let arSum = 0, arN = 0, caaSum = 0, caaN = 0, otSum = 0, otN = 0, tshWeighted = 0, tshWeight = 0;
    for (const row of scoped) {
      const p = row.perf;
      if (typeof p.acceptCnt === "number") accept += p.acceptCnt;
      if (typeof p.declinedCnt === "number") declined += p.declinedCnt;
      if (typeof p.cancelledCnt === "number") cancelled += p.cancelledCnt;
      if (typeof p.delayedCnt === "number") delayed += p.delayedCnt;
      finished += row.finishedCnt || 0;
      if (typeof p.ar === "number") { arSum += p.ar; arN += 1; }
      if (typeof p.caa === "number") { caaSum += p.caa; caaN += 1; }
      if (typeof p.overtime === "number") { otSum += p.overtime; otN += 1; }
      if (typeof p.tsh === "number") {
        const weight = row.onlineMins && row.onlineMins > 0 ? row.onlineMins : 1;
        tshWeighted += p.tsh * weight;
        tshWeight += weight;
      }
    }
    const offers = accept + declined;
    return {
      ar: offers > 0 ? r1((accept / offers) * 100) : arN > 0 ? r1(arSum / arN) : null,
      caa: accept > 0 ? r1((cancelled / accept) * 100) : caaN > 0 ? r1(caaSum / caaN) : null,
      acceptCnt: offers > 0 || accept > 0 ? accept : null,
      overtime: finished > 0 ? r1((delayed / finished) * 100) : otN > 0 ? r1(otSum / otN) : null,
      tsh: tshWeight > 0 ? r1(tshWeighted / tshWeight) : null,
      finishedCnt: finished,
    };
  })();

  return jsonResponse({
    data: {
      capturedAt,
      kpi: kpi ? { ar: kpi.ar, caa: kpi.caa, acceptCnt: kpi.accept_cnt, overtime: kpi.overtime, tsh: kpi.tsh, finishedCnt: kpi.finished_cnt } : null,
      scopeKpi,
      riders: scoped,
      summary: {
        total: scoped.length,
        assigned: scoped.filter((r) => r.assigned).length,
        unassigned: scoped.filter((r) => !r.assigned).length,
        finishedTotal: scoped.reduce((sum, r) => sum + (r.finishedCnt || 0), 0),
        cats,
        byFranchise: sortAgg(frAgg),
        byPonto: sortAgg(ptAgg),
      },
    },
  });
}
