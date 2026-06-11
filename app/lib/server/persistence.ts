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
const FLUSH_DELAY_MS = 0; // flush immediately — serverless instances may freeze after response

type AnyRecord = { id: string } & Record<string, unknown>;

type PersistenceState = {
  tracked: Map<string, AnyRecord[]>;
  dirty: Set<string>;
  /** Record ids explicitly deleted in this instance, per collection. */
  pendingDeletes: Map<string, Set<string>>;
  /** Collections whose database rows must be wiped before the next upsert. */
  pendingPurges: Set<string>;
  /**
   * Record ids created/updated by THIS instance and possibly not flushed yet.
   * Used by the read-through refresh to decide which records that are absent
   * from the database are genuinely new (keep) versus deleted by a sibling
   * instance (drop). Prevents deleted records from being resurrected.
   */
  localNew: Map<string, Set<string>>;
  /** Set while refresh/hydrate rewrite collections so the proxy traps stay quiet. */
  suspendTracking: boolean;
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
    pendingDeletes: new Map(),
    pendingPurges: new Set(),
    localNew: new Map(),
    suspendTracking: false,
    flushTimer: null,
    warned: false,
    client: null,
    hydrationPromise: null,
    hydrated: false,
  });

// Older hot-reloaded state may miss the newer fields.
state.pendingDeletes ??= new Map();
state.pendingPurges ??= new Set();
state.localNew ??= new Map();
state.suspendTracking ??= false;

function markLocalNew(name: string, value: unknown) {
  const id = (value as AnyRecord | null)?.id;
  if (typeof id !== "string") return;
  const set = state.localNew.get(name) ?? new Set<string>();
  set.add(id);
  state.localNew.set(name, set);
}

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
      // Purge first (demo reset): wipe every database row of the collection
      // before re-upserting the current in-memory state.
      if (state.pendingPurges.has(name)) {
        const { error: purgeError } = await supabase.from(TABLE).delete().eq("collection", name);
        if (purgeError) throw new Error(purgeError.message);
        state.pendingPurges.delete(name);
      }

      // Explicit single-record deletes (DELETE routes).
      const deletes = state.pendingDeletes.get(name);
      if (deletes && deletes.size > 0) {
        const ids = Array.from(deletes);
        const { error: deleteError } = await supabase
          .from(TABLE)
          .delete()
          .eq("collection", name)
          .in("record_id", ids);
        if (deleteError) throw new Error(deleteError.message);
        state.pendingDeletes.delete(name);
      }

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
        // These records are in the database now — they no longer need the
        // local-only protection during read-through refreshes.
        const localNewSet = state.localNew.get(name);
        if (localNewSet) for (const row of rows) localNewSet.delete(row.record_id);
      }

      // NOTE: we deliberately do NOT delete rows that are merely absent from
      // this instance's memory. On serverless, several instances run the same
      // collections concurrently and an instance that has not seen a freshly
      // created record would otherwise wipe it from the database.
    } catch (error) {
      // Re-mark dirty so the next flush retries the sync.
      state.dirty.add(name);
      warnOnce((error as Error).message);
    }
  }
}

/** Mark a record as explicitly deleted so the database row is removed. */
export function persistDeleteRecord(collectionName: string, recordId: string) {
  const set = state.pendingDeletes.get(collectionName) ?? new Set<string>();
  set.add(recordId);
  state.pendingDeletes.set(collectionName, set);
  state.dirty.add(collectionName);
  scheduleFlush();
}

/** Wipe all database rows of the given collections before the next flush. */
export function persistPurgeCollections(collectionNames: string[]) {
  for (const name of collectionNames) {
    state.pendingPurges.add(name);
    state.dirty.add(name);
  }
  scheduleFlush();
}

/**
 * Read-through refresh: pull the latest database rows for the given
 * collections into memory before serving a request. Needed on serverless
 * where a warm instance only hydrates once at boot and would otherwise miss
 * records written by sibling instances. Records that exist only locally
 * (not yet flushed) are kept on top of the database state.
 */
