"use client";

import { useMemo, useState } from "react";
import { AppShell, Badge, DataTable, PageTitle } from "../components/ui";
import { useVentoStore } from "../lib/store";

export default function AuditPage() {
  const auditLog = useVentoStore((state) => state.auditLog);
  const [riskFilter, setRiskFilter] = useState("All Risk");
  const [query, setQuery] = useState("");

  const visibleLog = useMemo(() => {
    const term = query.trim().toLowerCase();
    return auditLog.filter((entry) => {
      const matchesRisk = riskFilter === "All Risk" || entry.risk === riskFilter;
      const matchesTerm =
        !term ||
        [entry.actor, entry.action, entry.entity, entry.entityId, entry.detail].some((value) =>
          value.toLowerCase().includes(term),
        );
      return matchesRisk && matchesTerm;
    });
  }, [auditLog, query, riskFilter]);

  return (
    <AppShell>
      <PageTitle title="Audit Log" eyebrow="Security and operations trace" />
      <div className="panel mb-4 grid gap-3 p-3 md:grid-cols-[1fr_180px]">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none"
          placeholder="Search actor / action / entity / detail"
        />
        <select
          value={riskFilter}
          onChange={(event) => setRiskFilter(event.target.value)}
          className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none"
        >
          <option>All Risk</option>
          <option>Low</option>
          <option>Medium</option>
          <option>High</option>
        </select>
      </div>
      <DataTable
        headers={["Created At", "Actor", "Action", "Entity", "Entity ID", "Risk", "Detail"]}
        rows={visibleLog.map((entry) => [
          entry.createdAt,
          entry.actor,
          entry.action,
          entry.entity,
          entry.entityId,
          <Badge key="risk" value={entry.risk} />,
          entry.detail,
        ])}
      />
    </AppShell>
  );
}
