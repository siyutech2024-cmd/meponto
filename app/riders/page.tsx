"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AddRiderDrawer, IncidentDrawer } from "../components/forms";
import { AddButton, AppShell, Badge, DataTable, GuardedButton, PageTitle } from "../components/ui";
import { pontos } from "../lib/data";
import { can } from "../lib/rbac";
import { useVentoStore } from "../lib/store";

export default function RidersPage() {
  const liveRiders = useVentoStore((state) => state.riders);
  const currentRole = useVentoStore((state) => state.currentRole);
  const updateRiderStatus = useVentoStore((state) => state.updateRiderStatus);
  const [query, setQuery] = useState("");
  const [pontoFilter, setPontoFilter] = useState("All Pontos");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [addOpen, setAddOpen] = useState(false);
  const [incidentFor, setIncidentFor] = useState<{ name: string; ponto: string } | null>(null);

  const filteredRiders = useMemo(() => {
    const term = query.trim().toLowerCase();
    return liveRiders.filter((rider) => {
      const searchableValues = [rider.name, rider.cpf, rider.phone].map((value) => String(value ?? "").toLowerCase());
      const matchesTerm = !term || searchableValues.some((value) => value.includes(term));
      const matchesPonto = pontoFilter === "All Pontos" || rider.ponto === pontoFilter;
      const matchesStatus = statusFilter === "All Status" || rider.status === statusFilter;
      return matchesTerm && matchesPonto && matchesStatus;
    });
  }, [liveRiders, pontoFilter, query, statusFilter]);

  return (
    <AppShell>
      <PageTitle
        title="Rider Management"
        eyebrow="Social network control"
        action={<AddButton label="Add Rider" disabled={!can(currentRole, "manage_riders")} onClick={() => setAddOpen(true)} />}
      />
      <div className="panel mb-4 grid gap-3 p-3 md:grid-cols-[1fr_180px_180px]">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-11 rounded border border-[#2a2a4a] bg-[#0d0d1a] px-3 outline-none"
          placeholder="Search by Name / CPF / Phone"
        />
        <select value={pontoFilter} onChange={(event) => setPontoFilter(event.target.value)} className="h-11 rounded border border-[#2a2a4a] bg-[#0d0d1a] px-3 outline-none">
          <option>All Pontos</option>
          {pontos.map((ponto) => (
            <option key={ponto.id}>{ponto.name}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 rounded border border-[#2a2a4a] bg-[#0d0d1a] px-3 outline-none">
          <option>All Status</option>
          <option>Active</option>
          <option>Inactive</option>
          <option>Risk</option>
          <option>Night Shift</option>
        </select>
      </div>
      <DataTable
        headers={["Rider ID", "Name", "CPF", "Phone", "Ponto", "Leader", "AR", "Status", "Actions"]}
        rows={filteredRiders.map((rider) => [
          rider.id,
          rider.name ?? "Unknown Rider",
          rider.cpf ?? "",
          rider.phone ?? "",
          <span className="tag" key="ponto">{rider.ponto ?? "Unassigned"}</span>,
          <span className="tag" key="leader">{rider.leader ?? "Unassigned"}</span>,
          `${rider.ar ?? 0}%`,
          <Badge key="status" value={rider.status} />,
          <div key="actions" className="flex flex-wrap gap-2">
            <Link className="tag" href={`/riders/${rider.id}`}>View</Link>
            <GuardedButton permission="manage_riders">Edit</GuardedButton>
            <GuardedButton permission="create_incidents" onClick={() => setIncidentFor({ name: rider.name ?? "Unknown Rider", ponto: rider.ponto ?? "Unassigned" })}>Incident</GuardedButton>
            <GuardedButton permission="manage_riders" onClick={() => updateRiderStatus(rider.id, rider.status === "Inactive" ? "Active" : "Inactive")}>
              {rider.status === "Inactive" ? "Activate" : "Deactivate"}
            </GuardedButton>
          </div>,
        ])}
      />
      <AddRiderDrawer open={addOpen} onClose={() => setAddOpen(false)} />
      <IncidentDrawer
        open={Boolean(incidentFor)}
        riderName={incidentFor?.name}
        pontoName={incidentFor?.ponto}
        onClose={() => setIncidentFor(null)}
      />
    </AppShell>
  );
}
