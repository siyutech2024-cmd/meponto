/**
 * Restore rider franchise/station assignments from the system's own
 * settlement / pagamento CSV exports (which carry Franquia + Ponto per rider
 * per day) — ground truth for "this rider WAS assigned on that date".
 *
 * For every 99ID in the CSVs, the LATEST dated row wins. Then:
 *   - profile found (by 99ID, else CPF, else phone) and currently
 *     Unassigned → restore franchise/ponto from the CSV
 *   - no profile at all → REBUILD one (name/CPF/PIX/phone/99ID/franchise/
 *     ponto all come from the CSV)
 *   - profile already assigned → untouched, never overwritten
 *
 * SAFE BY DEFAULT — dry run prints the plan and writes nothing:
 *   node scripts/restore-from-settlement.mjs tmp-settlement/*.csv
 * Apply:
 *   node scripts/restore-from-settlement.mjs --apply tmp-settlement/*.csv
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const files = args.filter((a) => a !== "--apply");
if (files.length === 0) {
  console.error("Usage: node scripts/restore-from-settlement.mjs [--apply] <csv files...>");
  process.exit(1);
}

const TABLE = "app_state_records";
function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) env[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  } catch { /* ignore */ }
  return env;
}
const env = loadEnv();
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const digits = (v) => String(v ?? "").replace(/\D/g, "");
const isUnassigned = (v) =>
  !v || v === "Unassigned" || v === "未归属" || v === "未关联" || v === "-" || v === "—" ||
  /^\d+$/.test(String(v).trim()); // an all-digit "franchise" is a shifted-row artifact, not a name
// Known typo fixes seen in the exports.
const fixFranchise = (v) => (String(v ?? "").trim() === "Qualyti" ? "Quality" : String(v ?? "").trim());

// ---- parse CSVs (two header variants; column order differs) ---------------
const latestBy99 = new Map(); // 99id → { date, name, cpf, pix, phone, franchise, ponto }
let rowsRead = 0;
for (const file of files) {
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) continue;
  const header = lines[0].split(",").map((h) => h.trim());
  // Portuguese and Chinese header variants are both accepted.
  const idx = (...names) => header.findIndex((h) => names.includes(h));
  const col = {
    date: idx("Data", "日期"), name: idx("Entregador", "骑手"), id99: idx("99ID"), cpf: idx("CPF"),
    pix: idx("PIX"), phone: idx("Telefone", "电话"), franchise: idx("Franquia", "加盟商"), ponto: idx("Ponto", "站点"),
  };
  if (col.id99 < 0 || col.franchise < 0) {
    console.warn(`skip ${file}: unrecognized header`);
    continue;
  }
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const id99 = digits(cells[col.id99]);
    if (!id99 || id99.length < 10) continue; // real 99 ids are long; short = shifted/corrupt row
    rowsRead++;
    const rec = {
      date: cells[col.date]?.trim() ?? "",
      name: cells[col.name]?.trim() ?? "",
      cpf: cells[col.cpf]?.trim() ?? "",
      pix: col.pix >= 0 ? cells[col.pix]?.trim() ?? "" : "",
      phone: cells[col.phone]?.trim() ?? "",
      franchise: fixFranchise(cells[col.franchise]),
      ponto: cells[col.ponto]?.trim() ?? "",
    };
    if (isUnassigned(rec.franchise) && isUnassigned(rec.ponto)) continue;
    const prev = latestBy99.get(id99);
    if (!prev || rec.date > prev.date) latestBy99.set(id99, rec);
  }
}
console.log(`CSV rows read: ${rowsRead} · distinct riders with an assignment in CSVs: ${latestBy99.size}`);

