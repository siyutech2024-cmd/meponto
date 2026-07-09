/**
 * Procurement margin ledger posting — the ONLY sanctioned way to record the
 * platform's direct-procurement profit (Hard Rule #4, append-only).
 *
 * Accrual timing ("以资金实际发生为准" — accrue when money actually moves):
 * - buyout_spread:      at FPO creation, AFTER every cart leg's deposit debit
 *   succeeded (createFPO debits the franchise prepaid deposit synchronously,
 *   so creation IS the moment the platform's cash position changes).
 *   Cancel / reject / short-receive / exception-close post compensating
 *   NEGATIVE entries mirroring the deposit-ledger refund pattern.
 * - consignment_spread: when a mall redemption consumes the CONSIGNMENT
 *   station pool at pickup (the M3 outbound in markPickedUp) — that is the
 *   moment the supplier becomes payable and the platform's spread is earned.
 *
 * V1 margin base for consignment (documented simplification): the redemption
 * economic value is `pointsPrice / pointsRules.pointsPerBrlReference +
 * cashPriceBRL` per unit — the standard points→R$ reference conversion. If a
 * finer per-order valuation (coupons, tier discounts) is needed it can be
 * layered on later; entries carry a note with the formula used.
 *
 * Settlement: entries stay "accrued" until the month's supplier statement is
 * paid (`payStatement` in /api/mall/ops flips matching entries to "settled",
 * same linkage pattern as the batch3 ProcurementFeeEntry model). HQ-warehouse
 * legs have no supplier statement — their margin realizes immediately and is
 * written as "settled".
 *
 * Idempotency: one entry per `sourceId`; replays return the existing entry.
 */

import { round2, type FranchisePurchaseOrder, type ProcurementMarginEntry, type ProcurementMarginKind, type ProcurementMarginStatus } from "../procurement";
import { pointsRules } from "../points";
import { appendEvent, PROCUREMENT_EVENTS } from "./events";
import { makeServerId, memory } from "./memory";

function nowStamp() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function monthNow() {
  return new Date().toISOString().slice(0, 7);
}

export function postProcurementMargin(input: {
  fpoId: string;
  franchise: string;
  supplierName: string;
  kind: ProcurementMarginKind;
  goodsCostTotal: number;
  chargedTotal: number;
  status: ProcurementMarginStatus;
  sourceId: string;
  note?: string;
  actor: string;
}): ProcurementMarginEntry {
  const existing = memory.procurementMarginEntries.find((entry) => entry.sourceId === input.sourceId);
  if (existing) return existing; // idempotent replay

  const entry: ProcurementMarginEntry = {
    id: makeServerId("pme", memory.procurementMarginEntries.length + 1),
    fpoId: input.fpoId,
    franchise: input.franchise,
    supplierName: input.supplierName,
    kind: input.kind,
    goodsCostTotal: round2(input.goodsCostTotal),
    chargedTotal: round2(input.chargedTotal),
    marginTotal: round2(input.chargedTotal - input.goodsCostTotal),
    month: monthNow(),
    status: input.status,
    sourceId: input.sourceId,
    note: input.note?.slice(0, 200) || undefined,
    createdAt: nowStamp(),
  };
  memory.procurementMarginEntries.unshift(entry);
  appendEvent(
    PROCUREMENT_EVENTS.marginAccrued,
    {
      entryId: entry.id,
      fpoId: entry.fpoId,
      franchise: entry.franchise,
      supplierName: entry.supplierName,
      kind: entry.kind,
      goodsCostTotal: entry.goodsCostTotal,
      chargedTotal: entry.chargedTotal,
      marginTotal: entry.marginTotal,
      month: entry.month,
      status: entry.status,
    },
    input.actor,
  );
  return entry;
}

/**
 * Accrue the buyout spread for a freshly debited buyout FPO.
 * Uses ONLY the price snapshots on the FPO items (unitPrice = buyout price,
 * supplyPrice = supplier cost) — never re-reads current product prices.
 */
