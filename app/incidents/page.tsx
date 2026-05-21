"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IncidentDrawer } from "../components/forms";
import { AddButton, AppShell, Badge, DataTable, GuardedButton, PageTitle } from "../components/ui";
import { can } from "../lib/rbac";
import { useVentoStore } from "../lib/store";

export default function IncidentsPage() {
  const incidents = useVentoStore((state) => state.incidents);
  const currentRole = useVentoStore((state) => state.currentRole);
  const updateIncidentStatus = useVentoStore((state) => state.updateIncidentStatus);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All Status");
  const visibleIncidents = useMemo(
    () => incidents.filter((incident) => statusFilter === "All Status" || incident.status === statusFilter),
    [incidents, statusFilter],
  );

  return (
    <AppShell>
      <PageTitle
        title="Incident Response"
        eyebrow="Safety operations"
        action={<AddButton label="Create Incident" disabled={!can(currentRole, "create_incidents")} onClick={() => setDrawerOpen(true)} />}
      />
      <div className="panel mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="text-sm font-bold text-[#8b8ba3]">{visibleIncidents.length} incident records</div>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 rounded border border-[#2a2a4a] bg-[#0d0d1a] px-3 outline-none">
          <option>All Status</option>
          <option>Open</option>
          <option>Processing</option>
          <option>Closed</option>
        </select>
      </div>
      <DataTable
        headers={["Incident ID", "Rider", "Ponto", "Severity", "Status", "Created At", "Actions"]}
        rows={visibleIncidents.map((incident) => [
          incident.id,
          incident.rider,
          incident.ponto,
          <Badge key="severity" value={incident.severity} />,
          <Badge key="status" value={incident.status} />,
          incident.createdAt,
          <div key="actions" className="flex flex-wrap gap-2">
            <Link className="tag" href={`/incidents/${incident.id}`}>View</Link>
            <GuardedButton permission="close_incidents" onClick={() => updateIncidentStatus(incident.id, "Processing")}>Update</GuardedButton>
            <GuardedButton permission="close_incidents" onClick={() => updateIncidentStatus(incident.id, "Closed")}>Close</GuardedButton>
          </div>,
        ])}
      />
      <IncidentDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </AppShell>
  );
}
