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
/**
 * Read-through refresh TTL: a collection refreshed from the database within
 * this window is NOT re-fetched. Local mutations invalidate the window
 * immediately (see the proxy traps), so an instance always reads its own
 * writes; cross-instance staleness is bounded by this TTL.
 */
const REFRESH_TTL_MS = Number(process.env.PERSISTENCE_REFRESH_TTL_MS ?? 5000);

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
  /** Per-collection timestamp of the last successful read-through refresh. */
  lastRefreshedAt: Map<string, number>;
  /** In-flight refresh promises so concurrent requests share one fetch. */
  refreshInFlight: Map<string, Promise<void>>;
  /**
   * Per-record serialized snapshot of what the database last saw
   * (collection → record id → JSON). Lets the flusher upsert ONLY records
   * that actually changed instead of mirroring whole collections — the
   * full-collection upsert was the single most expensive query in
   * production (mean ~0.9s on ledger-sized collections).
   */
  lastFlushed: Map<string, Map<string, string>>;
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
    lastRefreshedAt: new Map(),
    refreshInFlight: new Map(),
    lastFlushed: new Map(),
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
state.lastRefreshedAt ??= new Map();
state.refreshInFlight ??= new Map();
state.lastFlushed ??= new Map();

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
        // Database rows are gone — every in-memory record must be re-upserted.
        state.lastFlushed.get(name)?.clear();
      }

      // Explicit single-record deletes (DELETE routes). WRITE WINS: a record
      // that was re-created in memory after the delete was queued (same
      // deterministic id, e.g. re-importing a purged T+1 day) must NOT be
      // deleted — otherwise a stale queued delete silently eats fresh imports.
      const deletes = state.pendingDeletes.get(name);
      if (deletes && deletes.size > 0) {
        const present = new Set(collection.map((record) => record?.id));
        for (const id of Array.from(deletes)) {
          if (present.has(id)) deletes.delete(id);
        }
      }
      if (deletes) {
        if (deletes.size > 0) {
          const ids = Array.from(deletes);
          const { error: deleteError } = await supabase
            .from(TABLE)
            .delete()
            .eq("collection", name)
            .in("record_id", ids);
          // Clear even on failure — endlessly retrying stale deletes risks
          // destroying rows written by sibling instances in the meantime.
          state.pendingDeletes.delete(name);
          // Forget the snapshots so a same-id re-creation is flushed again.
          const flushed = state.lastFlushed.get(name);
          if (flushed) for (const id of ids) flushed.delete(id);
          if (deleteError) throw new Error(deleteError.message);
        } else {
          state.pendingDeletes.delete(name);
        }
      }

      // Dedupe by id (last wins). A collection can transiently hold two records
      // with the same id (seed + runtime, or a double-register). Postgres rejects
      // an upsert whose batch touches the same (collection,record_id) twice
      // ("ON CONFLICT DO UPDATE command cannot affect row a second time"), which
      // would drop the entire app into memory-only mode and lose all writes
      // (FCM tokens, push subscriptions, etc.). Collapsing duplicates first keeps
      // persistence healthy.
      const byId = new Map<string, AnyRecord>();
      for (const record of collection) {
        if (record && typeof record.id === "string") byId.set(record.id, record);
      }

      // Incremental flush: only upsert records whose serialized form differs
      // from what the database last saw. Array reindexing (unshift/splice)
      // trips the proxy traps for every element, so without this diff a
      // single prepend re-uploaded the entire collection (the dominant DB
      // cost in production: mean ~0.9s per flush on large collections).
      const flushedMap =
        state.lastFlushed.get(name) ??
        (() => {
          const created = new Map<string, string>();
          state.lastFlushed.set(name, created);
          return created;
        })();
      const changed: Array<{ recordId: string; record: AnyRecord; serialized: string }> = [];
      for (const [recordId, record] of byId) {
        const serialized = JSON.stringify(record);
        if (flushedMap.get(recordId) === serialized) continue;
        changed.push({ recordId, record, serialized });
      }
      const rows = changed.map(({ recordId, record }) => ({
        collection: name,
        record_id: recordId,
        data: record,
        updated_at: new Date().toISOString(),
      }));

      if (rows.length > 0) {
        const { error: upsertError } = await supabase
          .from(TABLE)
          .upsert(rows, { onConflict: "collection,record_id" });
        if (upsertError) throw new Error(upsertError.message);
        // Snapshot AFTER the upsert succeeded (all-or-nothing per collection).
        for (const item of changed) flushedMap.set(item.recordId, item.serialized);
        // These records are in the database now — they no longer need the
        // local-only protection during read-through refreshes.
        const localNewSet = state.localNew.get(name);
        if (localNewSet) for (const row of rows) localNewSet.delete(row.record_id);
      }

      // M2/W1 dual-write (docs/data-core-cure-plan.md §4 S3, CORE_MODE_TXCORE):
      // the flush pipeline is the ONE choke point every ledger/order mutation
      // passes through, so mirroring here covers all 9+ write routes at once
      // and stays exactly consistent with what reaches the JSONB mirror.
      // Failures are logged, never thrown — legacy remains the source of truth;
      // sustained divergence is the nightly reconcile's job to surface.
      await mirrorToCoreTables(name, Array.from(byId.values()));

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

