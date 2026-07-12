import { getSupabaseServerClient } from "../../supabase/server";

/**
 * M0 repository-layer foundation (docs/data-core-cure-plan.md §4 S1/S2).
 * Generic typed-table access used by every wave's repository — routes never
 * touch supabase-js directly, so the cutover is mechanical.
 *
 * Per-module rollout flag (CLAUDE.md guardrail #3 — default OFF):
 *   CORE_MODE_<MODULE>=off        → legacy memory path only (default)
 *   CORE_MODE_<MODULE>=dualwrite  → write both, read legacy, shadow-compare
 *   CORE_MODE_<MODULE>=read       → new table is the read source
 */
export type CoreMode = "off" | "dualwrite" | "read";

export function coreMode(module: string): CoreMode {
  const raw = String(process.env[`CORE_MODE_${module.toUpperCase()}`] ?? "off").toLowerCase();
  return raw === "read" ? "read" : raw === "dualwrite" ? "dualwrite" : "off";
}

const PAGE = 1000; // PostgREST max-rows page size.

export type Where = Record<string, string | number | boolean | null>;

function applyWhere<Q extends { eq: (c: string, v: unknown) => Q; is: (c: string, v: null) => Q }>(query: Q, where?: Where): Q {
  for (const [column, value] of Object.entries(where ?? {})) {
    query = value === null ? query.is(column, null) : query.eq(column, value);
  }
  return query;
}

export async function insertRows(table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await getSupabaseServerClient().from(table).insert(rows);
  if (error) throw new Error(`insert ${table}: ${error.message}`);
}

export async function upsertRows(table: string, rows: Record<string, unknown>[], onConflict = "id"): Promise<void> {
  if (!rows.length) return;
  const { error } = await getSupabaseServerClient().from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`upsert ${table}: ${error.message}`);
}

export async function updateRows(table: string, where: Where, patch: Record<string, unknown>): Promise<void> {
  const query = applyWhere(getSupabaseServerClient().from(table).update(patch), where);
  const { error } = await query;
  if (error) throw new Error(`update ${table}: ${error.message}`);
}

/** Paged select — never trust a single page (PostgREST caps at 1000 rows). */
export async function selectRows<T>(table: string, opts: { where?: Where; orderBy?: { column: string; ascending?: boolean }; limit?: number } = {}): Promise<T[]> {
  const max = opts.limit ?? 50_000;
  const rows: T[] = [];
  for (let offset = 0; offset < max; offset += PAGE) {
    let query = getSupabaseServerClient().from(table).select("*").range(offset, Math.min(offset + PAGE, max) - 1);
    query = applyWhere(query, opts.where);
    if (opts.orderBy) query = query.order(opts.orderBy.column, { ascending: opts.orderBy.ascending ?? true });
    const { data, error } = await query;
    if (error) throw new Error(`select ${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function countRows(table: string, where?: Where): Promise<number> {
  let query = getSupabaseServerClient().from(table).select("*", { count: "exact", head: true });
  query = applyWhere(query, where);
  const { count, error } = await query;
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

/** Call a transactional RPC (redeem_order / release_order style). Errors propagate. */
export async function callTransaction<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseServerClient().rpc(fn, args);
  if (error) throw new Error(`rpc ${fn}: ${error.message}`);
  return data as T;
}
