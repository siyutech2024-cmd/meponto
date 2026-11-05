import { appendServerAudit, memory } from "./memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "./persistence";
import { getSupabaseServerClient } from "../supabase/server";
import type { Rider } from "../data";

/**
 * Rider assignment recovery (骑手归属取证与恢复).
 *
 * WHY: rider records are written back whole by every route that touches any
 * field, so a write from an instance holding a stale copy silently reverts
 * franchise / station / status to that copy — no audit entry, no error. The
 * symptom (2026-09, again 2026-11): hundreds of long-tenured riders flipping
 * to 未分配 + Inactive. The mutable record cannot be trusted; the APPEND-ONLY
 * audit trail can: every intentional assignment wrote a RIDER_ASSIGNED entry
 * ("<name> → ponto <P> / franchise <F> / <status>."), and audit rows are never
 * rewritten.
 *
 * Two HQ-only tools, both read the database directly (the server has the
 * service key; the sandbox/browser does not):
 *   forensics(): for every unassigned rider — when its row was last written
 *                (updated_at) and what its latest RIDER_ASSIGNED audit says.
 *                Clusters of updated_at pin the write that caused the loss.
 *   restore():   put the audit value back for riders whose latest audit shows
 *                a real assignment. Dry-run by default; `apply` writes +
 *                audits RIDER_ASSIGNMENT_RESTORED.
 */

const UNASSIGNED = new Set(["", "Unassigned", "未归属", "未分配"]);
const isUnassigned = (value: unknown) => UNASSIGNED.has(String(value ?? "").trim());

type AuditRow = { id: string; action: string; entityId: string; detail: string; createdAt: string; actor: string };

/** Parse "<name> → ponto P / franchise F / status." and the Boa Vista variant
 *  "<name> → franchise F / station S(…)" into { franchise, station }. */
