/**
 * Station stock ledger posting — the ONLY sanctioned way to move station
 * inventory. Append-only entries per station × product × ownership pool
 * (consignment/buyout); balances are projections (Hard Rule #4).
 *
 * Idempotency: one entry per (stationId, productId, mode, type, sourceType,
 * sourceId). Replays return the existing entry without double-posting.
 */

import type { FpoMode, StationStockEntryType, StationStockLedgerEntry, StationStockSourceType } from "../procurement";
import { projectStationStock } from "../procurement";
import { appendEvent, PROCUREMENT_EVENTS } from "./events";
import { makeServerId, memory } from "./memory";

export type StockPostResult =
  | { ok: true; entry: StationStockLedgerEntry; replayed: boolean }
  | { ok: false; error: "invalid_qty" | "insufficient_stock" | "insufficient_reserved" };

function findEntry(input: {
  stationId: string;
  productId: string;
  mode: FpoMode;
  type: StationStockEntryType;
  sourceType: StationStockSourceType;
  sourceId: string;
}): StationStockLedgerEntry | undefined {
  return memory.stationStockLedgerEntries.find(
    (entry) =>
      entry.stationId === input.stationId &&
      entry.productId === input.productId &&
      entry.mode === input.mode &&
      entry.type === input.type &&
      entry.sourceType === input.sourceType &&
      entry.sourceId === input.sourceId,
  );
}

const eventForType: Record<StationStockEntryType, string> = {
  inbound: PROCUREMENT_EVENTS.stockInbound,
  outbound: PROCUREMENT_EVENTS.stockOutbound,
  reserve: PROCUREMENT_EVENTS.stockReserved,
  release: PROCUREMENT_EVENTS.stockReleased,
  adjust: PROCUREMENT_EVENTS.stockAdjusted,
  transfer_in: PROCUREMENT_EVENTS.stockTransferred,
  transfer_out: PROCUREMENT_EVENTS.stockTransferred,
};

/**
 * Post one signed stock movement. `qty` sign conventions:
 * inbound/release/transfer_in > 0; outbound/reserve/transfer_out < 0;
 * adjust may be either. On-hand can never go negative; reservations can
 * never exceed on-hand and never release below zero.
 */
export function postStationStock(input: {
  stationId: string;
  stationName: string;
  productId: string;
  productName: string;
  mode: FpoMode;
  type: StationStockEntryType;
  qty: number;
  sourceType: StationStockSourceType;
  sourceId: string;
  note?: string;
  createdBy: string;
}): StockPostResult {
  const qty = Math.trunc(input.qty);
  if (!Number.isFinite(qty) || qty === 0) return { ok: false, error: "invalid_qty" };
  const positive = ["inbound", "release", "transfer_in"].includes(input.type);
  const negative = ["outbound", "reserve", "transfer_out"].includes(input.type);
  if ((positive && qty < 0) || (negative && qty > 0)) return { ok: false, error: "invalid_qty" };

  const existing = findEntry(input);
  if (existing) return { ok: true, entry: existing, replayed: true };

  const buckets = projectStationStock(memory.stationStockLedgerEntries);
  const bucket = buckets.get(`${input.stationId}::${input.productId}::${input.mode}`);
  const onHand = bucket?.qty ?? 0;
  const reserved = bucket?.reserved ?? 0;

  let nextOnHand = onHand;
  if (input.type === "reserve") {
    if (onHand - reserved < Math.abs(qty)) return { ok: false, error: "insufficient_stock" };
  } else if (input.type === "release") {
    if (reserved < qty) return { ok: false, error: "insufficient_reserved" };
  } else {
    nextOnHand = onHand + qty;
    if (nextOnHand < 0) return { ok: false, error: "insufficient_stock" };
  }

  const entry: StationStockLedgerEntry = {
    id: makeServerId("ssl", memory.stationStockLedgerEntries.length + 1),
    stationId: input.stationId,
    stationName: input.stationName,
    productId: input.productId,
    productName: input.productName,
    mode: input.mode,
    type: input.type,
    qty,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    balanceAfter: nextOnHand,
    note: input.note?.slice(0, 200) || undefined,
    createdBy: input.createdBy,
    createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
  };
  memory.stationStockLedgerEntries.unshift(entry);

  appendEvent(
    eventForType[input.type],
    {
      stationId: input.stationId,
      stationName: input.stationName,
      productId: input.productId,
      mode: input.mode,
      type: input.type,
      qty,
      balanceAfter: entry.balanceAfter,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    },
    input.createdBy,
  );

  return { ok: true, entry, replayed: false };
}

/**
 * Consume station stock for a fulfilled redemption order, consignment pool
 * first, then buyout (docs/franchise-procurement-full-chain-plan.md §3.3).
 * Returns the pools consumed so settlement can exclude buyout units.
 */
export function consumeStationStockForOrder(input: {
  stationId: string;
  stationName: string;
  productId: string;
  productName: string;
  qty: number;
  orderId: string;
  createdBy: string;
}): { consumed: Array<{ mode: FpoMode; qty: number }>; shortage: number } {
  const buckets = projectStationStock(memory.stationStockLedgerEntries);
  let remaining = Math.max(0, Math.trunc(input.qty));
  const consumed: Array<{ mode: FpoMode; qty: number }> = [];
  for (const mode of ["consignment", "buyout"] as const) {
    if (remaining <= 0) break;
    const bucket = buckets.get(`${input.stationId}::${input.productId}::${mode}`);
    const available = bucket ? Math.max(0, bucket.qty) : 0;
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    const posted = postStationStock({
      stationId: input.stationId,
      stationName: input.stationName,
      productId: input.productId,
      productName: input.productName,
      mode,
      type: "outbound",
      qty: -take,
      sourceType: "mall_order",
      sourceId: input.orderId,
      createdBy: input.createdBy,
    });
    if (posted.ok) {
      consumed.push({ mode, qty: take });
      remaining -= take;
    }
  }
  return { consumed, shortage: remaining };
}
