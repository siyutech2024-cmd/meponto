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
export function StoreHydrator() {
  useEffect(() => {
    let cancelled = false;

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

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
