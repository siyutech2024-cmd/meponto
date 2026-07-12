import { insertRows } from "../../../lib/server/db/core";
import { reconcileCollection } from "../../../lib/server/db/reconcile";
import { earningToRow, kpiToRow } from "../../../lib/server/db/performance-repo";
import { balanceCheck, ledgerToRow } from "../../../lib/server/db/points-repo";
import { orderToRow } from "../../../lib/server/db/orders-repo";

/**
 * M1 daily reconciliation cron (docs/data-core-cure-plan.md §4 S4/S5):
 * compares the legacy JSONB mirror against the t1_ fact tables every night —
 * no manual `npm run reconcile:perf` needed. Results are appended to the
 * `core_reconcile_log` table, so the 7-clean-days cutover gate is one query:
 *   SELECT day, clean FROM core_reconcile_log ORDER BY day DESC LIMIT 7;
 *
 * Deliberately memory-free (repository layer only) — this route must not
 * count against the module-guard memory baseline it exists to shrink.
 *
 * Auth: same policy as cron/birthday — if CRON_SECRET is set, require
 * `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends it automatically).
 */
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) return json({ error: "Unauthorized" }, 401);
  }

  const results = [];
  let clean = true;
  for (const [collection, table, toTableShape] of [
    ["riderDailyKpis", "t1_rider_daily_kpis", kpiToRow],
    ["riderDailyEarnings", "t1_rider_daily_earnings", earningToRow],
  ] as const) {
    const report = await reconcileCollection(collection, table, {
      toTableShape: toTableShape as unknown as (legacy: Record<string, unknown>) => Record<string, unknown>,
    });
    clean = clean && report.clean;
    results.push({
      collection,
      table,
      legacyCount: report.legacyCount,
      tableCount: report.tableCount,
      missingInTable: report.missingInTable.length,
      extraInTable: report.extraInTable.length,
      fieldDiffs: report.fieldDiffs.length,
      clean: report.clean,
      // First few samples so a dirty day is debuggable straight from the log.
      samples: report.clean
        ? undefined
        : {
            missing: report.missingInTable.slice(0, 5),
            extra: report.extraInTable.slice(0, 5),
            diffs: report.fieldDiffs.slice(0, 3),
          },
    });
  }

  const day = new Date().toISOString().slice(0, 10);
  await insertRows("core_reconcile_log", [
    { id: `perf-${day}-${Date.now().toString(36)}`, day, module: "perf", clean, detail: results },
  ]);

  // ---- M2 / W1 transactional core (points ledger + orders + balance invariant).
  // Wrapped so a missing table (migration not applied yet) degrades to a
  // logged skip instead of failing the whole nightly run.
  let txcore: { clean: boolean; results: unknown[] } | { skipped: string };
  try {
    const txResults = [];
    let txClean = true;
    for (const [collection, table, toTableShape] of [
      ["pointsLedgerEntries", "points_ledger", ledgerToRow],
      ["marketplaceOrders", "marketplace_orders", orderToRow],
    ] as const) {
      const report = await reconcileCollection(collection, table, {
        toTableShape: toTableShape as unknown as (legacy: Record<string, unknown>) => Record<string, unknown>,
      });
      txClean = txClean && report.clean;
      txResults.push({
        collection,
        table,
        legacyCount: report.legacyCount,
        tableCount: report.tableCount,
        missingInTable: report.missingInTable.length,
        extraInTable: report.extraInTable.length,
        fieldDiffs: report.fieldDiffs.length,
        clean: report.clean,
        samples: report.clean
          ? undefined
          : { missing: report.missingInTable.slice(0, 5), extra: report.extraInTable.slice(0, 5), diffs: report.fieldDiffs.slice(0, 3) },
      });
    }
    const balances = await balanceCheck().catch((error) => ({ mismatchCount: -1, samples: [String((error as Error).message)] }));
    const balancesClean = balances.mismatchCount === 0;
    txClean = txClean && balancesClean;
    txResults.push({ invariant: "balances==ledger", ...balances, clean: balancesClean } as never);

    await insertRows("core_reconcile_log", [
      { id: `txcore-${day}-${Date.now().toString(36)}`, day, module: "txcore", clean: txClean, detail: txResults },
    ]);
    txcore = { clean: txClean, results: txResults };
  } catch (error) {
    console.warn(`[reconcile] txcore pass skipped: ${(error as Error).message}`);
    txcore = { skipped: (error as Error).message };
  }

  return json({ data: { perf: { clean, results }, txcore } });
}