// ---- load current riders ---------------------------------------------------
async function fetchCollection(name) {
  const out = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const res = await fetch(
      `${url}/rest/v1/${TABLE}?collection=eq.${name}&select=record_id,data&order=updated_at.desc&offset=${from}&limit=${pageSize}`,
      { headers },
    );
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${await res.text()}`);
    const page = await res.json();
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}
const riderRows = await fetchCollection("riders");
console.log(`riders in DB: ${riderRows.length}`);

const by99 = new Map(), byCpf = new Map(), byPhone = new Map();
for (const row of riderRows) {
  const r = row.data;
  if (!r) continue;
  if (r.ninetyNineId) by99.set(digits(r.ninetyNineId), row);
  if (r.cpf) byCpf.set(digits(r.cpf), row);
  if (r.phone) byPhone.set(digits(r.phone), row);
}

// ---- build the plan --------------------------------------------------------
const restore = []; // existing profile, Unassigned → CSV value
const rebuild = []; // no profile at all → create from CSV
const alreadyOk = [];
for (const [id99, rec] of latestBy99) {
  const row = by99.get(id99) ?? byCpf.get(digits(rec.cpf)) ?? byPhone.get(digits(rec.phone)) ?? null;
  if (!row) {
    rebuild.push({ id99, rec });
    continue;
  }
  const r = row.data;
  const needFranchise = isUnassigned(r.franchise) && !isUnassigned(rec.franchise);
  const needPonto = isUnassigned(r.ponto) && !isUnassigned(rec.ponto);
  const need99 = !r.ninetyNineId && id99;
  if (!needFranchise && !needPonto && !need99) {
    alreadyOk.push({ id99, name: r.name });
    continue;
  }
  const next = { ...r };
  if (needFranchise) next.franchise = rec.franchise;
  if (needPonto) next.ponto = rec.ponto;
  if (need99) next.ninetyNineId = id99;
  restore.push({ recordId: row.record_id, name: r.name, from: { franchise: r.franchise, ponto: r.ponto }, rec, next });
}

console.log(`\nAlready correctly assigned (untouched): ${alreadyOk.length}`);
console.log(`\nRESTORE plan (profile exists, assignment missing): ${restore.length}`);
for (const p of restore) {
  console.log(`  ${p.name}: franchise ${p.from.franchise} → ${p.next.franchise} · ponto ${p.from.ponto} → ${p.next.ponto}  (CSV ${p.rec.date})`);
}
console.log(`\nREBUILD plan (no profile in DB, full data from CSV): ${rebuild.length}`);
for (const p of rebuild) {
  console.log(`  ${p.rec.name} (99 ${p.id99}) → ${p.rec.franchise} / ${p.rec.ponto}  (CSV ${p.rec.date})`);
}

if (!APPLY) {
  console.log("\nDry run only. Re-run with --apply to write.");
  process.exit(0);
}

let ok = 0;
for (const p of restore) {
  const res = await fetch(`${url}/rest/v1/${TABLE}?collection=eq.riders&record_id=eq.${encodeURIComponent(p.recordId)}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ data: p.next, updated_at: new Date().toISOString() }),
  });
  if (res.ok) ok++;
  else console.error(`  FAILED ${p.name}: HTTP ${res.status} ${await res.text()}`);
}
console.log(`\nRestored ${ok}/${restore.length} assignments.`);

let created = 0;
for (const p of rebuild) {
  const id = `r-restore-${p.id99}`;
  const rider = {
    id,
    name: p.rec.name, cpf: p.rec.cpf, pix: p.rec.pix, phone: p.rec.phone, bairro: "",
    ponto: isUnassigned(p.rec.ponto) ? "Unassigned" : p.rec.ponto,
    leader: "Unassigned", invitedBy: "settlement-restore", chatRoom: "",
    ar: 100, status: "Active", vehicleType: "", brand: "", model: "", rentalStatus: "",
    isMottu: false, onlineHours: 0, nightShiftCount: 0, incidentCount: 0,
    joinDate: "", ninetyNineId: p.id99,
    franchise: isUnassigned(p.rec.franchise) ? "Unassigned" : p.rec.franchise,
    birthday: "",
  };
  const res = await fetch(`${url}/rest/v1/${TABLE}?on_conflict=collection,record_id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ collection: "riders", record_id: id, data: rider, updated_at: new Date().toISOString() }),
  });
  if (res.ok) created++;
  else console.error(`  REBUILD FAILED ${p.rec.name}: HTTP ${res.status} ${await res.text()}`);
}
console.log(`Rebuilt ${created}/${rebuild.length} profiles. Refresh 骑手管理 to verify.`);
