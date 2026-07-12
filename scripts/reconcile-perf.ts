/**
 * M1 daily reconciliation (docs/data-core-cure-plan.md §4 S4/S5):
 * JSONB mirror vs fact tables for the two W2 collections.
 * Run: npm run reconcile:perf   (needs .env.local)
 * Non-clean output BLOCKS the read cutover.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local before importing anything that builds the Supabase client.
const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
for (const line of envFile.split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trim().startsWith("#")) {
    const key = line.slice(0, i).trim();
    if (!process.env[key]) process.env[key] = line.slice(i + 1).trim();
  }
}

const { reconcileCollection } = await import("../app/lib/server/db/reconcile.ts");
const { kpiToRow, earningToRow } = await import("../app/lib/server/db/performance-repo.ts");

let clean = true;
for (const [collection, table, toTableShape] of [
  ["riderDailyKpis", "t1_rider_daily_kpis", kpiToRow],
  ["riderDailyEarnings", "t1_rider_daily_earnings", earningToRow],
] as const) {
  const report = await reconcileCollection(collection, table, {
    toTableShape: toTableShape as (legacy: Record<string, unknown>) => Record<string, unknown>,
  });
  console.log(`\n== ${collection} ↔ ${table} ==`);
  console.log(`rows: legacy=${report.legacyCount} table=${report.tableCount}`);
  if (report.missingInTable.length) console.log(`MISSING in table (${report.missingInTable.length}):`, report.missingInTable.slice(0, 10));
  if (report.extraInTable.length) console.log(`EXTRA in table (${report.extraInTable.length}):`, report.extraInTable.slice(0, 10));
  for (const fd of report.fieldDiffs.slice(0, 5)) {
    console.log(`DIFF ${fd.id}:`, fd.diffs.slice(0, 3).map((d) => `${d.path} ${JSON.stringify(d.legacy)}≠${JSON.stringify(d.table)}`).join("; "));
  }
  console.log(report.clean ? "✓ CLEAN" : `✗ NOT CLEAN (${report.fieldDiffs.length} row diffs)`);
  clean = clean && report.clean;
}

if (!clean) {
  console.error("\nreconcile-perf: NOT CLEAN — do not advance the migration step.");
  process.exit(1);
}
console.log("\nreconcile-perf: all clean.");
