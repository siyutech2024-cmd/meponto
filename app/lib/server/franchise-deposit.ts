/**
 * Franchise deposit ledger — the ONLY sanctioned way to move a franchise's
 * prepaid balance (`Franchise.depositBalance`). Hard Rule #4: append-only
 * entries first, balance is synchronized from the entry (never edited ad hoc).
 *
 * Idempotency: one entry per (franchise, type, sourceType, sourceId). A replay
 * returns the existing entry instead of double-posting.
 */

import type {
  FranchiseDepositEntryType,
  FranchiseDepositLedgerEntry,
  FranchiseDepositSourceType,
} from "../procurement";
import { round2 } from "../procurement";
import { appendEvent, PROCUREMENT_EVENTS } from "./events";
import { makeServerId, memory } from "./memory";

export type DepositPostResult =
  | { ok: true; entry: FranchiseDepositLedgerEntry; replayed: boolean }
  | { ok: false; error: "franchise_not_found" | "insufficient_balance" | "invalid_amount" };

export function franchiseDepositBalance(franchise: string): number {
  return round2(memory.franchises.find((f) => f.name === franchise)?.depositBalance ?? 0);
}

export function findDepositEntry(
  franchise: string,
  type: FranchiseDepositEntryType,
  sourceType: FranchiseDepositSourceType,
  sourceId: string,
): FranchiseDepositLedgerEntry | undefined {
  return memory.franchiseDepositLedgerEntries.find(
    (entry) =>
      entry.franchise === franchise &&
      entry.type === type &&
      entry.sourceType === sourceType &&
      entry.sourceId === sourceId,
  );
}

/**
 * Post a signed amount (debit < 0, credit > 0) against the franchise deposit.
 * Rejects when the resulting balance would go negative.
 */
export function postFranchiseDeposit(input: {
  franchise: string;
  type: FranchiseDepositEntryType;
  amountBRL: number;
  sourceType: FranchiseDepositSourceType;
  sourceId: string;
  note?: string;
  createdBy: string;
  /** Settlement payouts may legally overdraw (franchise owes HQ a top-up). */
  allowNegative?: boolean;
}): DepositPostResult {
  const amount = round2(input.amountBRL);
  if (!Number.isFinite(amount) || amount === 0) return { ok: false, error: "invalid_amount" };

  const index = memory.franchises.findIndex((f) => f.name === input.franchise);
  if (index === -1) return { ok: false, error: "franchise_not_found" };

  const existing = findDepositEntry(input.franchise, input.type, input.sourceType, input.sourceId);
  if (existing) return { ok: true, entry: existing, replayed: true };

  const current = round2(memory.franchises[index].depositBalance ?? 0);
  const next = round2(current + amount);
  if (next < 0 && input.allowNegative !== true) return { ok: false, error: "insufficient_balance" };

  const entry: FranchiseDepositLedgerEntry = {
    id: makeServerId("fdl", memory.franchiseDepositLedgerEntries.length + 1),
    franchise: input.franchise,
    type: input.type,
    amountBRL: amount,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    balanceAfter: next,
    note: input.note?.slice(0, 200) || undefined,
    createdBy: input.createdBy,
    createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
  };
  // Ledger first, then synchronize the projected balance field.
  memory.franchiseDepositLedgerEntries.unshift(entry);
  memory.franchises[index] = { ...memory.franchises[index], depositBalance: next };

  appendEvent(
    amount < 0
      ? PROCUREMENT_EVENTS.depositDebited
      : input.type === "topup"
        ? PROCUREMENT_EVENTS.depositToppedUp
        : PROCUREMENT_EVENTS.depositRefunded,
    { franchise: input.franchise, entryId: entry.id, type: input.type, amountBRL: amount, balanceAfter: next, sourceType: input.sourceType, sourceId: input.sourceId },
    input.createdBy,
  );

  return { ok: true, entry, replayed: false };
}
