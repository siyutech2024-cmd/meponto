/**
 * Franchise procurement domain — 加盟商采购全链路 (PontoMall supply chain).
 *
 * Implements docs/franchise-procurement-full-chain-plan.md:
 * - FranchisePurchaseOrder (FPO): franchise orders goods to one of its
 *   stations. Consignment (no payable, monthly statement) or buyout
 *   (debited from the franchise prepaid deposit, ledgered).
 * - Station stock ledger: append-only entries per station × product × mode
 *   (ownership pool). Balances are projections, never mutated directly.
 * - Franchise deposit ledger: append-only money entries mirroring
 *   Franchise.depositBalance (Hard Rule #4 — ledger first).
 *
 * All records are plain JSON so the universal persistence layer can mirror
 * them into `app_state_records`.
 */

export type FpoMode = "consignment" | "buyout";
export type FpoSource = "supplier" | "hq";

export type FpoStatus =
  | "submitted"
  | "approved"
  | "confirmed"
  | "shipped"
  | "arrived"
  | "received"
  | "rejected"
  | "cancelled";

/** Legal state-machine transitions; anything else must be rejected with 409. */
export const FPO_TRANSITIONS: Record<FpoStatus, FpoStatus[]> = {
  submitted: ["approved", "rejected", "cancelled"],
  approved: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["arrived", "received", "cancelled"], // cancelled only via HQ exception close
  arrived: ["received"],
  received: [],
  rejected: [],
  cancelled: [],
};

export type FpoItem = {
  productId: string;
  name: string;
  qty: number;
  /** Price snapshot at order time (consignment: supplyPrice reference; buyout: franchiseBuyoutPrice). Never re-read later. */
  unitPrice: number;
  /** Supplier supply-price snapshot at order time — used for buyout supplier settlement lines. */
  supplyPrice?: number;
  /** Filled at receiving time; differences produce discrepancy records. */
  receivedQty?: number;
};

export type FranchisePurchaseOrder = {
  id: string;
  franchise: string;
  stationId: string;
  stationName: string;
  /** Single supplier per FPO; carts are split server-side. "HQ" = central warehouse. */
  supplierName: string;
  source: FpoSource;
  mode: FpoMode;
  items: FpoItem[];
  /** buyout: amount debited from the deposit; consignment: stocking reference cost (no payable). */
  totalBRL: number;
  status: FpoStatus;
  note?: string;
  shipNote?: string;
  createdAt: string;
  createdBy: string;
  /** Set when auto-approved below the configured threshold. */
  autoApproved?: boolean;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  confirmedAt?: string;
  shippedAt?: string;
  arrivedAt?: string;
  receivedAt?: string;
  receivedBy?: string;
  cancelledAt?: string;
  cancelReason?: string;
  /** Linked deposit ledger entry ids (buyout debit / refunds). */
  depositLedgerIds?: string[];
};

export type StationStockEntryType =
  | "inbound"
  | "outbound"
  | "reserve"
  | "release"
  | "adjust"
  | "transfer_in"
  | "transfer_out";

export type StationStockSourceType = "fpo" | "mall_order" | "manual" | "transfer";

export type StationStockLedgerEntry = {
  id: string;
  stationId: string;
  stationName: string;
  productId: string;
  productName: string;
  /** Ownership pool — consignment vs buyout. Settlement must never double-bill buyout goods. */
  mode: FpoMode;
  type: StationStockEntryType;
  /** Signed quantity: inbound/release/transfer_in/adjust(+) > 0; outbound/reserve/transfer_out/adjust(−) < 0. */
  qty: number;
  sourceType: StationStockSourceType;
  /** Idempotency: one entry per (stationId, productId, mode, type, sourceType, sourceId). */
  sourceId: string;
  /** On-hand balance after this entry for the station×product×mode pool (reserve/release affect `reserved`, not on-hand). */
  balanceAfter: number;
  note?: string;
  createdBy: string;
  createdAt: string;
};

export type DiscrepancyKind = "short" | "damage" | "excess" | "writeoff";
export type DiscrepancyResolution = "pending" | "refunded" | "reship" | "writeoff" | "closed";

export type ProcurementDiscrepancy = {
  id: string;
  fpoId: string;
  franchise: string;
  stationId: string;
  stationName: string;
  productId: string;
  productName: string;
  mode: FpoMode;
  orderedQty: number;
  receivedQty: number;
  kind: DiscrepancyKind;
  resolution: DiscrepancyResolution;
  /** R$ automatically refunded for buyout shortages. */
  refundBRL?: number;
  note?: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
};

export type FranchiseDepositEntryType = "topup" | "order_debit" | "order_refund" | "adjust";
export type FranchiseDepositSourceType = "fpo" | "manual" | "network" | "wallet" | "topup";

export type FranchiseDepositLedgerEntry = {
  id: string;
  franchise: string;
  type: FranchiseDepositEntryType;
  /** Signed: debit < 0, topup/refund > 0, adjust either. */
  amountBRL: number;
  sourceType: FranchiseDepositSourceType;
  /** Idempotency: one entry per (franchise, type, sourceType, sourceId). */
  sourceId: string;
  balanceAfter: number;
  note?: string;
  createdBy: string;
  createdAt: string;
};

