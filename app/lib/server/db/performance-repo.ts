import type { RiderDailyEarning, RiderDailyKpi } from "../../performance";
import { callTransaction, coreMode, deleteRows, selectRows, upsertRows, type Where } from "./core";

/**
 * M1 / Wave 2 repository: t1_rider_daily_kpis + t1_rider_daily_earnings fact
 * tables (docs/data-core-cure-plan.md §3 W2). Routes call these methods —
 * never supabase-js directly. Rollout flag: CORE_MODE_PERF.
 */
export const PERF_MODULE = "perf";
export const perfMode = () => coreMode(PERF_MODULE);

// ---- row mappers (TS camelCase ↔ table snake_case) ---------------------------

type KpiRow = {
  id: string; date: string; rider99_id: string; rider_name: string; phone: string; account: string;
  cpf: string; city: string; online_hours: number; completed_orders: number;
  signed_shifts: number; signed_shift_hours: number; in_shift_online_hours: number;
  tsh: number | null; tsh_critical: number | null; ar: number | null;
  caa: number | null; overtime: number | null; imported_at: string;
};

export function kpiToRow(k: RiderDailyKpi): KpiRow {
  return {
    // account 必须落表:没有它,同一骑手同天的 main/pro 两行既撞唯一约束,
    // 又让 ?account=pro 过滤在事实表模式下永远筛不出 PRO。
    id: k.id, date: k.date, rider99_id: k.rider99Id, rider_name: k.riderName ?? "", account: k.account ?? "main",
    phone: k.phone ?? "", cpf: k.cpf ?? "", city: k.city ?? "",
    online_hours: k.onlineHours ?? 0, completed_orders: k.completedOrders ?? 0,
    signed_shifts: k.signedShifts ?? 0, signed_shift_hours: k.signedShiftHours ?? 0,
    in_shift_online_hours: k.inShiftOnlineHours ?? 0,
    tsh: k.tsh, tsh_critical: k.tshCritical, ar: k.ar, caa: k.caa, overtime: k.overtime,
    imported_at: k.importedAt ?? "",
  };
}

export function rowToKpi(r: KpiRow): RiderDailyKpi {
  return {
    id: r.id, date: r.date, rider99Id: r.rider99_id, riderName: r.rider_name,
    account: r.account === "pro" ? "pro" : "main",
    phone: r.phone, cpf: r.cpf, city: r.city,
    onlineHours: Number(r.online_hours), completedOrders: Number(r.completed_orders),
    signedShifts: Number(r.signed_shifts), signedShiftHours: Number(r.signed_shift_hours),
    inShiftOnlineHours: Number(r.in_shift_online_hours),
    tsh: r.tsh === null ? null : Number(r.tsh),
    tshCritical: r.tsh_critical === null ? null : Number(r.tsh_critical),
    ar: r.ar === null ? null : Number(r.ar),
    caa: r.caa === null ? null : Number(r.caa),
    overtime: r.overtime === null ? null : Number(r.overtime),
    importedAt: r.imported_at,
  };
}

type EarnRow = {
  id: string; date: string; rider99_id: string; rider_name: string; phone: string; account: string;
  cpf: string; city: string; total: number; trip_income: number; cash_debt: number;
  meal_deduction: number; bonus: number; other: number; tips: number;
  manual_adjust: number; referral_bonus: number; pix: string; orders: number;
  settle_amount: number; imported_at: string;
};

export function earningToRow(e: RiderDailyEarning): EarnRow {
  return {
    id: e.id, date: e.date, rider99_id: e.rider99Id, rider_name: e.riderName ?? "", account: e.account ?? "main",
    phone: e.phone ?? "", cpf: e.cpf ?? "", city: e.city ?? "",
    total: e.total ?? 0, trip_income: e.tripIncome ?? 0, cash_debt: e.cashDebt ?? 0,
    meal_deduction: e.mealDeduction ?? 0, bonus: e.bonus ?? 0, other: e.other ?? 0,
    tips: e.tips ?? 0, manual_adjust: e.manualAdjust ?? 0,
    referral_bonus: e.referralBonus ?? 0, pix: e.pix ?? "",
    orders: e.orders ?? 0, settle_amount: e.settleAmount ?? 0,
    imported_at: e.importedAt ?? "",
  };
}

