/**
 * M2 / W1 concurrency stress test (docs/data-core-cure-plan.md §5 M2 exit
 * criteria): 50 concurrent redeem_order calls against ONE rider's balance —
 * the atomic RPC must make double-spend physically impossible.
 *
 * Run: npm run stress:txcore   (uses .env.local)
 *
 * Isolation: every run uses a FRESH rider id (`stress-<run>`), so repeated
 * runs never interfere. Fixtures stay in points_ledger (delete-blocked until
 * the whitelist DDL lands) but are excluded from reconciliation by the
 * `stress-` prefix, and finalize() re-aligns the balances projection via
 * txcore_recompute_balances so the nightly invariant stays clean.
 *
 * Assertions:
 *   1. balance 1000, 50 concurrent redeems of 100 pts → EXACTLY 10 succeed,
 *      40 fail with INSUFFICIENT_POINTS; balance EXACTLY 0.
 *   2. Idempotency: retrying a used key returns the SAME order, no new spend.
 *   3. release_order refunds once (repeat release = no double refund).
 *   4. Global balances==ledger invariant clean afterwards.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
for (const line of envFile.split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trim().startsWith("#")) {
    const key = line.slice(0, i).trim();
    if (!process.env[key]) process.env[key] = line.slice(i + 1).trim();
  }
}

const { getSupabaseServerClient } = await import("../app/lib/supabase/server.ts");
const supabase = getSupabaseServerClient();

const run = Date.now().toString(36);
const RIDER = `stress-${run}`;
let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

/** Re-align the balances projection with the ledger for this test rider —
 *  keeps the nightly balances==ledger invariant clean whatever happened. */
async function finalize() {
  await supabase.from("marketplace_orders").delete().eq("rider_id", RIDER);
  await supabase.rpc("txcore_recompute_balances", { p_rider_ids: [RIDER] });
}

try {
  // ---- seed: fresh rider, balance 1000 ---------------------------------------
  {
    const { error } = await supabase.from("points_balances").insert({ rider_id: RIDER, available: 1000 });
    if (error) throw new Error(`seed: ${error.message}`);
  }

  // ---- 1. 50 concurrent redeems of 100 pts against balance 1000 ---------------
  const attempts = Array.from({ length: 50 }, (_, i) =>
    supabase
      .rpc("redeem_order", {
        p_order_id: `${RIDER}-o${i}`,
        p_rider_id: RIDER,
        p_product_id: "stress-product",
        p_points: 100,
        p_station_id: "stress-station",
        p_mode: "standard",
        p_idempotency_key: `${RIDER}-k${i}`,
        p_enforce_stock: false,
        p_extra: {},
      })
      .then((r) => ({ i, ok: !r.error, msg: r.error?.message ?? "" })),
  );
  const results = await Promise.all(attempts);
  const succeeded = results.filter((r) => r.ok);
  const insufficient = results.filter((r) => !r.ok && r.msg.includes("INSUFFICIENT_POINTS"));
  const otherErrors = results.filter((r) => !r.ok && !r.msg.includes("INSUFFICIENT_POINTS"));

  check("exactly 10 of 50 concurrent redeems succeed", succeeded.length === 10, `succeeded=${succeeded.length}`);
  check("the other 40 fail with INSUFFICIENT_POINTS", insufficient.length === 40, `insufficient=${insufficient.length}`);
  check("no unexpected errors", otherErrors.length === 0, otherErrors[0]?.msg ?? "");

  const { data: bal1 } = await supabase.from("points_balances").select("available").eq("rider_id", RIDER).single();
  check("final balance is exactly 0 (no double-spend)", Number(bal1?.available) === 0, `available=${bal1?.available}`);

  const { count: spendCount } = await supabase
    .from("points_ledger").select("*", { count: "exact", head: true })
    .eq("rider_id", RIDER).eq("type", "spend");
  check("ledger has exactly 10 spend entries", spendCount === 10, `spend=${spendCount}`);

  const { count: orderCount } = await supabase
    .from("marketplace_orders").select("*", { count: "exact", head: true }).eq("rider_id", RIDER);
  check("exactly 10 orders created", orderCount === 10, `orders=${orderCount}`);

  // ---- 2. idempotency: retry a used key → same order, no new spend ------------
  const winner = succeeded[0]?.i ?? 0;
  const { data: retry, error: retryErr } = await supabase.rpc("redeem_order", {
    p_order_id: `${RIDER}-retry`, p_rider_id: RIDER, p_product_id: "stress-product",
    p_points: 100, p_station_id: "stress-station", p_mode: "standard",
    p_idempotency_key: `${RIDER}-k${winner}`, p_enforce_stock: false, p_extra: {},
  });
  check("idempotent retry returns the ORIGINAL order", !retryErr && retry?.id === `${RIDER}-o${winner}`,
    `got=${retry?.id ?? retryErr?.message}`);
  const { data: bal2 } = await supabase.from("points_balances").select("available").eq("rider_id", RIDER).single();
  check("idempotent retry did not deduct again", Number(bal2?.available) === 0, `available=${bal2?.available}`);

  // ---- 3. release refunds exactly once -----------------------------------------
  const victim = `${RIDER}-o${winner}`;
  await supabase.rpc("release_order", { p_order_id: victim, p_restock: false, p_station_id: null, p_mode: "standard" });
  await supabase.rpc("release_order", { p_order_id: victim, p_restock: false, p_station_id: null, p_mode: "standard" });
  const { data: bal3 } = await supabase.from("points_balances").select("available").eq("rider_id", RIDER).single();
  check("double release refunds only once (balance=100)", Number(bal3?.available) === 100, `available=${bal3?.available}`);
  const { count: refundCount } = await supabase
    .from("points_ledger").select("*", { count: "exact", head: true })
    .eq("rider_id", RIDER).eq("type", "refund");
  check("exactly 1 refund ledger entry", refundCount === 1, `refunds=${refundCount}`);
} finally {
  await finalize();
}

// ---- 4. global invariant stays clean -------------------------------------------
const { data: inv } = await supabase.rpc("txcore_balance_check");
check("global balances==ledger invariant clean", (inv as { mismatchCount: number })?.mismatchCount === 0,
  `mismatches=${(inv as { mismatchCount: number })?.mismatchCount}`);

if (failures > 0) {
  console.error(`\ntxcore stress: ${failures} FAILURE(S) — do NOT cut the redeem path over.`);
  process.exit(1);
}
console.log(`\ntxcore stress: ALL PASSED (run=${run}) — 无双花、幂等、退款一次、不变量成立。`);
console.log("(账本测试行按 stress- 前缀隔离,已从对账排除;dashboard 恢复后执行白名单 DDL 可物理清除。)");
