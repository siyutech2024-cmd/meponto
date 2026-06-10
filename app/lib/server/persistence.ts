/**
 * Universal write-through persistence layer.
 *
 * Every in-memory collection is wrapped in a tracking Proxy. Any mutation
 * (unshift/push/splice/index assignment) marks the collection dirty; a
 * debounced flusher mirrors the full collection into the Supabase
 * `app_state_records` table (one JSONB row per record). On server boot the
 * collections are hydrated back from the database, so data survives restarts.
 *
 * Requirements: USE_SUPABASE=true plus NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY. When unavailable or unreachable, the app keeps
 * working in memory-only mode and logs a single warning.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "app_state_records";
const FLUSH_DELAY_MS = 300;

type AnyRecord = { id: string } & Record<string, unknown>;

type PersistenceState = {
  tracked: Map<string, AnyRecord[]>;
  dirty: Set<string>;
  flushTimer: ReturnType<typeof setTimeout> | null;
  warned: boolean;
  client: SupabaseClient | null;
  hydrationPromise: Promise<void> | null;
  hydrated: boolean;
};

// Survive Next.js dev hot reloads, mirroring the globalThis pattern of memory.ts.
const globalState = globalThis as typeof globalThis & {
  mepontoPersistence?: PersistenceState;
};

const state: PersistenceState =
  globalState.mepontoPersistence ??
  (globalState.mepontoPersistence = {
    tracked: new Map(),
    dirty: new Set(),
    flushTimer: null,
    warned: false,
    client: null,
    hydrationPromise: null,
    hydrated: false,
  });

function persistenceEnabled(): boolean {
  return (
    process.env.USE_SUPABASE === "true" &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

async function getClient(): Promise<SupabaseClient | null> {
  if (!persistenceEnabled()) return null;
  if (state.client) return state.client;

  try {
    const { getSupabaseServerClient } = await import("../supabase/server");
    state.client = getSupabaseServerClient();
    return state.client;
  } catch (error) {
    warnOnce(`client init failed: ${(error as Error).message}`);
    return null;
  }
}

function warnOnce(message: string) {
  if (state.warned) return;
  state.warned = true;
  console.warn(`[MePonto persistence] Database unavailable, running memory-only. (${message})`);
}

function scheduleFlush() {
  if (!persistenceEnabled()) return;
  if (state.flushTimer) return;

  state.flushTimer = setTimeout(() => {
    state.flushTimer = null;
    void flushDirtyCollections();
  }, FLUSH_DELAY_MS);

  // Don't keep the process alive just for pending flushes.
  (state.flushTimer as unknown as { unref?: () => void }).unref?.();
}

async function flushDirtyCollections() {
  if (state.dirty.size === 0) return;
  // Wait for hydration so a boot-time read can't be overwritten mid-flight.
  if (state.hydrationPromise) await state.hydrationPromise.catch(() => undefined);

  const supabase = await getClient();
  if (!supabase) return;

  const names = Array.from(state.dirty);
  state.dirty.clear();

  for (const name of names) {
    const collection = state.tracked.get(name);
    if (!collection) continue;

    try {
      const records = collection.filter((record) => record && typeof record.id === "string");
      const rows = records.map((record) => ({
        collection: name,
        record_id: record.id,
        data: record,
        updated_at: new Date().toISOString(),
      }));

      if (rows.length > 0) {
        const { error: upsertError } = await supabase
          .from(TABLE)
          .upsert(rows, { onConflict: "collection,record_id" });
        if (upsertError) throw new Error(upsertError.message);
      }

      // Remove rows for records that no longer exist in memory (deletes).
      const ids = records.map((record) => record.id);
      let deleteQuery = supabase.from(TABLE).delete().eq("collection", name);
      if (ids.length > 0) {
        deleteQuery = deleteQuery.not(
          "record_id",
          "in",
          `(${ids.map((id) => `"${id.replace(/"/g, "")}"`).join(",")})`,
        );
      }
      const { error: deleteError } = await deleteQuery;
      if (deleteError) throw new Error(deleteError.message);
    } catch (error) {
      // Re-mark dirty so the next flush retries the sync.
      state.dirty.add(name);
      warnOnce((error as Error).message);
    }
  }
}

/** Force-write every tracked collection (used after demo resets). */
export function persistAllCollections() {
  for (const name of state.tracked.keys()) state.dirty.add(name);
  scheduleFlush();
}

/** Wrap a collection array in a mutation-tracking proxy and register it. */
export function trackCollection<T extends { id: string }>(name: string, array: T[]): T[] {
  const existing = state.tracked.get(name);
  if (existing) return existing as unknown as T[];

  const proxy = new Proxy(array, {
    set(target, property, value, receiver) {
      const result = Reflect.set(target, property, value, receiver);
      state.dirty.add(name);
      scheduleFlush();
      return result;
    },
    deleteProperty(target, property) {
      const result = Reflect.deleteProperty(target, property);
      state.dirty.add(name);
      scheduleFlush();
      return result;
    },
  });

  state.tracked.set(name, proxy as unknown as AnyRecord[]);
  return proxy;
}

/**
 * Load persisted records from the database into the tracked collections.
 * Collections with no rows in the database keep their seed data and are
 * scheduled for an initial push so the database mirrors what users see.
 */
export function hydrateFromDatabase(): Promise<void> {
  if (state.hydrationPromise) return state.hydrationPromise;

  state.hydrationPromise = (async () => {
    if (!persistenceEnabled()) return;

    const supabase = await getClient();
    if (!supabase) return;

    try {
      const pageSize = 1000;
      let from = 0;
      const rows: { collection: string; record_id: string; data: AnyRecord }[] = [];

      // Page through everything (collections are demo-scale, but be safe).
      for (;;) {
        const { data, error } = await supabase
          .from(TABLE)
          .select("collection, record_id, data")
          .order("updated_at", { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;
        rows.push(...(data as typeof rows));
        if (data.length < pageSize) break;
        from += pageSize;
      }

      const byCollection = new Map<string, AnyRecord[]>();
      for (const row of rows) {
        if (!row?.data || typeof row.data !== "object") continue;
        const list = byCollection.get(row.collection) ?? [];
        list.push(row.data);
        byCollection.set(row.collection, list);
      }

      for (const [name, collection] of state.tracked) {
        const persisted = byCollection.get(name);
        if (persisted && persisted.length > 0) {
          // Replace seed contents with the persisted records (newest first).
          collection.splice(0, collection.length, ...persisted);
          state.dirty.delete(name);
        } else {
          // Nothing in the DB yet: push the seeds so the DB mirrors the app.
          state.dirty.add(name);
        }
      }

      state.hydrated = true;
      scheduleFlush();
      console.info(
        `[MePonto persistence] Hydrated ${byCollection.size} collection(s) from database.`,
      );
    } catch (error) {
      warnOnce((error as Error).message);
    }
  })();

  return state.hydrationPromise;
}

export function persistenceStatus() {
  return {
    enabled: persistenceEnabled(),
    hydrated: state.hydrated,
    trackedCollections: Array.from(state.tracked.keys()),
    pendingCollections: Array.from(state.dirty),
  };
}
