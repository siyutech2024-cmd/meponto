import { fetchRows } from "../db-read";
import { countRows, selectRows } from "./core";
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
  } = {},
): Promise<ReconcileReport> {
  const idColumn = options.idColumn ?? "id";
  const sampleSize = options.sampleSize ?? 200;

  const legacyRows = await fetchRows<Record<string, unknown>>(collection);
  const tableRows = await selectRows<Record<string, unknown>>(table);
  const tableCount = await countRows(table);

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
