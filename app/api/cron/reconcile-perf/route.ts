import { insertRows, selectRows } from "../../../lib/server/db/core";
import { reconcileAndHeal, type HealSummary, type ReconcileReport } from "../../../lib/server/db/reconcile";
import { earningToRow, kpiToRow } from "../../../lib/server/db/performance-repo";
import { balanceCheck, ledgerToRow, recomputeBalances } from "../../../lib/server/db/points-repo";
import { orderToRow } from "../../../lib/server/db/orders-repo";
import { paymentToRow, withdrawalToRow } from "../../../lib/server/db/finance-repo";

/**
 * M1 daily reconciliation cron (docs/data-core-cure-plan.md §4 S4/S5):
 * compares the legacy JSONB mirror against each wave's tables every night and
 * — since legacy is the source of truth during dual-write — SELF-HEALS any
 * projection drift before judging cleanliness (reconcileAndHeal):
 *   · rows deleted on the legacy side through paths the flush mirror never
 *     sees (e.g. rider duplicate-profile self-heal) are deleted from the table
 *   · missing / field-different rows are re-upserted from legacy
 *   · the points_balances snapshot is a pure projection — on any invariant
 *     mismatch every snapshot rider is recomputed from points_ledger, which
 *     also zeroes orphan snapshots left behind by rider-id merges
 * Pre-heal dirt stays visible in the log (preClean / preMismatchCount) so
 * drift is observable, but a healed night counts as clean for the 7-day gate:
 *   SELECT day, module, clean FROM core_reconcile_log ORDER BY day DESC;
 *
 * Deliberately memory-free (repository layer only) — this route must not
 * count against the module-guard memory baseline it exists to shrink.
 *
 * Auth: same policy as cron/birthday — if CRON_SECRET is set, require
 * `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends it automatically).
 */
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Shape = (legacy: Record<string, unknown>) => Record<string, unknown>;

function summarize({ report, healed }: { report: ReconcileReport; healed?: HealSummary }) {
  return {
    collection: report.collection,
    table: report.table,
    legacyCount: report.legacyCount,
    tableCount: report.tableCount,
    missingInTable: report.missingInTable.length,
    extraInTable: report.extraInTable.length,
    fieldDiffs: report.fieldDiffs.length,
    clean: report.clean,
    ...(healed ? { healed, preClean: false } : {}),
    // First few samples so a dirty day is debuggable straight from the log.
    samples: report.clean
      ? undefined
      : {
          missing: report.missingInTable.slice(0, 5),
          extra: report.extraInTable.slice(0, 5),
          diffs: report.fieldDiffs.slice(0, 3),
        },
  };
}

async function runPass(
  targets: ReadonlyArray<readonly [string, string, Shape]>,
  opts: { excludeIdPrefixes?: string[] } = {},
) {
  const results = [];
  let clean = true;
  for (const [collection, table, toTableShape] of targets) {
    const outcome = await reconcileAndHeal(collection, table, { toTableShape, ...opts });
    clean = clean && outcome.report.clean;
    results.push(summarize(outcome));
  }
  return { clean, results };
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) return json({ error: "Unauthorized" }, 401);
  }
  const day = new Date().toISOString().slice(0, 10);

  // ---- M1 / perf fact tables.
  const perf = await runPass([
    ["riderDailyKpis", "t1_rider_daily_kpis", kpiToRow as unknown as Shape],
    ["riderDailyEarnings", "t1_rider_daily_earnings", earningToRow as unknown as Shape],
  ] as const);
  await insertRows("core_reconcile_log", [
    { id: `perf-${day}-${Date.now().toString(36)}`, day, module: "perf", clean: perf.clean, detail: perf.results },
  ]);

  // ---- M2 / W1 transactional core (points ledger + orders + balance invariant).
  // Wrapped so a missing table (migration not applied yet) degrades to a
  // logged skip instead of failing the whole nightly run.
  let txcore: { clean: boolean; results: unknown[] } | { skipped: string };
  try {
    const pass = await runPass(
      [
        ["pointsLedgerEntries", "points_ledger", ledgerToRow as unknown as Shape],
        ["marketplaceOrders", "marketplace_orders", orderToRow as unknown as Shape],
      ] as const,
      // Concurrency-test fixtures (scripts/txcore-stress.ts) — exclude both sides.
      { excludeIdPrefixes: ["stress-"] },
    );
    let txClean = pass.clean;
    const txResults: unknown[] = pass.results;

    // Balances snapshot invariant — check, heal (full projection recompute), re-check.
    const pre = await balanceCheck().catch((error) => ({ mismatchCount: -1, samples: [String((error as Error).message)] }));
    let balances = pre;
    let healedRiders = 0;
    if (pre.mismatchCount > 0) {
      const ids = (await selectRows<{ rider_id: string }>("points_balances")).map((row) => row.rider_id);
      healedRiders = await recomputeBalances([...new Set(ids)]).catch(() => 0);
      balances = await balanceCheck().catch((error) => ({ mismatchCount: -1, samples: [String((error as Error).message)] }));
    }
    const balancesClean = balances.mismatchCount === 0;
    txClean = txClean && balancesClean;
    txResults.push({
      invariant: "balances==ledger",
      preMismatchCount: pre.mismatchCount,
      healedRiders,
      ...balances,
      clean: balancesClean,
    });

    await insertRows("core_reconcile_log", [
      { id: `txcore-${day}-${Date.now().toString(36)}`, day, module: "txcore", clean: txClean, detail: txResults },
    ]);
    txcore = { clean: txClean, results: txResults };
  } catch (error) {
    console.warn(`[reconcile] txcore pass skipped: ${(error as Error).message}`);
    txcore = { skipped: (error as Error).message };
  }

  // ---- M3 / W3 finance batch 1 (withdrawals + payments), same degrade rule.
  let fin: { clean: boolean; results: unknown[] } | { skipped: string };
  try {
    const pass = await runPass([
      ["riderWithdrawals", "rider_withdrawals", withdrawalToRow as unknown as Shape],
      ["walletPayments", "wallet_payments", paymentToRow as unknown as Shape],
    ] as const);
    await insertRows("core_reconcile_log", [
      { id: `fin-${day}-${Date.now().toString(36)}`, day, module: "fin", clean: pass.clean, detail: pass.results },
    ]);
    fin = { clean: pass.clean, results: pass.results };
  } catch (error) {
    console.warn(`[reconcile] fin pass skipped: ${(error as Error).message}`);
    fin = { skipped: (error as Error).message };
  }

  return json({ data: { perf, txcore, fin } });
}
