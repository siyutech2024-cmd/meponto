/**
 * Rider settlement & withdrawal domain.
 *
 * Money flow (confirmed business rule):
 * - HQ settles ONLY with franchises (per-franchise payable = sum of their
 *   riders' settle amounts minus what the franchise already paid out).
 * - Rider balance = Σ T+1 settle amounts (riderDailyEarnings, available the
 *   day AFTER the business date) − Σ withdrawals that are requested or paid.
 * - Rider requests a withdrawal in the app → the franchise pays via PIX and
 *   confirms → balance drops, every step is recorded (ledger + audit).
 */

export type WithdrawalStatus = "requested" | "paid" | "rejected";

export type RiderWithdrawal = {
  id: string;
  riderId: string;
  riderName: string;
  rider99Id: string;
  pix: string;
  franchise: string;
  station: string;
  amount: number; // R$
  status: WithdrawalStatus;
  requestedAt: string;
  paidAt?: string;
  paidBy?: string;
  rejectedAt?: string;
  note?: string;
};

export const riderWithdrawals: RiderWithdrawal[] = [];

/** A recorded settlement payment (HQ→franchise or franchise/HQ→rider). */
export type WalletPayment = {
  id: string;
  /** "leader" = Leader Mode weekly station settlement (docs/leader-mode-design.md). */
  target: "franchise" | "rider" | "leader";
  /** Franchise name, rider name when target=rider, station name when target=leader. */
  refName: string;
  /** 2026-09-06 · target=rider 时的骑手 99ID。姓名会重名,新写入的骑手付款都带上它;
   *  读取时优先按 99ID 匹配,缺失(历史记录)才回退姓名。 */
  rider99Id?: string;
  /** Owning franchise (used for grouping rider payments). */
  franchise: string;
  amount: number; // R$
  period: "weekly" | "daily";
  /** Settlement window this payment covers (YYYY-MM-DD). */
  weekFrom: string;
  weekTo: string;
  note: string;
  paidBy: string;
  paidAt: string;
  /** Leader Mode settlements are generated as "pending" and confirmed by the
   *  franchisee (review gate). Legacy rows (undefined) mean "paid". */
  status?: "pending" | "paid";
  /**
   * 2026-09-05 · 加盟商佣金(总部 → 加盟商,按周)。
   *
   * undefined / "settlement" = 既有语义:总部付给加盟商的骑手结算款(会级联标记骑手已付)。
   * "commission" = 总部付给加盟商的**佣金**,与结算款完全分开显示,不级联、不计入
   * "已付·总部→商"。写入时把当周的计算依据整份快照进 `commission`,之后 KPI 重导入
   * 或规则调整都不再改变已付周的数字 —— 这就是"已结算的周不动"的实现方式。
   */
  kind?: "settlement" | "commission";
  commission?: FranchiseCommissionSnapshot;
};

/** 某加盟商某周佣金的计算依据快照(随 kind="commission" 的付款记录一起写入,只增不改)。 */
export type FranchiseCommissionSnapshot = {
  /** 抽佣比例(%),来自考核看板:最小抽佣 ± KPI 加减。 */
  pct: number;
  /** 基准:普通池骑手当周行程收入合计(R$)。 */
  tripIncome: number;
  /** 佣金 = round(tripIncome × pct / 100, 2)。 */
  commission: number;
  /** 加盟商应付骑手 = Σ 今日统计(所有收入 − 现金单 − 餐损),仅展示,不入账。 */
  riderPayable: number;
  /** 参与计算的普通池骑手数 / 有数据的天数。 */
  riders: number;
  days: number;
  /** 当周考核明细(与考核页同源),便于事后追溯为什么是这个比例。 */
  minPct: number;
  totalAdjust: number;
  metrics: Record<string, { actual: number | null; status: string; adjust: number }>;
};

export const walletPayments: WalletPayment[] = [];

/** Withdrawable = settled earnings up to YESTERDAY (T+1) minus holds/paid. */
export function computeBalance(
  earnings: Array<{ rider99Id: string; settleAmount: number; date: string }>,
  withdrawals: RiderWithdrawal[],
  rider99Id: string,
  today: string,
): { settled: number; held: number; paid: number; available: number } {
  const settled = earnings
    .filter((row) => row.rider99Id === rider99Id && row.date < today)
    .reduce((sum, row) => sum + (row.settleAmount || 0), 0);
  const held = withdrawals
    .filter((w) => w.rider99Id === rider99Id && w.status === "requested")
    .reduce((sum, w) => sum + w.amount, 0);
  const paid = withdrawals
    .filter((w) => w.rider99Id === rider99Id && w.status === "paid")
    .reduce((sum, w) => sum + w.amount, 0);
  return { settled, held, paid, available: Math.max(0, settled - held - paid) };
}