export function rowToEarning(r: EarnRow): RiderDailyEarning {
  return {
    id: r.id, date: r.date, rider99Id: r.rider99_id, riderName: r.rider_name,
    account: r.account === "pro" ? "pro" : "main",
    phone: r.phone, cpf: r.cpf, city: r.city,
    total: Number(r.total), tripIncome: Number(r.trip_income), cashDebt: Number(r.cash_debt),
    mealDeduction: Number(r.meal_deduction), bonus: Number(r.bonus), other: Number(r.other),
    tips: Number(r.tips), manualAdjust: Number(r.manual_adjust),
    referralBonus: Number(r.referral_bonus), pix: r.pix,
    orders: Number(r.orders), settleAmount: Number(r.settle_amount),
    importedAt: r.imported_at,
  };
}

// ---- writes (dual-write targets) ---------------------------------------------

export async function upsertKpis(kpis: RiderDailyKpi[]): Promise<void> {
  await upsertRows("t1_rider_daily_kpis", kpis.map(kpiToRow), "id");
}

export async function upsertEarnings(earnings: RiderDailyEarning[]): Promise<void> {
  await upsertRows("t1_rider_daily_earnings", earnings.map(earningToRow), "id");
}

export async function deleteKpisByDate(date: string): Promise<void> {
  await deleteRows("t1_rider_daily_kpis", { date });
}

export async function deleteEarningsByDate(date: string): Promise<void> {
  await deleteRows("t1_rider_daily_earnings", { date });
}

// ---- reads (used when CORE_MODE_PERF=read) -----------------------------------

async function kpiRows(where: Where): Promise<RiderDailyKpi[]> {
  return (await selectRows<KpiRow>("t1_rider_daily_kpis", { where })).map(rowToKpi);
}
async function earningRows(where: Where): Promise<RiderDailyEarning[]> {
  return (await selectRows<EarnRow>("t1_rider_daily_earnings", { where })).map(rowToEarning);
}

export const kpisByDate = (date: string) => kpiRows({ date });
export const kpisByRider99 = (rider99Id: string) => kpiRows({ rider99_id: rider99Id });
export const kpisByRiderName = (name: string) => kpiRows({ rider_name: name });
export const earningsByDate = (date: string) => earningRows({ date });
export const earningsByRider99 = (rider99Id: string) => earningRows({ rider99_id: rider99Id });

export async function earningsByDateRange(from: string, to: string): Promise<RiderDailyEarning[]> {
  const rows = await selectRows<EarnRow>("t1_rider_daily_earnings", {
    range: [
      { column: "date", op: "gte", value: from },
      { column: "date", op: "lte", value: to },
    ],
  });
  return rows.map(rowToEarning);
}

export async function kpisByDateRange(from: string, to: string): Promise<RiderDailyKpi[]> {
  const rows = await selectRows<KpiRow>("t1_rider_daily_kpis", {
    range: [
      { column: "date", op: "gte", value: from },
      { column: "date", op: "lte", value: to },
    ],
  });
  return rows.map(rowToKpi);
}

// ---- table-backed aggregates ---------------------------------------------------

export const perfDatesT = () => callTransaction<string[]>("perf_dates_t", {});
export const perfTrendT = (days = 30, riderIds: string[] | null = null) =>
  callTransaction<Array<{ date: string; orders: number; proOrders: number; settle: number }>>("perf_trend_t", { p_days: days, p_rider_ids: riderIds });
export const kpiLeaderboardT = (limit = 10) =>
  callTransaction<Array<{ name: string; orders: number }>>("kpi_leaderboard_t", { p_limit: limit });
export const earningsSettledTotalsT = (today: string) =>
  callTransaction<Array<{ rider99Id: string; settled: number }>>("earnings_settled_totals_t", { p_today: today });
export const earningsMaxDateT = () => callTransaction<string | null>("earnings_max_date_t", {});
