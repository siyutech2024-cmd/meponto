"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IncidentDrawer } from "../components/forms";
import { AddButton, AppShell, GuardedButton, PageTitle } from "../components/ui";
import { Chip, DataTable, Stat, StatusBadge, TodoCard, Toolbar, type BadgeTone, type DataColumn } from "../components/kit";
import { can } from "../lib/rbac";
import type { Incident } from "../lib/data";
import { useVentoStore } from "../lib/store";

const STATUS_OPTIONS = ["Open", "Processing", "Closed"] as const;

const severityTone = (severity: Incident["severity"]): BadgeTone =>
  severity === "Critical" || severity === "High" ? "danger" : severity === "Medium" ? "warn" : "neutral";
const statusTone = (status: Incident["status"]): BadgeTone =>
  status === "Open" ? "danger" : status === "Processing" ? "warn" : "success";

export default function IncidentsPage() {
  const incidents = useVentoStore((state) => state.incidents);
  const currentRole = useVentoStore((state) => state.currentRole);
  const updateIncidentStatus = useVentoStore((state) => state.updateIncidentStatus);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const visibleIncidents = useMemo(
    () => incidents.filter((incident) => !statusFilter || incident.status === statusFilter),
    [incidents, statusFilter],
  );

  const openCount = incidents.filter((incident) => incident.status === "Open").length;
  const processingCount = incidents.filter((incident) => incident.status === "Processing").length;
  const closedCount = incidents.filter((incident) => incident.status === "Closed").length;

  const columns: Array<DataColumn<Incident>> = [
    { key: "id", label: "Incident ID", render: (incident) => <span className="font-black">{incident.id}</span> },
    { key: "rider", label: "Rider", render: (incident) => incident.rider },
    { key: "ponto", label: "Ponto", render: (incident) => incident.ponto },
    { key: "severity", label: "Severity", render: (incident) => <StatusBadge tone={severityTone(incident.severity)} label={incident.severity} /> },
    { key: "status", label: "Status", render: (incident) => <StatusBadge tone={statusTone(incident.status)} label={incident.status} /> },
    { key: "createdAt", label: "Created At", render: (incident) => <span className="text-xs font-bold text-[var(--muted)]">{incident.createdAt}</span> },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (incident) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Link className="tag" href={`/incidents/${incident.id}`}>View</Link>
          <GuardedButton permission="close_incidents" onClick={() => updateIncidentStatus(incident.id, "Processing")}>Update</GuardedButton>
          <GuardedButton permission="close_incidents" onClick={() => updateIncidentStatus(incident.id, "Closed")}>Close</GuardedButton>
        </div>
      ),
    },
  ];

  return (
    <AppShell>
      <PageTitle
        title="Incident Response"
        eyebrow="Safety operations"
        action={<AddButton label="Create Incident" disabled={!can(currentRole, "create_incidents")} onClick={() => setDrawerOpen(true)} />}
      />

      {/* Stats — click a status card to filter the table. */}
      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Total Incidents" value={String(incidents.length)} />
        <TodoCard label="Open" value={openCount} tone={openCount > 0 ? "danger" : "neutral"} active={statusFilter === "Open"} onClick={() => setStatusFilter(statusFilter === "Open" ? "" : "Open")} />
        <TodoCard label="Processing" value={processingCount} tone={processingCount > 0 ? "warn" : "neutral"} active={statusFilter === "Processing"} onClick={() => setStatusFilter(statusFilter === "Processing" ? "" : "Processing")} />
        <TodoCard label="Closed" value={closedCount} tone="neutral" active={statusFilter === "Closed"} onClick={() => setStatusFilter(statusFilter === "Closed" ? "" : "Closed")} />
      </section>

      {/* Toolbar */}
      <div className="mt-4">
        <Toolbar right={<span className="text-xs font-bold text-[var(--muted)]">{visibleIncidents.length} incident records</span>}>
          <Chip active={statusFilter === ""} onClick={() => setStatusFilter("")}>All Status</Chip>
          {STATUS_OPTIONS.map((status) => (
            <Chip key={status} active={statusFilter === status} onClick={() => setStatusFilter(statusFilter === status ? "" : status)}>{status}</Chip>
          ))}
        </Toolbar>
      </div>

      {/* Incident table */}
      <div className="mt-4">
        <DataTable<Incident>
          columns={columns}
          rows={visibleIncidents}
          rowKey={(incident) => incident.id}
          minWidth={860}
          empty="No incident records."
        />
      </div>

      <IncidentDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </AppShell>
  );
}