export async function refreshCollectionsFromDatabase(collectionNames: string[]): Promise<void> {
  if (!persistenceEnabled()) return;
  if (state.hydrationPromise) await state.hydrationPromise.catch(() => undefined);

  const supabase = await getClient();
  if (!supabase) return;

  for (const name of collectionNames) {
    const collection = state.tracked.get(name);
    if (!collection) continue;

    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select("record_id, data")
        .eq("collection", name)
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);

      const dbRows = ((data ?? []) as Array<{ data: AnyRecord }>)
        .map((row) => row.data)
        .filter((row) => row && typeof row.id === "string");
      const dbIds = new Set(dbRows.map((row) => row.id));
      const pendingDeletes = state.pendingDeletes.get(name) ?? new Set<string>();
      const localNewSet = state.localNew.get(name) ?? new Set<string>();
      // Keep a record that's absent from the database ONLY if this instance
      // created it (not flushed yet). Anything else absent from the database
      // was deleted by a sibling instance and must not be resurrected.
      const localOnly = collection.filter(
        (record) =>
          record &&
          typeof record.id === "string" &&
          !dbIds.has(record.id) &&
          !pendingDeletes.has(record.id) &&
          localNewSet.has(record.id),
      );

      state.suspendTracking = true;
      try {
        collection.splice(0, collection.length, ...localOnly, ...dbRows.filter((row) => !pendingDeletes.has(row.id)));
      } finally {
        state.suspendTracking = false;
      }
      // Ids now present in the database no longer count as local-only.
      for (const id of dbIds) localNewSet.delete(id);
      if (localOnly.length > 0) {
        state.dirty.add(name);
        scheduleFlush();
      }
    } catch (error) {
      warnOnce((error as Error).message);
    }
  }
}

/** Force-write every tracked collection (used after demo resets). */
export function persistAllCollections() {
  for (const name of state.tracked.keys()) state.dirty.add(name);
  scheduleFlush();
}

/** True when there are mutations not yet written to the database. */
export function hasPendingPersistence(): boolean {
  return persistenceEnabled() && state.dirty.size > 0;
}

/**
 * Flush immediately, bypassing the debounce timer. Returned promise resolves
 * when the write completes — pass it to Next's `after()` on serverless so the
 * function isn't frozen before the database write finishes.
 */
export async function flushPendingToDatabase(): Promise<void> {
  if (!persistenceEnabled()) return;
  if (state.flushTimer) {
    clearTimeout(state.flushTimer);
    state.flushTimer = null;
  }
  await flushDirtyCollections();
}

/** Wrap a collection array in a mutation-tracking proxy and register it. */
export function trackCollection<T extends { id: string }>(name: string, array: T[]): T[] {
  const existing = state.tracked.get(name);
  if (existing) return existing as unknown as T[];

  const proxy = new Proxy(array, {
    set(target, property, value, receiver) {
      const result = Reflect.set(target, property, value, receiver);
      if (!state.suspendTracking) {
        state.dirty.add(name);
        markLocalNew(name, value);
        scheduleFlush();
      }
      return result;
    },
    deleteProperty(target, property) {
      const result = Reflect.deleteProperty(target, property);
      if (!state.suspendTracking) {
        state.dirty.add(name);
        scheduleFlush();
      }
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
        const wasDirty = state.dirty.has(name);
        if (persisted && persisted.length > 0) {
          if (wasDirty) {
            // The collection was mutated before hydration finished (cold-start
            // race): keep records that aren't in the database yet on top of
            // the persisted state, and flush them right after.
            const persistedIds = new Set(persisted.map((record) => record.id));
            const keepLocal = collection.filter((record) => record && !persistedIds.has(record.id));
            for (const record of keepLocal) markLocalNew(name, record);
            state.suspendTracking = true;
            try {
              collection.splice(0, collection.length, ...keepLocal, ...persisted);
            } finally {
              state.suspendTracking = false;
            }
            state.dirty.add(name);
          } else {
            // Replace seed contents with the persisted records (newest first).
            state.suspendTracking = true;
            try {
              collection.splice(0, collection.length, ...persisted);
            } finally {
              state.suspendTracking = false;
            }
            state.dirty.delete(name);
          }
        } else {
          // Nothing in the DB yet: push the seeds so the DB mirrors the app.
          // Seeds count as local-new until the first flush lands.
          for (const record of collection) markLocalNew(name, record);
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
