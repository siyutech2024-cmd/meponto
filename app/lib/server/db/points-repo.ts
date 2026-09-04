import type { PointsLedgerEntry } from "../../points";
import { callTransaction, coreMode, selectRows, upsertRows } from "./core";

/**
 * M2 / Wave 1 repository: points_ledger + points_balances + the atomic
 * redeem/release RPCs (docs/data-core-cure-plan.md §3 W1, phase2 draft §3).
 * Rollout flag: CORE_MODE_TXCORE.
 */
export const TXCORE_MODULE = "txcore";
export const txcoreMode = () => coreMode(TXCORE_MODULE);

type LedgerRow = {
  id: string; rider_id: string; account_id: string; type: string; points: number;
  status: string; source_type: string; source_id: string; partner_id: string | null;
  marketplace_order_id: string | null; campaign_id: string | null; expires_at: string | null;
  balance_after: number; reason_code: string; note: string; created_by: string;
  created_at: string; approved_by: string | null; approved_at: string | null;
};

export function ledgerToRow(e: PointsLedgerEntry): LedgerRow {
  return {
    id: e.id, rider_id: e.riderId, account_id: e.accountId ?? "", type: e.type,
    points: e.points, status: e.status, source_type: e.sourceType ?? "",
    source_id: e.sourceId ?? "", partner_id: e.partnerId ?? null,
    marketplace_order_id: e.marketplaceOrderId ?? null, campaign_id: e.campaignId ?? null,
    expires_at: e.expiresAt ?? null, balance_after: e.balanceAfter ?? 0,
    reason_code: e.reasonCode ?? "", note: e.note ?? "", created_by: e.createdBy ?? "",
    created_at: e.createdAt ?? "", approved_by: e.approvedBy ?? null,
    approved_at: e.approvedAt ?? null,
  };
}

export function rowToLedger(r: LedgerRow): PointsLedgerEntry {
  return {
    id: r.id, riderId: r.rider_id, accountId: r.account_id,
    type: r.type as PointsLedgerEntry["type"], points: Number(r.points),
    status: r.status as PointsLedgerEntry["status"],
    sourceType: r.source_type as PointsLedgerEntry["sourceType"], sourceId: r.source_id,
    partnerId: r.partner_id ?? undefined,
    marketplaceOrderId: r.marketplace_order_id ?? undefined,
    campaignId: r.campaign_id ?? undefined, expiresAt: r.expires_at ?? undefined,
    balanceAfter: Number(r.balance_after), reasonCode: r.reason_code, note: r.note,
    createdBy: r.created_by, createdAt: r.created_at,
    approvedBy: r.approved_by ?? undefined, approvedAt: r.approved_at ?? undefined,
  };
}

/** Dual-write target: mirror new/changed legacy entries (upsert by id). */
export async function upsertLedgerEntries(entries: PointsLedgerEntry[]): Promise<void> {
  await upsertRows("points_ledger", entries.map(ledgerToRow), "id");
}

export async function ledgerByRider(riderId: string): Promise<PointsLedgerEntry[]> {
  const rows = await selectRows<LedgerRow>("points_ledger", {
    where: { rider_id: riderId },
    orderBy: { column: "created_at", ascending: false },
  });
  return rows.map(rowToLedger);
}

export async function balanceFor(riderId: string): Promise<number> {
  // points_balances is keyed by rider_id, not id.
  const rows = await selectRows<{ available: number }>("points_balances", { where: { rider_id: riderId }, tiebreak: "rider_id" });
  return Number(rows[0]?.available ?? 0);
}

// ---- atomic transactions (phase2 §3) ------------------------------------------

export type RedeemParams = {
  orderId: string; riderId: string; productId: string; points: number;
  stationId: string; mode?: string; idempotencyKey: string;
  enforceStock?: boolean; extra?: Record<string, unknown>;
};

export function redeemOrderTx(p: RedeemParams) {
  return callTransaction<Record<string, unknown>>("redeem_order", {
    p_order_id: p.orderId, p_rider_id: p.riderId, p_product_id: p.productId,
    p_points: p.points, p_station_id: p.stationId, p_mode: p.mode ?? "standard",
    p_idempotency_key: p.idempotencyKey, p_enforce_stock: p.enforceStock ?? false,
    p_extra: p.extra ?? {},
  });
}

export function releaseOrderTx(orderId: string, opts: { restock?: boolean; stationId?: string; mode?: string } = {}) {
  return callTransaction<Record<string, unknown>>("release_order", {
    p_order_id: orderId, p_restock: opts.restock ?? false,
    p_station_id: opts.stationId ?? null, p_mode: opts.mode ?? "standard",
  });
}

/** Reconciliation invariant: balances snapshot vs ledger recomputation. */
export function balanceCheck() {
  return callTransaction<{ mismatchCount: number; samples: unknown[] }>("txcore_balance_check", {});
}

/** Recompute the balances projection for the given riders (dual-write mirror). */
export function recomputeBalances(riderIds: string[]) {
  if (riderIds.length === 0) return Promise.resolve(0);
  return callTransaction<number>("txcore_recompute_balances", { p_rider_ids: riderIds });
}
