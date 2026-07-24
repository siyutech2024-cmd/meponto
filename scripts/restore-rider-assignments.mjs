/**
 * Restore rider franchise/station assignments that were silently reverted by
 * the read-refresh race (fixed in `fix(persistence): saved edits can no longer
 * be reverted by read-refresh races`).
 *
 * Source of truth: the append-only audit trail. Every assignment wrote a
 * RIDER_ASSIGNED entry ("<name> → ponto <P> / franchise <F> / <status>."), and
 * append-only records were never affected by the overwrite race. For each
 * rider currently Unassigned whose LATEST RIDER_ASSIGNED audit shows a real
 * assignment, the audit value is written back.
 *
 * SAFE BY DEFAULT — dry run prints the restore plan and touches nothing:
 *   node scripts/restore-rider-assignments.mjs
 * Apply the plan:
 *   node scripts/restore-rider-assignments.mjs --apply
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or the NEXT_PUBLIC_ URL)
 * from .env.local, same as verify-persistence.mjs.
 */
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const TABLE = "app_state_records";

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) env[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  } catch {
    // ignore
  }
  return env;
}

const env = loadEnv();
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

async function fetchCollection(name) {
  const out = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const res = await fetch(
      `${url}/rest/v1/${TABLE}?collection=eq.${name}&select=record_id,data,updated_at&order=updated_at.desc&offset=${from}&limit=${pageSize}`,
      { headers },
    );
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${await res.text()}`);
    const page = await res.json();
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

const isUnassigned = (v) => !v || v === "Unassigned" || v === "未分配";

const [riderRows, auditRows, kpiRows] = await Promise.all([
  fetchCollection("riders"),
  fetchCollection("auditEntries"),
  fetchCollection("riderDailyKpis"),
]);
console.log(`riders in DB: ${riderRows.length} · audit entries: ${auditRows.length} · daily KPI rows: ${kpiRows.length}`);

// Latest RIDER_ASSIGNED per rider id. Audit detail format (assign route):
//   "<name> → ponto <P> / franchise <F> / <status>."
const latestAssign = new Map();
// Rider ids intentionally removed by the duplicate-merge (data lives in the
// primary record) — these are NOT losses.
const mergedAway = new Set();
// 99 id per rider id, recovered from creation audits:
//   RIDER_CREATED:      "<name> (<99id|sem 99 ID>) → <ponto>."
//   RIDER_MATERIALIZED: "Profile created from daily reports for 99 <id> (<name>)."
const ninetyNineById = new Map();
for (const row of auditRows) {
  const a = row.data;
  if (!a?.action || !a.entityId) continue;
  const detail = String(a.detail ?? "");
  const stamp = a.createdAt ?? a.timestamp ?? a.at ?? row.updated_at ?? "";
  if (a.action === "RIDER_ASSIGNED") {
    const m = detail.match(/^(.*?) → ponto (.*?) \/ franchise (.*?) \/ (.*?)\.?$/);
    if (!m) continue;
    const prev = latestAssign.get(a.entityId);
    if (!prev || String(stamp) > String(prev.stamp)) {
      latestAssign.set(a.entityId, { name: m[1].trim(), ponto: m[2].trim(), franchise: m[3].trim(), status: m[4].trim(), stamp });
    }
  } else if (a.action === "RIDER_DUPLICATE_MERGED") {
    const m = detail.match(/merged duplicate (\S+) into (\S+)/);
    if (m) mergedAway.add(m[1]);
  } else if (a.action === "RIDER_CREATED") {
    const m = detail.match(/\((\d{6,})\)/);
    if (m) ninetyNineById.set(a.entityId, m[1]);
  } else if (a.action === "RIDER_MATERIALIZED") {
    const m = detail.match(/for 99 (\d{6,})/);
    if (m) ninetyNineById.set(a.entityId, m[1]);
  }
}
console.log(`riders with RIDER_ASSIGNED history: ${latestAssign.size} · merged-away ids: ${mergedAway.size}`);

// ---- Part 1: rider records that VANISHED despite having been assigned ------
const existingIds = new Set(riderRows.map((r) => r.data?.id).filter(Boolean));
// Latest daily-report row per 99 id → cpf/phone/name backfill for rebuilds.
const kpiBy99 = new Map();
for (const row of kpiRows) {
  const k = row.data;
  if (!k?.rider99Id) continue;
  const prev = kpiBy99.get(k.rider99Id);
  if (!prev || String(k.date) > String(prev.date)) kpiBy99.set(k.rider99Id, k);
}

// Guard: if the same 99 id already lives on a CURRENT rider profile, the
// rider was re-created under a new id — rebuilding the old id would create a
// duplicate. Skip those (they may only need a re-assign on the new record,
// which Part 2 handles).
const current99 = new Set(riderRows.map((r) => r.data?.ninetyNineId).filter(Boolean));

const missing = [];
const skipped99 = [];
for (const [riderId, assign] of latestAssign) {
  if (existingIds.has(riderId) || mergedAway.has(riderId)) continue;
  const ext = ninetyNineById.get(riderId) ?? null;
  if (ext && current99.has(ext)) {
    skipped99.push({ riderId, ext, ...assign });
    continue;
  }
  const kpi = ext ? kpiBy99.get(ext) : null;
  missing.push({ riderId, ext, kpi, ...assign });
}
missing.sort((a, b) => String(b.stamp).localeCompare(String(a.stamp)));

console.log(`\nVANISHED rider profiles that HAD assignments: ${missing.length}`);
for (const p of missing) {
  console.log(`  ${p.name} (99 ${p.ext ?? "?"}) → franchise ${p.franchise} · ponto ${p.ponto} · last assigned ${p.stamp}`);
}
if (skipped99.length) {
  console.log(`\nSkipped (99 id already lives on a current profile — no rebuild needed): ${skipped99.length}`);
  for (const p of skipped99) console.log(`  ${p.name} (99 ${p.ext})`);
}

const plan = [];
for (const row of riderRows) {
  const rider = row.data;
  if (!rider || typeof rider.id !== "string") continue;
  const audit = latestAssign.get(rider.id);
  if (!audit) continue;
  // Restore ONLY when the audit shows a real assignment that the current
  // record no longer has. Never touch records that already hold a value.
  const needFranchise = isUnassigned(rider.franchise) && !isUnassigned(audit.franchise);
  const needPonto = isUnassigned(rider.ponto) && !isUnassigned(audit.ponto);
  if (!needFranchise && !needPonto) continue;
  const next = { ...rider };
  if (needFranchise) next.franchise = audit.franchise;
  if (needPonto) next.ponto = audit.ponto;
  plan.push({ recordId: row.record_id, name: rider.name, from: { franchise: rider.franchise, ponto: rider.ponto }, to: { franchise: next.franchise, ponto: next.ponto }, next, stamp: audit.stamp });
}

// ---- Part 3: 99-ID MISMATCH detection ------------------------------------
// Same human, two rows: an ASSIGNED profile whose stored ninetyNineId no
// longer matches the id used by current daily reports (Eastwind has both long
// 65091… and short ids), plus an "unassigned report face" row for the new id.
// Detected by exact normalized full-name match.
const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

const profileByName = new Map();
for (const row of riderRows) {
  const r = row.data;
  if (!r?.name) continue;
  profileByName.set(norm(r.name), r);
}
const reportFace99 = new Set();
for (const [id99] of kpiBy99) {
  if (!current99.has(id99)) reportFace99.add(id99);
}
const mismatches = [];
for (const id99 of reportFace99) {
  const kpi = kpiBy99.get(id99);
  const prof = profileByName.get(norm(kpi?.riderName));
  if (!prof) continue;
  const assigned = !isUnassigned(prof.franchise) || !isUnassigned(prof.ponto);
  mismatches.push({ id99, name: kpi.riderName, prof, assigned });
}
console.log(`\n99-ID MISMATCH candidates (report id has no profile, but a profile with the SAME NAME exists): ${mismatches.length}`);
for (const m of mismatches) {
  console.log(`  ${m.name}: report 99 ${m.id99} vs profile 99 ${m.prof.ninetyNineId || "(empty)"} · profile franchise=${m.prof.franchise} ponto=${m.prof.ponto}${m.assigned ? "  ← ASSIGNED profile split from its report row" : ""}`);
}

console.log(`\nField-restore plan (existing records whose assignment was reverted): ${plan.length}`);
for (const p of plan) {
  console.log(`  ${p.name}: franchise ${p.from.franchise ?? "—"} → ${p.to.franchise} · ponto ${p.from.ponto ?? "—"} → ${p.to.ponto}  (last assigned ${p.stamp})`);
}

if (plan.length === 0 && missing.length === 0) {
  console.log("\nNothing to restore.");
  process.exit(0);
}

if (!APPLY) {
  console.log(`\nDry run only. Re-run with --apply to: restore ${plan.length} reverted assignments and REBUILD ${missing.length} vanished profiles (original ids kept, so points/ledger references stay intact).`);
  process.exit(0);
}

let ok = 0;
for (const p of plan) {
  const res = await fetch(`${url}/rest/v1/${TABLE}?collection=eq.riders&record_id=eq.${encodeURIComponent(p.recordId)}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ data: p.next, updated_at: new Date().toISOString() }),
  });
  if (res.ok) ok++;
  else console.error(`  FAILED ${p.name}: HTTP ${res.status} ${await res.text()}`);
}
console.log(`\nRestored ${ok}/${plan.length} reverted assignments.`);

