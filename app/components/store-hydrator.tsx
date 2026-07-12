"use client";

import { useEffect } from "react";
import { useVentoStore } from "../lib/store";

async function fetchData<T>(path: string, headers?: Record<string, string>): Promise<T[] | null> {
  try {
    const response = await fetch(path, { headers, cache: "no-store" });
    if (!response.ok) return null;
    const payload = (await response.json()) as { data?: T[] };
    return Array.isArray(payload.data) ? payload.data : null;
  } catch {
    return null;
  }
}

/**
 * On app start, replace the browser store with the server/database state so
 * every device sees the persisted data. Only runs when the server reports
 * that database persistence is enabled; otherwise the local (optimistic)
 * state is kept untouched.
 */
const HYDRATED_AT_KEY = "vento-hydrated-at";
const HYDRATE_TTL_MS = 60_000;

export function StoreHydrator() {
  useEffect(() => {
    let cancelled = false;
    let idleHandle: number | undefined;
    let timerHandle: number | undefined;

    // This bootstrap fires 8 collection fetches — each one a cold serverless
    // invocation. Two rules keep it off the critical path:
    //  1. Skip entirely if this tab hydrated within the last minute (page
    //     hops between console pages were re-running the full storm).
    //  2. Wait for browser idle so the page's OWN data fetches win the race.
    try {
      const last = Number(sessionStorage.getItem(HYDRATED_AT_KEY) ?? 0);
      if (Date.now() - last < HYDRATE_TTL_MS) return;
    } catch {
      // sessionStorage unavailable — hydrate as usual.
    }

    async function hydrate() {
      try {
        const healthResponse = await fetch("/api/health", { cache: "no-store" });
        if (!healthResponse.ok) return;
        const health = (await healthResponse.json()) as { persistence?: { enabled?: boolean } };
        if (!health.persistence?.enabled) return;

        const revealHeaders = {
          "x-vento-role": "Super Admin",
          "x-vento-reveal-sensitive": "true",
        };

        const [riders, pontos, leaders, incidents, rewardRules, ledgerEntries, notifications, auditLog] =
          await Promise.all([
            fetchData<never>("/api/riders", revealHeaders),
            fetchData<never>("/api/pontos"),
            fetchData<never>("/api/leaders"),
            fetchData<never>("/api/incidents"),
            fetchData<never>("/api/rewards"),
            fetchData<never>("/api/finance"),
            fetchData<never>("/api/notifications"),
            fetchData<never>("/api/audit", { "x-vento-role": "Super Admin" }),
          ]);

        if (cancelled) return;
        try {
          sessionStorage.setItem(HYDRATED_AT_KEY, String(Date.now()));
        } catch {
          // Ignore quota/availability failures.
        }

        useVentoStore.setState((state) => ({
          riders: riders ?? state.riders,
          pontos: pontos ?? state.pontos,
          leaders: leaders ?? state.leaders,
          incidents: incidents ?? state.incidents,
          rewardRules: rewardRules ?? state.rewardRules,
          ledgerEntries: ledgerEntries ?? state.ledgerEntries,
          notifications: notifications ?? state.notifications,
          auditLog: auditLog && auditLog.length > 0 ? auditLog : state.auditLog,
        }));
      } catch {
        // Server unreachable — keep local state.
      }
    }

    const kick = () => {
      if (!cancelled) void hydrate();
    };
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (win.requestIdleCallback) {
      idleHandle = win.requestIdleCallback(kick, { timeout: 4000 });
    } else {
      timerHandle = window.setTimeout(kick, 1500);
    }
    return () => {
      cancelled = true;
      if (idleHandle !== undefined && win.cancelIdleCallback) win.cancelIdleCallback(idleHandle);
      if (timerHandle !== undefined) window.clearTimeout(timerHandle);
    };
  }, []);

  return null;
}