export function accrueBuyoutMargin(fpo: FranchisePurchaseOrder, actor: string): ProcurementMarginEntry | null {
  if (fpo.mode !== "buyout") return null;
  const goodsCostTotal = round2(fpo.items.reduce((sum, item) => sum + item.qty * (item.supplyPrice ?? 0), 0));
  return postProcurementMargin({
    fpoId: fpo.id,
    franchise: fpo.franchise,
    supplierName: fpo.supplierName,
    kind: "buyout_spread",
    goodsCostTotal,
    chargedTotal: fpo.totalBRL,
    // HQ-warehouse legs have no supplier payable — margin realizes at debit.
    status: fpo.source === "hq" ? "settled" : "accrued",
    sourceId: `fpo:${fpo.id}:accrue`,
    note: `buyout debit ${fpo.franchise} → ${fpo.stationName}`,
    actor,
  });
}

/**
 * Compensating NEGATIVE entry when buyout money flows back to the franchise
 * (cancel / reject / short-receive refund / exception close). Append-only:
 * the original accrual is never touched. `portion` limits the reversal (short
 * receipts); omitted = full reversal of the original accrual amounts.
 */
export function reverseBuyoutMargin(
  fpo: FranchisePurchaseOrder,
  portion: { goodsCost: number; charged: number } | null,
  reasonKey: string,
  actor: string,
): ProcurementMarginEntry | null {
  const accrual = memory.procurementMarginEntries.find((entry) => entry.sourceId === `fpo:${fpo.id}:accrue`);
  if (!accrual) return null; // nothing was accrued (e.g. consignment FPO)
  const goodsCost = portion ? round2(portion.goodsCost) : accrual.goodsCostTotal;
  const charged = portion ? round2(portion.charged) : accrual.chargedTotal;
  if (charged === 0 && goodsCost === 0) return null;
  return postProcurementMargin({
    fpoId: fpo.id,
    franchise: fpo.franchise,
    supplierName: fpo.supplierName,
    kind: "buyout_spread",
    goodsCostTotal: -goodsCost,
    chargedTotal: -charged,
    status: accrual.status,
    sourceId: `fpo:${fpo.id}:reverse:${reasonKey}`,
    note: `reversal (${reasonKey})`,
    actor,
  });
}

/**
 * Accrue the consignment spread when a redemption consumes `qty` units from
 * the CONSIGNMENT pool. V1 valuation (documented simplification): charged =
 * pointsPrice / pointsPerBrlReference + cashPriceBRL per unit; cost = current
 * product supplyPrice (the pool has no per-unit price snapshot).
 */
export function accrueConsignmentMargin(input: {
  orderId: string;
  productId: string;
  franchise: string;
  qty: number;
  actor: string;
}): ProcurementMarginEntry | null {
  const qty = Math.trunc(input.qty);
  if (qty <= 0) return null;
  const product = memory.marketplaceProducts.find((item) => item.id === input.productId);
  if (!product) return null;
  const supplyPrice = product.supplyPrice ?? 0;
  const unitValue = round2((product.pointsPrice ?? 0) / pointsRules.pointsPerBrlReference + (product.cashPriceBRL ?? 0));
  const supplierName = product.supplierName || "HQ";
  return postProcurementMargin({
    // For consignment_spread `fpoId` carries the CONSUMING mall order id —
    // the supplier-statement line for the same order uses the same id, which
    // is what `payStatement` matches on to flip accrued → settled.
    fpoId: input.orderId,
    franchise: input.franchise,
    supplierName,
    kind: "consignment_spread",
    goodsCostTotal: round2(qty * supplyPrice),
    chargedTotal: round2(qty * unitValue),
    // HQ-owned consignment pool has no supplier payable — settled immediately.
    status: product.supplierName ? "accrued" : "settled",
    sourceId: `order:${input.orderId}:consign`,
    note: `V1 valuation: pointsPrice/${pointsRules.pointsPerBrlReference} + cashPriceBRL − supplyPrice`,
    actor: input.actor,
  });
}