// Rebuild vanished profiles under their ORIGINAL id. Only fields recoverable
// from audits + daily reports are set; the rest use safe defaults.
let rebuilt = 0;
for (const p of missing) {
  const rider = {
    id: p.riderId,
    name: p.kpi?.riderName || p.name,
    cpf: p.kpi?.cpf ?? "",
    pix: "",
    phone: p.kpi?.phone ?? "",
    bairro: "",
    ponto: p.ponto,
    leader: "Unassigned",
    invitedBy: "restore-script",
    chatRoom: "",
    ar: p.kpi?.ar ?? 100,
    status: p.status && p.status !== "undefined" ? p.status : "Active",
    vehicleType: "",
    brand: "",
    model: "",
    rentalStatus: "",
    isMottu: false,
    onlineHours: 0,
    nightShiftCount: 0,
    incidentCount: 0,
    joinDate: "",
    ninetyNineId: p.ext ?? "",
    franchise: p.franchise,
    birthday: "",
  };
  const res = await fetch(`${url}/rest/v1/${TABLE}?on_conflict=collection,record_id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ collection: "riders", record_id: p.riderId, data: rider, updated_at: new Date().toISOString() }),
  });
  if (res.ok) rebuilt++;
  else console.error(`  REBUILD FAILED ${p.name}: HTTP ${res.status} ${await res.text()}`);
}
console.log(`Rebuilt ${rebuilt}/${missing.length} vanished profiles. Refresh the 骑手管理 page to verify.`);
