/**
 * M0 (docs/data-core-cure-plan.md): pure comparison helpers shared by the
 * shadow-read and reconciliation tools. No I/O — unit-testable via
 * `node --experimental-strip-types scripts/db-core.test.ts`.
 */

export type FieldDiff = { path: string; legacy: unknown; table: unknown };

/**
 * Deep-compare two values; collect up to `limit` leaf-level differences.
 * Arrays are compared positionally; objects by union of keys. `undefined`
 * and `null` are treated as equal (JSONB round-trips drop undefined).
 */
export function diffValues(legacy: unknown, table: unknown, path = "", out: FieldDiff[] = [], limit = 20): FieldDiff[] {
  if (out.length >= limit) return out;
  const bothNullish = (legacy === null || legacy === undefined) && (table === null || table === undefined);
  if (bothNullish) return out;

  const isObj = (v: unknown) => typeof v === "object" && v !== null;
  if (Array.isArray(legacy) && Array.isArray(table)) {
    const len = Math.max(legacy.length, table.length);
    for (let i = 0; i < len && out.length < limit; i++) {
      diffValues(legacy[i], table[i], `${path}[${i}]`, out, limit);
    }
    return out;
  }
  if (isObj(legacy) && isObj(table) && !Array.isArray(legacy) && !Array.isArray(table)) {
    const keys = new Set([...Object.keys(legacy as object), ...Object.keys(table as object)]);
    for (const key of keys) {
      if (out.length >= limit) break;
      diffValues(
        (legacy as Record<string, unknown>)[key],
        (table as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
        out,
        limit,
      );
    }
    return out;
  }
  // Leaves: numbers compare with cent tolerance (JSONB numeric round-trip).
  if (typeof legacy === "number" && typeof table === "number") {
    if (Math.abs(legacy - table) > 0.005) out.push({ path, legacy, table });
    return out;
  }
  if (legacy !== table) out.push({ path, legacy, table });
  return out;
}

export type SetReconcile = { missingInTable: string[]; extraInTable: string[]; common: number };

/** Compare two id sets (legacy mirror vs new table). */
export function reconcileSets(legacyIds: Iterable<string>, tableIds: Iterable<string>, sampleLimit = 50): SetReconcile {
  const legacy = new Set(legacyIds);
  const table = new Set(tableIds);
  const missingInTable: string[] = [];
  const extraInTable: string[] = [];
  let common = 0;
  for (const id of legacy) {
    if (table.has(id)) common += 1;
    else if (missingInTable.length < sampleLimit) missingInTable.push(id);
  }
  for (const id of table) {
    if (!legacy.has(id) && extraInTable.length < sampleLimit) extraInTable.push(id);
  }
  return { missingInTable, extraInTable, common };
}