/**
 * Core-migration dual-write hook (docs/data-core-cure-plan.md §4 S3):
 * mirror selected collections into their real tables when the owning
 * module's flag (CORE_MODE_<module>) is dualwrite|read. Records that would
 * violate the tables' CHECK constraints (legacy oddities) are skipped — the
 * nightly reconcile surfaces them as missing rows for manual review.
 * Never throws: legacy stays the source of truth during the window.
 */
const LEDGER_TYPES = new Set(["earn", "spend", "refund", "expire", "reverse", "adjust", "hold", "release"]);
const LEDGER_STATUSES = new Set(["pending", "approved", "rejected", "reversed"]);
const ORDER_STATUSES = new Set(["created", "arrived", "fulfilled", "cancelled"]);
const WITHDRAWAL_STATUSES = new Set(["requested", "paid", "rejected"]);

type MirrorTarget = {
  module: string; // CORE_MODE_<MODULE> flag owner
  valid: (r: AnyRecord) => boolean;
  write: (records: AnyRecord[]) => Promise<void>;
};

const MIRROR_TARGETS: Record<string, MirrorTarget> = {
  // ---- M2 / W1 transactional core ----
  pointsLedgerEntries: {
    module: "txcore",
    valid: (r) => typeof r.riderId === "string" && LEDGER_TYPES.has(String(r.type)) && LEDGER_STATUSES.has(String(r.status)),
    write: async (records) => {
      const { upsertLedgerEntries, recomputeBalances } = await import("./db/points-repo");
      await upsertLedgerEntries(records as never[]);
      // Keep the balances snapshot a pure projection of the ledger.
      await recomputeBalances([...new Set(records.map((r) => String(r.riderId)))]);
    },
  },
  marketplaceOrders: {
    module: "txcore",
    valid: (r) => ORDER_STATUSES.has(String(r.status ?? "created")),
    write: async (records) => {
      const { upsertOrders } = await import("./db/orders-repo");
      await upsertOrders(records as never[]);
    },
  },
  // ---- M3 / W3 finance batch 1 ----
  riderWithdrawals: {
    module: "fin",
    valid: (r) => WITHDRAWAL_STATUSES.has(String(r.status)) && Number(r.amount) > 0,
    write: async (records) => {
      const { upsertWithdrawals } = await import("./db/finance-repo");
      await upsertWithdrawals(records as never[]);
    },
  },
  walletPayments: {
    module: "fin",
    valid: (r) => (r.target === "franchise" || r.target === "rider") && Number(r.amount) > 0,
    write: async (records) => {
      const { upsertPayments } = await import("./db/finance-repo");
      await upsertPayments(records as never[]);
    },
  },
};

async function mirrorToCoreTables(name: string, records: AnyRecord[]): Promise<void> {
  const target = MIRROR_TARGETS[name];
  if (!target) return;
  const mode = String(process.env[`CORE_MODE_${target.module.toUpperCase()}`] ?? "off").toLowerCase();
  if (mode !== "dualwrite" && mode !== "read") return;
  try {
    const valid = records.filter(target.valid);
    if (valid.length > 0) await target.write(valid);
  } catch (error) {
    console.warn(`[core:${target.module}] dual-write mirror failed for ${name} (legacy unaffected): ${(error as Error).message}`);
  }
}

/** Mark a record as explicitly deleted so the database row is removed. */
export function persistDeleteRecord(collectionName: string, recordId: string) {
  const set = state.pendingDeletes.get(collectionName) ?? new Set<string>();
  set.add(recordId);
  state.pendingDeletes.set(collectionName, set);
  state.dirty.add(collectionName);
  state.lastRefreshedAt.delete(collectionName);
  scheduleFlush();
}