export type ProcurementMarginKind = "buyout_spread" | "consignment_spread";
export type ProcurementMarginStatus = "accrued" | "settled";

/**
 * Explicit direct-procurement margin ledger (append-only, Hard Rule #4).
 *
 * Makes the platform's procurement profit VISIBLE to finance instead of an
 * implicit price spread:
 * - buyout_spread:      franchiseBuyoutPrice − supplyPrice (snapshots) at the
 *   moment the franchise deposit is actually debited (FPO creation).
 * - consignment_spread: redemption economic value − supplyPrice when a mall
 *   redemption consumes the CONSIGNMENT station pool at pickup.
 * Corrections (cancel/reject/short/exception) are compensating negative
 * entries — records are never mutated (only `status` flips accrued→settled
 * when the monthly supplier statement is paid).
 */
export type ProcurementMarginEntry = {
  id: string;
  /** Source document: FPO id for buyout_spread; mall order id for consignment_spread. */
  fpoId: string;
  franchise: string;
  supplierName: string;
  kind: ProcurementMarginKind;
  /** Supplier goods cost (supplyPrice snapshot × qty). Negative on compensating reversals. */
  goodsCostTotal: number;
  /** Amount the platform actually charged (buyout price / redemption value). Negative on reversals. */
  chargedTotal: number;
  /** chargedTotal − goodsCostTotal. */
  marginTotal: number;
  /** Natural month "YYYY-MM" the margin belongs to. */
  month: string;
  /** accrued → settled when the month's supplier statement is paid (payStatement). */
  status: ProcurementMarginStatus;
  /** Idempotency key — one entry per business occurrence (accrual/reversal). */
  sourceId: string;
  note?: string;
  createdAt: string;
};

export type DepositTopUpStatus = "submitted" | "confirmed" | "rejected";

export type FranchiseDepositTopUp = {
  id: string;
  franchise: string;
  amountBRL: number;
  /** PIX transfer reference submitted by the franchise. */
  pixRef: string;
  status: DepositTopUpStatus;
  createdAt: string;
  createdBy: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionNote?: string;
};

export const round2 = (value: number) => Math.round(value * 100) / 100;

export const fpoItemTotal = (item: Pick<FpoItem, "qty" | "unitPrice">) => round2(item.qty * item.unitPrice);

export const fpoTotal = (items: Array<Pick<FpoItem, "qty" | "unitPrice">>) =>
  round2(items.reduce((sum, item) => sum + fpoItemTotal(item), 0));

export type StationStockBucket = {
  stationId: string;
  stationName: string;
  productId: string;
  productName: string;
  mode: FpoMode;
  /** On-hand quantity (inbound/outbound/adjust/transfer entries). */
  qty: number;
  /** Actively reserved by pending redemptions (reserve − release − consumed). */
  reserved: number;
};

const bucketKey = (stationId: string, productId: string, mode: FpoMode) => `${stationId}::${productId}::${mode}`;

/** Project the append-only ledger into per-pool balances. */
export function projectStationStock(entries: StationStockLedgerEntry[]): Map<string, StationStockBucket> {
  const buckets = new Map<string, StationStockBucket>();
  // Entries are stored newest-first; projection order does not matter for sums.
  for (const entry of entries) {
    const key = bucketKey(entry.stationId, entry.productId, entry.mode);
    const bucket =
      buckets.get(key) ??
      ({
        stationId: entry.stationId,
        stationName: entry.stationName,
        productId: entry.productId,
        productName: entry.productName,
        mode: entry.mode,
        qty: 0,
        reserved: 0,
      } satisfies StationStockBucket);
    if (entry.type === "reserve") bucket.reserved += Math.abs(entry.qty);
    else if (entry.type === "release") bucket.reserved -= Math.abs(entry.qty);
    else bucket.qty += entry.qty;
    // Consuming a reservation: the outbound entry also clears the hold.
    if (entry.type === "outbound" && entry.sourceType === "mall_order") bucket.reserved -= Math.abs(entry.qty);
    buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) {
    if (bucket.reserved < 0) bucket.reserved = 0;
  }
  return buckets;
}

export function stationStockBalance(
  entries: StationStockLedgerEntry[],
  stationId: string,
  productId: string,
  mode: FpoMode,
): { qty: number; reserved: number } {
  const bucket = projectStationStock(entries).get(bucketKey(stationId, productId, mode));
  return { qty: bucket?.qty ?? 0, reserved: bucket?.reserved ?? 0 };
}

/** Available = on-hand − reserved, across the two ownership pools of a product at a station. */
export function stationAvailable(entries: StationStockLedgerEntry[], stationId: string, productId: string): number {
  const projected = projectStationStock(entries);
  let available = 0;
  for (const mode of ["consignment", "buyout"] as const) {
    const bucket = projected.get(bucketKey(stationId, productId, mode));
    if (bucket) available += bucket.qty - bucket.reserved;
  }
  return Math.max(0, available);
}

export const fpoStatusOrder: FpoStatus[] = [
  "submitted",
  "approved",
  "confirmed",
  "shipped",
  "arrived",
  "received",
];
