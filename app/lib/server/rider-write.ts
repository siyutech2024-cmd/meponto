import { memory } from "./memory";
import { getSupabaseServerClient } from "../supabase/server";
import type { Rider } from "../data";

/**
 * Fresh-base guard for rider writes (骑手写入前取最新副本).
 *
 * Every route that changes ONE field of a rider writes the WHOLE record back
 * (the persistence layer upserts full JSON). If the instance's cached copy of
 * that rider is stale — hydrated hours ago, a refresh that failed, a page that
 * dropped the row — the write silently reverts every other field: franchise,
 * station, status. That is how hundreds of riders flipped to 未分配 + Inactive
 * in Sept and again in Nov 2026, with no audit entry and no error.
 *
 * `syncRidersFromDatabase(ids)` replaces the cached copies of exactly those
 * riders with the rows the database holds RIGHT NOW (one small query, no TTL,
 * no collection-wide refresh), so the record a route is about to modify is
 * the current one. Call it immediately before mutating.
 *
 * Returns false when the database could not be read. Callers must then
 * REFUSE the write (or skip a cosmetic one) — writing from the cache is the
 * exact failure this guards against.
 */
export async function syncRidersFromDatabase(ids: string[]): Promise<boolean> {
  const wanted = [...new Set(ids.filter((id) => typeof id === "string" && id))];
  if (wanted.length === 0) return true;
  try {
    const client = getSupabaseServerClient();
    const fresh = new Map<string, Rider>();
    for (let index = 0; index < wanted.length; index += 200) {
      const slice = wanted.slice(index, index + 200);
      const { data, error } = await client
        .from("app_state_records")
        .select("record_id, data")
        .eq("collection", "riders")
        .in("record_id", slice);
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as Array<{ record_id: string; data: Rider }>) {
        if (row.data && typeof row.data.id === "string") fresh.set(row.record_id, row.data);
      }
    }
    // Replace in place. A rider absent from the database is one this instance
    // created and has not flushed yet — its cached copy IS the newest.
    for (let index = 0; index < memory.riders.length; index += 1) {
      const row = fresh.get(memory.riders[index].id);
      if (row) memory.riders[index] = row;
    }
    return true;
  } catch (error) {
    console.warn("[rider-write] fresh read failed — refusing stale write", (error as Error).message);
    return false;
  }
}

/** Standard refusal when the fresh base can't be read. */
export const STALE_WRITE_REFUSED = { error: "数据库暂时不可读,为避免覆盖最新数据本次未保存,请稍后重试。", code: "stale_write_refused" } as const;