/** Wipe all database rows of the given collections before the next flush. */
export function persistPurgeCollections(collectionNames: string[]) {
  for (const name of collectionNames) {
    state.pendingPurges.add(name);
    state.dirty.add(name);
    state.lastRefreshedAt.delete(name);
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

  // TTL guard: skip collections refreshed recently. Local mutations clear the
  // timestamp (proxy traps), so this never hides this instance's own writes.
  const now = Date.now();
  const due = collectionNames.filter((name) => {
    if (!state.tracked.has(name)) return false;
    const last = state.lastRefreshedAt.get(name);
    return last === undefined || now - last >= REFRESH_TTL_MS;
  });
  if (due.length === 0) return;

  // Parallel fetch (was serial: N collections × RTT). Concurrent requests for
  // the same collection share one in-flight promise instead of re-fetching.
  await Promise.all(
    due.map((name) => {
      const inFlight = state.refreshInFlight.get(name);
      if (inFlight) return inFlight;
      const task = refreshOneCollection(supabase, name).finally(() => {
        state.refreshInFlight.delete(name);
      });
      state.refreshInFlight.set(name, task);
      return task;
    }),
  );
}

async function refreshOneCollection(supabase: SupabaseClient, name: string): Promise<void> {
  const collection = state.tracked.get(name);
  if (!collection) return;

  try {
    // NOTE: keep the updated_at ordering — routes rely on collections being
    // newest-first (e.g. `.slice(0, 20)` for "recent" views). The composite
    // index (collection, updated_at DESC) makes this cheap.
    // Page through the whole collection — PostgREST caps un-ranged selects at
    // 1000 rows, which silently truncated collections past that size (e.g.
    // riderDailyKpis): older records vanished from memory on refresh, so
    // lifetime aggregates and backfills missed them.
    const pageSize = 1000;
    let from = 0;
    const data: Array<{ data: AnyRecord }> = [];
    for (;;) {
      const { data: page, error } = await supabase
        .from(TABLE)
        .select("record_id, data")
        .eq("collection", name)
        .order("updated_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      if (!page || page.length === 0) break;
      data.push(...(page as Array<{ data: AnyRecord }>));
      if (page.length < pageSize) break;
      from += pageSize;
    }

    const dbRows = ((data ?? []) as Array<{ data: AnyRecord }>)
      .map((row) => row.data)
      .filter((row) => row && typeof row.id === "string");
    const dbIds = new Set(dbRows.map((row) => row.id));
    const pendingDeletes = state.pendingDeletes.get(name) ?? new Set<string>();
    // Write wins here too: a queued delete for an id that is present in the
    // local collection again means the record was re-created — unqueue it.
    if (pendingDeletes.size > 0) {
      const present = new Set(collection.map((record) => record?.id));
      for (const id of Array.from(pendingDeletes)) {
        if (present.has(id)) pendingDeletes.delete(id);
      }
    }
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

    // WRITE WINS for locally MODIFIED records too: a record that exists in
    // the database but carries unflushed local edits (its JSON differs from
    // the last flushed/refreshed snapshot) must NOT be replaced by the stale
    // database copy. Without this, a poll-driven refresh racing the debounced
    // flush silently reverted saved edits (e.g. a rider's franchise/station
    // assignment snapping back to Unassigned). The local object is kept and
    // the re-scheduled flush writes it out; the stale snapshot left in
    // lastFlushed is what makes the incremental flusher detect the diff.
    const flushedSnap = state.lastFlushed.get(name);
    const localModified = new Map<string, AnyRecord>();
    if (flushedSnap && flushedSnap.size > 0) {
      for (const record of collection) {
        if (!record || typeof record.id !== "string" || !dbIds.has(record.id)) continue;
        const snap = flushedSnap.get(record.id);
        if (snap !== undefined && snap !== JSON.stringify(record)) localModified.set(record.id, record);
      }
    }

    state.suspendTracking = true;
    try {
      collection.splice(
        0,
        collection.length,
        ...localOnly,
        ...dbRows.filter((row) => !pendingDeletes.has(row.id)).map((row) => localModified.get(row.id) ?? row),
      );
    } finally {
      state.suspendTracking = false;
    }
    // Ids now present in the database no longer count as local-only.
    for (const id of dbIds) localNewSet.delete(id);
    // The collection now holds the exact objects the database returned —
    // rebuild the flush snapshots from them so the incremental flusher
    // skips DB-sourced records. Rebuilding (not merging) also drops stale
    // snapshots of rows a sibling instance deleted.
    const flushedMap = new Map<string, string>();
    for (const row of dbRows) flushedMap.set(row.id, JSON.stringify(row));
    state.lastFlushed.set(name, flushedMap);
    if (localOnly.length > 0 || localModified.size > 0) {
      state.dirty.add(name);
      scheduleFlush();
    }
    state.lastRefreshedAt.set(name, Date.now());
  } catch (error) {
    warnOnce((error as Error).message);
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
        state.lastRefreshedAt.delete(name); // read-your-writes: bust the TTL
        scheduleFlush();
      }
      return result;
    },
    deleteProperty(target, property) {
      const result = Reflect.deleteProperty(target, property);
      if (!state.suspendTracking) {
        state.dirty.add(name);
        state.lastRefreshedAt.delete(name);
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
          // Seed flush snapshots from the database rows (see refresh).
          const flushedMap = new Map<string, string>();
          for (const record of persisted) flushedMap.set(record.id, JSON.stringify(record));
          state.lastFlushed.set(name, flushedMap);
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
            // Fresh from the database — start the read-through TTL window so
            // the first request after boot doesn't immediately re-fetch.
            state.lastRefreshedAt.set(name, Date.now());
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
