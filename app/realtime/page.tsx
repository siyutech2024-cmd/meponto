"use client";

import { useMemo, useState } from "react";
import { AppShell, Badge, DataTable, Field, PageTitle } from "../components/ui";
import { getRealtimeSummary, realtimeEvents } from "../lib/realtime";

export default function RealtimePage() {
  const [typeFilter, setTypeFilter] = useState("All Events");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const summary = getRealtimeSummary(realtimeEvents);
  const visibleEvents = useMemo(
    () =>
      realtimeEvents.filter((event) => {
        const matchesType = typeFilter === "All Events" || event.type === typeFilter;
        const matchesStatus = statusFilter === "All Status" || event.status === statusFilter;
        return matchesType && matchesStatus;
      }),
    [typeFilter, statusFilter],
  );

  return (
    <AppShell>
      <PageTitle title="Realtime Operations" eyebrow="Event stream and routing" />
      <section className="grid gap-3 md:grid-cols-5">
        <Field label="Total Events" value={summary.total} />
        <Field label="Critical" value={summary.critical} />
        <Field label="High" value={summary.high} />
        <Field label="Unresolved" value={summary.unresolved} />
        <Field label="Routed" value={summary.routed} />
      </section>

      <section className="panel my-4 grid gap-3 p-3 md:grid-cols-[220px_180px_1fr]">
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-11 rounded border border-[#2a2a4a] bg-[#0d0d1a] px-3 outline-none">
          <option>All Events</option>
          <option>Incident Alert</option>
          <option>Rider Status</option>
          <option>Night Shift Alert</option>
          <option>In-App Chat Message</option>
          <option>Finance Approval</option>
          <option>Security Event</option>
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 rounded border border-[#2a2a4a] bg-[#0d0d1a] px-3 outline-none">
          <option>All Status</option>
          <option>New</option>
          <option>Acknowledged</option>
          <option>Routed</option>
          <option>Resolved</option>
        </select>
        <div className="flex items-center text-sm font-bold text-[#8b8ba3]">
          MVP polling mode now, WebSocket / Socket.IO ready for backend phase.
        </div>
      </section>

      <DataTable
        headers={["Created At", "Type", "Severity", "Title", "Target", "Status", "Detail"]}
        rows={visibleEvents.map((event) => [
          event.createdAt,
          event.type,
          <Badge key="severity" value={event.severity} />,
          event.title,
          event.target,
          <Badge key="status" value={event.status} />,
          event.detail,
        ])}
      />
    </AppShell>
  );
}
