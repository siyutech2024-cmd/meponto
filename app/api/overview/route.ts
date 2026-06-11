import { jsonResponse, memory } from "../../lib/server/memory";
import { refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission } from "../../lib/server/authz";

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
];

/** Real-time HQ overview: one aggregated read for the dashboard. */
export async function GET(request: Request) {
  const forbidden = requirePermission(request, "view_dashboard");
  if (forbidden) return forbidden;
  await refreshCollectionsFromDatabase(COLLECTIONS);

  const today = new Date().toISOString().slice(0, 10);
  const weekShifts = memory.dispatchShifts.filter((shift) => shift.date >= today);

  // Latest KPI day rollup.
  const kpiDates = [...new Set(memory.riderDailyKpis.map((row) => row.date))].sort();
  const lastKpiDate = kpiDates[kpiDates.length - 1] ?? null;
  const lastKpis = memory.riderDailyKpis.filter((row) => row.date === lastKpiDate);
  const lastEarnings = memory.riderDailyEarnings.filter((row) => row.date === lastKpiDate);

  const pendingWithdrawals = memory.riderWithdrawals.filter((w) => w.status === "requested");

  return jsonResponse({
    data: {
      generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
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
        settleTotal: Math.round(lastEarnings.reduce((sum, row) => sum + (row.settleAmount ?? 0), 0) * 100) / 100,
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
