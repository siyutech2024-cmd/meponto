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
  target: "franchise" | "rider";
  /** Franchise name, or rider name when target=rider. */
  refName: string;
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
