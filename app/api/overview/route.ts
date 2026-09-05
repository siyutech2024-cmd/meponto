import { jsonResponse, memory } from "../../lib/server/memory";
import { refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission } from "../../lib/server/authz";
import { defaultAssessmentRule } from "../../lib/assessment";
import { displaySettleOf, settlementV2From } from "../../lib/settlement";

const COLLECTIONS = [
  "riders",
  "pontos",
  "franchises",
  "dispatchShifts",
  "shiftQuotas",
  "shiftSignups",
  "riderWithdrawals",
  "supportTickets",
  "marketplaceOrders",
  "riderDailyKpis",
  "riderDailyEarnings",
  "appUsers",
  "assessmentRules", // 结算口径 v2 生效日(settleTotal 用 payableOf)
];

function generatedAt() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

/**
 * Fast path: one `overview_stats` RPC aggregates everything in-database
 * (single indexed scan per collection — see
 * docs/overview-read-path-optimization-plan.md), plus a 60s per-instance
 * snapshot so N dashboard viewers share ONE computation. The legacy path
 * refreshed 12 full collections into memory per request;
 * riderDailyKpis/riderDailyEarnings grow per rider per day, so that download
 * eventually took minutes and the dashboard hung. Kill switch:
 * OVERVIEW_DB_AGGREGATE=false falls back to the in-memory rollup.
 */
const SNAPSHOT_TTL_MS = 60_000;
let snapshot: { at: number; body: Record<string, unknown> } | null = null;

async function overviewFromDatabase(): Promise<Response | null> {
  if (process.env.OVERVIEW_DB_AGGREGATE === "false") return null;
  if (process.env.USE_SUPABASE !== "true") return null;

  // Dashboards tolerate 60s staleness — serve every warm-instance viewer
  // from the last computed rollup instead of re-running the RPC.
  if (snapshot && Date.now() - snapshot.at < SNAPSHOT_TTL_MS) {
    return jsonResponse({ data: snapshot.body });
  }

  try {
    const { getSupabaseServerClient } = await import("../../lib/supabase/server");
    const supabase = getSupabaseServerClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase.rpc("overview_stats", { p_today: today });
    if (error) throw new Error(error.message);
    if (!data || typeof data !== "object") throw new Error("empty overview_stats payload");

    const body = { generatedAt: generatedAt(), ...(data as Record<string, unknown>) };
    snapshot = { at: Date.now(), body };
    return jsonResponse({ data: body });
  } catch (error) {
    console.warn(
      `[overview] overview_stats RPC unavailable, using in-memory rollup. (${(error as Error).message})`,
    );
    return null;
  }
}

/** Real-time HQ overview: one aggregated read for the dashboard. */
export async function GET(request: Request) {
  const forbidden = requirePermission(request, "view_dashboard");
  if (forbidden) return forbidden;

  const fast = await overviewFromDatabase();
  if (fast) return fast;

  await refreshCollectionsFromDatabase(COLLECTIONS);

  const today = new Date().toISOString().slice(0, 10);
  const weekShifts = memory.dispatchShifts.filter((shift) => shift.date >= today);

  // Latest KPI day rollup.
  const kpiDates = [...new Set(memory.riderDailyKpis.map((row) => row.date))].sort();
  const lastKpiDate = kpiDates[kpiDates.length - 1] ?? null;
  const lastKpis = memory.riderDailyKpis.filter((row) => row.date === lastKpiDate);
  const lastEarnings = memory.riderDailyEarnings.filter((row) => row.date === lastKpiDate);
  const v2From = settlementV2From(memory.assessmentRules.find((r) => r.id === "rule-active") ?? defaultAssessmentRule);
  const byNN = new Map(memory.riders.filter((r) => r.ninetyNineId).map((r) => [r.ninetyNineId!, r]));
  const proRateOverview = Number(memory.mallConfigs.find((c) => c.id === "mall-config")?.hqProRatePerOrder ?? 12) || 0;

  const pendingWithdrawals = memory.riderWithdrawals.filter((w) => w.status === "requested");

  return jsonResponse({
    data: {
      generatedAt: generatedAt(),
      network: {
        franchises: memory.franchises.length,
        stations: memory.pontos.length,
        riders: memory.riders.length,
        accounts: memory.appUsers.length,
      },
      dispatch: {
        upcomingShifts: weekShifts.length,
        planned: weekShifts.reduce((sum, shift) => sum + (shift.plannedCount ?? 0), 0),
        pendingSignups: memory.shiftSignups.filter((s) => s.status === "submitted").length,
        approvedSignups: memory.shiftSignups.filter((s) => s.status === "approved").length,
      },
      kpi: {
        date: lastKpiDate,
        riders: lastKpis.length,
        completedOrders: lastKpis.reduce((sum, row) => sum + (row.completedOrders ?? 0), 0),
        // 与钱包周板同源:普通行 payableOf(v2 = 今日统计),PRO 行 完单 × 费率。
        settleTotal: Math.round(lastEarnings.reduce((sum, row) => sum + displaySettleOf(row, byNN.get(row.rider99Id)?.pool, v2From, proRateOverview), 0) * 100) / 100,
        lowAr: lastKpis.filter((row) => row.ar !== null && row.ar < 95).length,
      },
      finance: {
        pendingWithdrawals: pendingWithdrawals.length,
        pendingAmount: Math.round(pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0) * 100) / 100,
        paidTotal: Math.round(memory.riderWithdrawals.filter((w) => w.status === "paid").reduce((sum, w) => sum + w.amount, 0) * 100) / 100,
      },
      support: {
        openTickets: memory.supportTickets.filter((t) => t.status === "open").length,
      },
      mall: {
        inTransit: memory.marketplaceOrders.filter((o) => o.status === "created").length,
        awaitingPickup: memory.marketplaceOrders.filter((o) => o.status === "arrived").length,
      },
    },
  });
}
