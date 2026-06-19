/**
 * Marketplace domain event outbox (in-memory, HQ-visible).
 *
 * Implements the versioned-event requirement from the Points Economy Standard
 * (§9) and AGENTS.md Hard Rule #6: state-changing marketplace actions append a
 * versioned event (e.g. `marketplace.order.created.v1`) to an append-only
 * outbox. This is intentionally independent of the DB-backed `memory`
 * collections — it is an in-process outbox a future worker/relay can drain to
 * the real event bus without changing call sites.
 */

import { makeServerId } from "./memory";

export type DomainEvent = {
  id: string;
  /** Versioned event name, e.g. "marketplace.order.created.v1". */
  type: string;
  occurredAt: string;
  actor?: string;
  payload: Record<string, unknown>;
};

const globalState = globalThis as typeof globalThis & { mepontoEventOutbox?: DomainEvent[] };
const outbox: DomainEvent[] = (globalState.mepontoEventOutbox ??= []);

/** Versioned marketplace event names — single source of truth. */
export const MARKETPLACE_EVENTS = {
  orderCreated: "marketplace.order.created.v1",
  orderArrived: "marketplace.order.arrived.v1",
  orderFulfilled: "marketplace.order.fulfilled.v1",
  orderCancelled: "marketplace.order.cancelled.v1",
  orderRejected: "marketplace.order.rejected.v1",
} as const;

/** Append a versioned domain event to the outbox (append-only, newest first). */
export function appendEvent(type: string, payload: Record<string, unknown>, actor?: string): DomainEvent {
  const event: DomainEvent = {
    id: makeServerId("evt", outbox.length + 1),
    type,
    occurredAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    actor,
    payload,
  };
  outbox.unshift(event);
  // Bound the in-memory outbox so a long-lived process cannot grow unbounded.
  if (outbox.length > 500) outbox.length = 500;
  return event;
}

/** Most recent events for HQ inspection / verification. */
export function recentEvents(limit = 50): DomainEvent[] {
  return outbox.slice(0, Math.max(0, limit));
}
