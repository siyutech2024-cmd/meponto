/**
 * 结算口径 v2(2026-09-06 业务方定;生效周 = 考核规则的 commissionEffectiveFrom,
 * 缺省 2026-08-31)。这里是**唯一**决定"一行 T+1 数据值多少钱"的地方 —— 周结算板、
 * 每日对账单、付款校验、级联标记、骑手 App 钱包、倒扣待扣全部从这几个函数取数,
 * 不再各写一份。
 *
 * v2 口径(每骑手每日一行,字段全部是 T+1 表格原值,系统不改任何一个):
 *
 *   今日统计 total = 行程收入 tripIncome + 奖励 bonus + 小费 tips + 其他 other
 *                  + 人工调整 manualAdjust + 推荐奖励 referralBonus
 *                  − 现金单欠款 cashDebt − 餐损 mealDeduction
 *
 *   每日 · 加盟商 → 骑手   应付 = 今日统计(为负 = 倒扣待扣)
 *   每周 · 总部 → 加盟商   骑手工资 = Σ 今日统计(普通池);佣金 = 抽佣比例 × Σ 行程收入
 *                          两笔分开显示,互不冲抵。PRO 池维持 完单 × 费率(运营即将取消)。
 *   骑手 App 提现           停用,每日 Trampay 付款为准。
 *
 * v1 口径(生效周之前的所有日期,历史已结算,**一个字节不动**):
 *   应结 = settleAmount(= 表格"金额"列,实测恒等于行程收入)。
 */

import type { RiderDailyEarning } from "./performance";
import { commissionEffectiveFrom, type AssessmentRule } from "./assessment";

export type EarningLike = { date: string } & Partial<
  Pick<RiderDailyEarning, "account" | "total" | "tripIncome" | "cashDebt" | "mealDeduction" | "bonus" | "tips" | "other" | "manualAdjust" | "referralBonus" | "settleAmount">
>;

export const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/** v2 生效日(与佣金同一个开关:一个日期,一套口径)。 */
export function settlementV2From(rule: Pick<AssessmentRule, "commissionEffectiveFrom">): string {
  return commissionEffectiveFrom(rule);
}

/** 某个日期(YYYY-MM-DD)是否按 v2 口径。 */
export function isV2Date(date: string, v2From: string): boolean {
  return date >= v2From;
}

/** 五项加项合计(奖励 + 小费 + 其他 + 人工调整 + 推荐奖励)。 */
export function extrasOf(row: EarningLike): number {
  return r2((row.bonus ?? 0) + (row.tips ?? 0) + (row.other ?? 0) + (row.manualAdjust ?? 0) + (row.referralBonus ?? 0));
}

/** 按表格各列重算的今日统计;与 row.total 不一致说明表格本身或导入有问题。 */
export function recomputedTotal(row: EarningLike): number {
  return r2((row.tripIncome ?? 0) + extrasOf(row) - (row.cashDebt ?? 0) - (row.mealDeduction ?? 0));
}

/** 恒等式校验:|today − recomputed| ≤ 2 分为一致。PRO 行金额被清零,不校验。 */
export function totalIdentityHolds(row: EarningLike): boolean {
  if (row.account === "pro") return true;
  return Math.abs((row.total ?? 0) - recomputedTotal(row)) <= 0.02;
}

/**
 * 这一行值多少钱(加盟商应付骑手)。
 *  - PRO 行:0(金额由 完单 × 费率 在调用方推导,这里永远不参与)。
 *  - v2:今日统计。
 *  - v1:settleAmount(历史口径,不动)。
 */
export function payableOf(row: EarningLike, v2From: string): number {
  if (row.account === "pro") return 0;
  // 不在这里四舍五入:v1 周板/余额历来是"先累加原始 settleAmount 再 round",这里若逐行
  // round,分位可能与改动前差 1 分 —— 聚合处负责 round。
  const amount = isV2Date(row.date, v2From) ? row.total ?? 0 : row.settleAmount ?? 0;
  return Number.isFinite(amount) ? amount : 0;
}

/**
 * T+1 看板 / 报表等"展示用结算额"(不入账):PRO 行 = 完单 × 费率,普通行 = payableOf。
 * 让所有只读页面显示的那个数与钱包周板、付款守卫完全同源。
 */
export function displaySettleOf(row: EarningLike & { orders?: number }, riderPool: string | undefined, v2From: string, proRate: number): number {
  return poolOfRow(row, riderPool, v2From) === "pro" ? r2((row.orders ?? 0) * proRate) : r2(payableOf(row, v2From));
}

/**
 * 这一行属于哪个池。
 *  - v2:按行的 account(从哪张 OL 表导入)判定 —— 骑手中途转池,历史行不跟着变。
 *  - v1:按骑手档案当前 pool(历史口径,不动)。
 */
export function poolOfRow(row: EarningLike, riderPool: string | undefined, v2From: string): "standard" | "pro" {
  if (isV2Date(row.date, v2From)) return row.account === "pro" ? "pro" : "standard";
  return riderPool === "pro" ? "pro" : "standard";
}

// 倒扣判断只有一份实现:app/lib/performance.ts 的 deductionAmountOf(避免与 performance.ts 循环依赖)。

/** 每日对账单 / 周结算板共用的一行拆解(全部原值,只做加总不做推导)。 */
export type EarningBreakdown = {
  tripIncome: number;
  extras: number;
  cashDebt: number;
  mealDeduction: number;
  total: number;
  /** 恒等式是否成立(false 的行在页面标红)。 */
  consistent: boolean;
};

export function breakdownOf(row: EarningLike): EarningBreakdown {
  return {
    tripIncome: r2(row.tripIncome ?? 0),
    extras: extrasOf(row),
    cashDebt: r2(row.cashDebt ?? 0),
    mealDeduction: r2(row.mealDeduction ?? 0),
    total: r2(row.total ?? 0),
    consistent: totalIdentityHolds(row),
  };
}

export function addBreakdown(acc: EarningBreakdown, row: EarningLike): EarningBreakdown {
  const b = breakdownOf(row);
  return {
    tripIncome: r2(acc.tripIncome + b.tripIncome),
    extras: r2(acc.extras + b.extras),
    cashDebt: r2(acc.cashDebt + b.cashDebt),
    mealDeduction: r2(acc.mealDeduction + b.mealDeduction),
    total: r2(acc.total + b.total),
    consistent: acc.consistent && b.consistent,
  };
}

/** 两个拆解相加(加盟商合计 = Σ 骑手拆解)。 */
export function sumBreakdown(a: EarningBreakdown, b: EarningBreakdown): EarningBreakdown {
  return {
    tripIncome: r2(a.tripIncome + b.tripIncome),
    extras: r2(a.extras + b.extras),
    cashDebt: r2(a.cashDebt + b.cashDebt),
    mealDeduction: r2(a.mealDeduction + b.mealDeduction),
    total: r2(a.total + b.total),
    consistent: a.consistent && b.consistent,
  };
}

export const emptyBreakdown = (): EarningBreakdown => ({ tripIncome: 0, extras: 0, cashDebt: 0, mealDeduction: 0, total: 0, consistent: true });
