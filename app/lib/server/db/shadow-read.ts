import { coreMode } from "./core";
import { diffValues } from "./diff";

/**
 * M0 shadow-read helper (docs/data-core-cure-plan.md §4 S5/S6).
 *
 * off       → legacy only.
 * dualwrite → run BOTH, log up to 20 field-level differences, return legacy
 *             (the diff log is the S5 judge — 7 clean days gate the cutover).
 * read      → new table is the source; legacy is the safety fallback.
 */
export async function shadowRead<T>(
  module: string,
  label: string,
  legacyRead: () => Promise<T> | T,
  tableRead: () => Promise<T>,
): Promise<T> {
  const mode = coreMode(module);
  if (mode === "off") return legacyRead();

  if (mode === "read") {
    try {
      return await tableRead();
    } catch (error) {
      console.warn(`[core:${module}] table read failed, legacy fallback — ${label}: ${(error as Error).message}`);
      return legacyRead();
    }
  }

  // dualwrite: legacy answers the request; the table result is compared.
  const legacy = await legacyRead();
  try {
    const table = await tableRead();
    const diffs = diffValues(legacy, table);
    if (diffs.length > 0) {
      console.warn(
        `[core:${module}] shadow diff (${label}): ${diffs.length}${diffs.length >= 20 ? "+" : ""} field(s) — ` +
          diffs.slice(0, 5).map((d) => `${d.path}: ${JSON.stringify(d.legacy)}≠${JSON.stringify(d.table)}`).join("; "),
      );
    }
  } catch (error) {
    console.warn(`[core:${module}] shadow read failed — ${label}: ${(error as Error).message}`);
  }
  return legacy;
}
