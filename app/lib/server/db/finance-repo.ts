import type { RiderWithdrawal, WalletPayment } from "../../finance";
import { coreMode, selectRows, upsertRows } from "./core";

/**
 * M3 / Wave 3 batch 1 repository: rider_withdrawals + wallet_payments
 * (docs/data-core-cure-plan.md §3 W3). Rollout flag: CORE_MODE_FIN.
 * Later W3 batches (cash/deposit/revenue-share ledgers) copy this pattern.
 */
export const FIN_MODULE = "fin";
export const finMode = () => coreMode(FIN_MODULE);

type WithdrawalRow = {
  id: string; rider_id: string; rider_name: string; rider99_id: string; pix: string;
  franchise: string; station: string; amount: number; status: string;
  requested_at: string; paid_at: string | null; paid_by: string | null;
  rejected_at: string | null; note: string | null;
};

export function withdrawalToRow(w: RiderWithdrawal): WithdrawalRow {
  return {
    id: w.id, rider_id: w.riderId ?? "", rider_name: w.riderName ?? "",
    rider99_id: w.rider99Id ?? "", pix: w.pix ?? "", franchise: w.franchise ?? "",
    station: w.station ?? "", amount: w.amount, status: w.status,
    requested_at: w.requestedAt ?? "", paid_at: w.paidAt ?? null,
    paid_by: w.paidBy ?? null, rejected_at: w.rejectedAt ?? null, note: w.note ?? null,
  };
}

export function rowToWithdrawal(r: WithdrawalRow): RiderWithdrawal {
  return {
    id: r.id, riderId: r.rider_id, riderName: r.rider_name, rider99Id: r.rider99_id,
    pix: r.pix, franchise: r.franchise, station: r.station, amount: Number(r.amount),
    status: r.status as RiderWithdrawal["status"], requestedAt: r.requested_at,
    paidAt: r.paid_at ?? undefined, paidBy: r.paid_by ?? undefined,
    rejectedAt: r.rejected_at ?? undefined, note: r.note ?? undefined,
  };
}

type PaymentRow = {
  id: string; target: string; ref_name: string; franchise: string; amount: number;
  period: string; week_from: string; week_to: string; note: string;
  paid_by: string; paid_at: string;
  /** 2026-09-05/06(migration 20260905120000)。PostgREST 批量 upsert 取所有对象键的
   *  并集作列清单且缺键写 NULL,所以三列**每行都要给出**(settlement / null),否则同一批里
   *  只要有一条佣金行,整批就会因 kind NOT NULL 失败。迁移必须先于代码上线。 */
  kind: string; commission: WalletPayment["commission"] | null;
  rider99_id: string | null;
};

export function paymentToRow(p: WalletPayment): PaymentRow {
  return {
    id: p.id, target: p.target, ref_name: p.refName ?? "", franchise: p.franchise ?? "",
    amount: p.amount, period: p.period ?? "weekly", week_from: p.weekFrom ?? "",
    week_to: p.weekTo ?? "", note: p.note ?? "", paid_by: p.paidBy ?? "",
    paid_at: p.paidAt ?? "",
    kind: p.kind === "commission" ? "commission" : "settlement",
    commission: p.kind === "commission" ? p.commission ?? null : null,
    rider99_id: p.rider99Id ?? null,
  };
}

export function rowToPayment(r: PaymentRow): WalletPayment {
  return {
    id: r.id, target: r.target as WalletPayment["target"], refName: r.ref_name,
    franchise: r.franchise, amount: Number(r.amount),
    period: r.period as WalletPayment["period"], weekFrom: r.week_from,
    weekTo: r.week_to, note: r.note, paidBy: r.paid_by, paidAt: r.paid_at,
    ...(r.kind === "commission" ? { kind: "commission" as const, commission: r.commission ?? undefined } : {}),
    ...(r.rider99_id ? { rider99Id: r.rider99_id } : {}),
  };
}

// ---- dual-write targets (flush-pipeline mirror) --------------------------------

export async function upsertWithdrawals(rows: RiderWithdrawal[]): Promise<void> {
  await upsertRows("rider_withdrawals", rows.map(withdrawalToRow), "id");
}

export async function upsertPayments(rows: WalletPayment[]): Promise<void> {
  await upsertRows("wallet_payments", rows.map(paymentToRow), "id");
}

// ---- reads (used when CORE_MODE_FIN=read) --------------------------------------

export async function withdrawalsByRider99(rider99Id: string): Promise<RiderWithdrawal[]> {
  const rows = await selectRows<WithdrawalRow>("rider_withdrawals", {
    where: { rider99_id: rider99Id },
    orderBy: { column: "requested_at", ascending: false },
  });
  return rows.map(rowToWithdrawal);
}

export async function pendingWithdrawals(): Promise<RiderWithdrawal[]> {
  const rows = await selectRows<WithdrawalRow>("rider_withdrawals", { where: { status: "requested" } });
  return rows.map(rowToWithdrawal);
}
