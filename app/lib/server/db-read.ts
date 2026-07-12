import { getSupabaseServerClient } from "../supabase/server";

/**
 * L2 read-path: direct, indexed reads from `app_state_records` for the hot
 * endpoints — fetch ONLY the rows a request needs (one date, one week, one
 * rider) instead of hydrating whole collections into memory.
 *
 * IMPORTANT: these reads never touch the in-memory collections, so they can't
 * poison state other routes rely on. Writes still go through the memory +
 * flush pipeline until the transactional-core migration
 * (docs/data-core-cure-plan.md) retires it.
 *
 * Kill switch: READPATH_DB_DIRECT=false reverts every caller to the legacy
 * full-collection refresh.
 */
export function dbDirectReadEnabled(): boolean {
  return process.env.USE_SUPABASE === "true" && process.env.READPATH_DB_DIRECT !== "false";
}

type Filter =
  | { op: "eq" | "gte" | "lte"; field: string; value: string }
  | { op: "in"; field: string; values: string[] };

const PAGE = 1000; // PostgREST max-rows page size (see commit 5062248).

/**
 * Fetch the data payloads of one collection, filtered on JSONB fields
 * (`data->>field`) — served by idx_asr_collection_date/status where the
 * field is date/status. Pages past the 1000-row cap.
 */
export async function fetchRows<T>(collection: string, filters: Filter[] = [], maxRows = 20_000): Promise<T[]> {
  const supabase = getSupabaseServerClient();
  const rows: T[] = [];
  for (let offset = 0; offset < maxRows; offset += PAGE) {
    let query = supabase
      .from("app_state_records")
      .select("data")
      .eq("collection", collection)
      .range(offset, offset + PAGE - 1);
    for (const f of filters) {
      const column = `data->>${f.field}`;
      if (f.op === "in") query = query.in(column, f.values);
      else if (f.op === "eq") query = query.eq(column, f.value);
      else if (f.op === "gte") query = query.gte(column, f.value);
      else query = query.lte(column, f.value);
    }
    const { data, error } = await query;
    if (error) throw new Error(`fetchRows(${collection}): ${error.message}`);
    for (const row of (data ?? []) as Array<{ data: T }>) rows.push(row.data);
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/** Call a service-role aggregate RPC (perf_dates / perf_trend / kpi_leaderboard / overview_stats …). */
export async function callRpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`rpc ${fn}: ${error.message}`);
  return data as T;
}
