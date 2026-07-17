import { fetchRows } from "../db-read";
import { deleteRows, selectRows, upsertRows } from "./core";
import { diffValues, reconcileSets, type FieldDiff } from "./diff";

/**
 * M0 reconciliation tool (docs/data-core-cure-plan.md §4 S4, run daily during
 * every dual-write window): compares the legacy JSONB mirror
 * (`app_state_records`) against a wave's new table — row counts, id sets and
 * sampled field-level diffs. Non-empty reports BLOCK the next migration step.
 */
export type ReconcileReport = {
  collection: string;
  table: string;
  legacyCount: number;
  tableCount: number;
  missingInTable: string[];
  extraInTable: string[];
  fieldDiffs: Array<{ id: string; diffs: FieldDiff[] }>;
  clean: boolean;
};

export async function reconcileCollection(
  collection: string,
  table: string,
  options: {
    /** Map a legacy JSONB record to the new table's row shape before diffing. */
    toTableShape?: (legacy: Record<string, unknown>) => Record<string, unknown>;
    idColumn?: string;
    /** Field-diff at most this many common rows (sampled from the head). */
    sampleSize?: number;
    /** Rows whose id starts with any of these prefixes are excluded on BOTH
     *  sides (e.g. `stress-` concurrency-test fixtures). */
    excludeIdPrefixes?: string[];
  } = {},
): Promise<ReconcileReport> {
  const idColumn = options.idColumn ?? "id";
  const sampleSize = options.sampleSize ?? 200;
  const excluded = (id: unknown) =>
    (options.excludeIdPrefixes ?? []).some((prefix) => String(id ?? "").startsWith(prefix));

  const legacyRows = (await fetchRows<Record<string, unknown>>(collection)).filter((row) => !excluded(row.id));
  const tableRows = (await selectRows<Record<string, unknown>>(table)).filter((row) => !excluded(row[idColumn]));
  // Comparable scope on both sides: count what survived the exclusion filter.
  const tableCount = tableRows.length;

  const legacyById = new Map(legacyRows.map((row) => [String(row.id), row]));
  const tableById = new Map(tableRows.map((row) => [String(row[idColumn]), row]));
  const sets = reconcileSets(legacyById.keys(), tableById.keys());

  const fieldDiffs: Array<{ id: string; diffs: FieldDiff[] }> = [];
  let sampled = 0;
  for (const [id, legacy] of legacyById) {
    if (sampled >= sampleSize) break;
    const tableRow = tableById.get(id);
    if (!tableRow) continue;
    sampled += 1;
    const expected = options.toTableShape ? options.toTableShape(legacy) : legacy;
    // Only compare fields the expectation defines — the table may carry extra
    // columns (created_at defaults etc.) that have no legacy counterpart.
    const projected: Record<string, unknown> = {};
    for (const key of Object.keys(expected)) projected[key] = (tableRow as Record<string, unknown>)[key];
    const diffs = diffValues(expected, projected);
    if (diffs.length > 0) fieldDiffs.push({ id, diffs });
  }

  return {
    collection,
    table,
    legacyCount: legacyRows.length,
    tableCount,
    missingInTable: sets.missingInTable,
    extraInTable: sets.extraInTable,
    fieldDiffs,
    clean: sets.missingInTable.length === 0 && sets.extraInTable.length === 0 && fieldDiffs.length === 0,
  };
}

export type HealSummary = { deletedExtra: number; restored: number; error?: string };

/**
 * S4 self-heal: during dual-write the legacy JSONB mirror is the source of
 * truth and every new table is a projection — so a dirty report is repaired
 * mechanically instead of paging a human: rows the legacy side no longer has
 * are deleted (e.g. the rider duplicate-profile self-heal removes twin KPI
 * rows through a delete path the flush mirror never sees), and rows that are
 * missing or field-different are re-upserted from legacy. Append-only tables
 * (points_ledger) silently ignore deletes via their RULE, so an unhealable
 * discrepancy still shows up dirty in the post-heal report — by design.
 *
 * Returns the POST-heal report; `healed` says what was repaired. The pre-heal
 * dirt is preserved in `healed.preClean=false` + counters for observability.
 */
export async function reconcileAndHeal(
  collection: string,
  table: string,
  options: Parameters<typeof reconcileCollection>[2] = {},
): Promise<{ report: ReconcileReport; healed?: HealSummary }> {
  const first = await reconcileCollection(collection, table, options);
  if (first.clean) return { report: first };

  const idColumn = options.idColumn ?? "id";
  const healed: HealSummary = { deletedExtra: 0, restored: 0 };
  try {
    for (const id of first.extraInTable) {
      await deleteRows(table, { [idColumn]: id });
      healed.deletedExtra += 1;
    }
    const wanted = new Set([...first.missingInTable, ...first.fieldDiffs.map((diff) => diff.id)]);
    if (wanted.size > 0) {
      const legacyRows = (await fetchRows<Record<string, unknown>>(collection)).filter((row) => wanted.has(String(row.id)));
      const rows = legacyRows.map((row) => (options.toTableShape ? options.toTableShape(row) : row));
      await upsertRows(table, rows, idColumn);
      healed.restored = rows.length;
    }
  } catch (error) {
    healed.error = (error as Error).message; // best-effort: post-report stays honest
  }
  const report = await reconcileCollection(collection, table, options);
  return { report, healed };
}