export function parseAssignment(detail: string): { franchise: string | null; station: string | null } {
  const franchise = detail.match(/franchise\s+([^/()\n]+?)(?:\s*\/|\s*\(|\s*$)/)?.[1]?.trim() ?? null;
  const station = detail.match(/(?:ponto|station)\s+([^/()\n]+?)(?:\s*\/|\s*\(|\s*$)/)?.[1]?.trim() ?? null;
  return { franchise, station };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

/** RIDER_ASSIGNED audit history per rider id (newest first), straight from
 *  the database. `keep` caps how many entries are retained per rider. */
async function assignmentAuditHistory(riderIds: string[], keep = 3): Promise<Map<string, AuditRow[]>> {
  const client = getSupabaseServerClient();
  const history = new Map<string, AuditRow[]>();
  for (const ids of chunk(riderIds, 150)) {
    const { data, error } = await client
      .from("app_state_records")
      .select("data, updated_at")
      .eq("collection", "auditEntries")
      .eq("data->>action", "RIDER_ASSIGNED")
      .in("data->>entityId", ids)
      .order("updated_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(`audit read: ${error.message}`);
    for (const row of (data ?? []) as Array<{ data: AuditRow }>) {
      const entry = row.data;
      if (!entry?.entityId) continue;
      const list = history.get(entry.entityId) ?? [];
      list.push(entry);
      history.set(entry.entityId, list);
    }
  }
  for (const [id, list] of history) {
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    history.set(id, list.slice(0, keep));
  }
  return history;
}

/** Latest RIDER_ASSIGNED audit per rider id. */
async function latestAssignmentAudits(riderIds: string[]): Promise<Map<string, AuditRow>> {
  const history = await assignmentAuditHistory(riderIds, 1);
  const latest = new Map<string, AuditRow>();
  for (const [id, list] of history) if (list[0]) latest.set(id, list[0]);
  return latest;
}

/** Last database write time per rider id. */
async function riderRowUpdatedAt(riderIds: string[]): Promise<Map<string, string>> {
  const client = getSupabaseServerClient();
  const out = new Map<string, string>();
  for (const ids of chunk(riderIds, 200)) {
    const { data, error } = await client
      .from("app_state_records")
      .select("record_id, updated_at")
      .eq("collection", "riders")
      .in("record_id", ids);
    if (error) throw new Error(`riders read: ${error.message}`);
    for (const row of (data ?? []) as Array<{ record_id: string; updated_at: string }>) out.set(row.record_id, row.updated_at);
  }
  return out;
}

export type ForensicRow = {
  id: string;
  name: string;
  ninetyNineId: string;
  status: string;
  franchise: string;
  ponto: string;
  totalOrdersHint?: number;
  rowUpdatedAt: string | null;
  lastAssignedAt: string | null;
  lastAssignedBy: string | null;
  lastAssignedTo: { franchise: string | null; station: string | null } | null;
  /** Up to 3 most recent RIDER_ASSIGNED audits, newest first — tells a
   *  deliberate two-step offboarding (停用 → 清空归属) apart from a status
   *  toggle that wiped the assignment as collateral. */
  history: Array<{ at: string; by: string; to: { franchise: string | null; station: string | null }; status: string | null }>;
  restorable: boolean;
};

export async function forensics(): Promise<{ rows: ForensicRow[]; updatedAtByHour: Record<string, number>; restorable: number }> {
  await refreshCollectionsFromDatabase(["riders"]);
  const unassigned = (memory.riders as Rider[]).filter((rider) => isUnassigned(rider.franchise));
  const ids = unassigned.map((rider) => rider.id);
  const [updatedAt, histories] = await Promise.all([riderRowUpdatedAt(ids), assignmentAuditHistory(ids, 3)]);
  const rows: ForensicRow[] = unassigned.map((rider) => {
    const list = histories.get(rider.id) ?? [];
    const audit = list[0] ?? null;
    const parsed = audit ? parseAssignment(audit.detail) : null;
    const restorable = !!parsed?.franchise && !isUnassigned(parsed.franchise);
    return {
      id: rider.id,
      name: rider.name,
      ninetyNineId: rider.ninetyNineId ?? "",
      status: rider.status,
      franchise: rider.franchise ?? "",
      ponto: rider.ponto,
      rowUpdatedAt: updatedAt.get(rider.id) ?? null,
      lastAssignedAt: audit?.createdAt ?? null,
      lastAssignedBy: audit?.actor ?? null,
      lastAssignedTo: parsed,
      history: list.map((entry) => ({ at: entry.createdAt, by: entry.actor, to: parseAssignment(entry.detail), status: entry.detail.match(/\/\s*([A-Za-z ]+)\.$/)?.[1]?.trim() ?? null })),
      restorable,
    };
  });
  const updatedAtByHour: Record<string, number> = {};
  for (const row of rows) {
    const key = row.rowUpdatedAt ? row.rowUpdatedAt.slice(0, 13) : "(no row)";
    updatedAtByHour[key] = (updatedAtByHour[key] ?? 0) + 1;
  }
  return { rows, updatedAtByHour, restorable: rows.filter((row) => row.restorable).length };
}

export type RestorePlanItem = { id: string; name: string; ninetyNineId: string; franchise: string; station: string; from: string; basis: string };

/**
 * Restore franchise/station from the latest RIDER_ASSIGNED audit for every
 * rider currently unassigned. Stations are validated against the registry:
 * a station that no longer exists or now belongs to another franchise is
 * dropped (franchise only), never guessed.
 */
export async function restore(options: { apply: boolean; actor: string }): Promise<{ applied: boolean; plan: RestorePlanItem[]; skipped: number }> {
  await refreshCollectionsFromDatabase(["riders", "pontos"]);
  const unassigned = (memory.riders as Rider[]).filter((rider) => isUnassigned(rider.franchise));
  const audits = await latestAssignmentAudits(unassigned.map((rider) => rider.id));
  const plan: RestorePlanItem[] = [];
  let skipped = 0;
  for (const rider of unassigned) {
    const audit = audits.get(rider.id);
    const parsed = audit ? parseAssignment(audit.detail) : null;
    if (!audit || !parsed?.franchise || isUnassigned(parsed.franchise)) {
      skipped += 1;
      continue;
    }
    let station = parsed.station && !isUnassigned(parsed.station) ? parsed.station : "Unassigned";
    if (station !== "Unassigned") {
      const registry = memory.pontos.find((ponto) => ponto.name === station);
      if (!registry || (registry.franchise && registry.franchise !== parsed.franchise)) station = "Unassigned";
    }
    plan.push({ id: rider.id, name: rider.name, ninetyNineId: rider.ninetyNineId ?? "", franchise: parsed.franchise, station, from: audit.createdAt, basis: audit.id });
  }
  if (!options.apply || plan.length === 0) return { applied: false, plan, skipped };

  // Apply on a FRESH copy of each record (re-read right before writing) so
  // this repair can never itself become a stale write.
  await refreshCollectionsFromDatabase(["riders"]);
  for (const item of plan) {
    const index = memory.riders.findIndex((rider) => rider.id === item.id);
    if (index === -1) continue;
    const current = memory.riders[index] as Rider;
    if (!isUnassigned(current.franchise)) continue; // someone fixed it meanwhile
    memory.riders[index] = { ...current, franchise: item.franchise, ponto: item.station };
    appendServerAudit({
      actor: options.actor,
      action: "RIDER_ASSIGNMENT_RESTORED",
      entity: "Rider",
      entityId: item.id,
      detail: `${item.name} → franchise ${item.franchise} / ponto ${item.station} (restored from audit ${item.basis} @ ${item.from}).`,
      risk: "Medium",
    });
  }
  await flushPendingToDatabase();
  return { applied: true, plan, skipped };
}
