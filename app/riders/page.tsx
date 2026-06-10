"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bike, Filter, Search, ShieldAlert } from "lucide-react";
import { AddRiderDrawer, IncidentDrawer } from "../components/forms";
import { AddButton, AppShell, Badge, DataTable, Field, GuardedButton, PageTitle } from "../components/ui";
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
  const [pointsBalances, setPointsBalances] = useState<Record<string, number>>({});

  // Points balances live on the server ledger — fetch alongside the list.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/riders", { headers: { "x-vento-role": "Super Admin" }, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload?.data) return;
        const next: Record<string, number> = {};
        for (const rider of payload.data as Array<{ id: string; pointsBalance?: number }>) {
          next[rider.id] = rider.pointsBalance ?? 0;
        }
        setPointsBalances(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [liveRiders.length]);

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
  const selectedRider = filteredRiders[0] ?? liveRiders[0];
  const activeCount = liveRiders.filter((rider) => rider.status === "Active").length;
  const nightCount = liveRiders.filter((rider) => rider.status === "Night Shift").length;
  const riskCount = liveRiders.filter((rider) => rider.status === "Risk").length;

  return (
    <AppShell>
      <PageTitle
        title="Rider Management"
        eyebrow="Social network control"
        action={<AddButton label="Add Rider" disabled={!can(currentRole, "manage_riders")} onClick={() => setAddOpen(true)} />}
      />
      <section className="grid gap-3 md:grid-cols-4">
        <Field label="Total Riders" value={<span className="text-2xl">{liveRiders.length}</span>} />
        <Field label="Active" value={<span className="text-2xl text-[var(--ok-ink)]">{activeCount}</span>} />
        <Field label="Night Shift" value={<span className="text-2xl text-[var(--warning-ink)]">{nightCount}</span>} />
        <Field label="Risk" value={<span className="text-2xl text-[var(--danger-ink)]">{riskCount}</span>} />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="panel grid gap-3 p-3 md:grid-cols-[1fr_190px_180px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-10 text-[var(--text)] outline-none"
                placeholder="Search by Name / CPF / Phone"
              />
            </label>
            <label className="relative">
              <Filter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={16} />
              <select value={pontoFilter} onChange={(event) => setPontoFilter(event.target.value)} className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-9 text-[var(--text)] outline-none">
                <option>All Pontos</option>
                {pontos.map((ponto) => (
                  <option key={ponto.id}>{ponto.name}</option>
                ))}
              </select>
            </label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[var(--text)] outline-none">
              <option>All Status</option>
              <option>Active</option>
              <option>Inactive</option>
              <option>Risk</option>
              <option>Night Shift</option>
            </select>
          </div>

          <DataTable
            headers={["Rider ID", "Name", "CPF", "PIX", "Phone", "99 ID", "Franchise", "Ponto", "Leader", "Join Date", "Points", "AR", "Status", "Actions"]}
            rows={filteredRiders.map((rider) => [
              rider.id,
              rider.name ?? "Unknown Rider",
              rider.cpf ?? "",
              rider.pix ?? "",
              rider.phone ?? "",
              rider.ninetyNineId ?? "--",
              <span className="tag" key="franchise">{rider.franchise ?? "Unassigned"}</span>,
              <span className="tag" key="ponto">{rider.ponto ?? "Unassigned"}</span>,
              <span className="tag" key="leader">{rider.leader ?? "Unassigned"}</span>,
              rider.joinDate ?? "--",
              <span key="points" className="font-black text-[var(--accent)]">{pointsBalances[rider.id] ?? 0}</span>,
              `${rider.ar ?? 0}%`,
              <Badge key="status" value={rider.status} />,
              <div key="actions" className="flex flex-wrap gap-2">
                <Link className="tag" href={`/riders/${rider.id}`}>View</Link>
                <GuardedButton permission="create_incidents" onClick={() => setIncidentFor({ name: rider.name ?? "Unknown Rider", ponto: rider.ponto ?? "Unassigned" })}>Incident</GuardedButton>
                <GuardedButton permission="manage_riders" onClick={() => updateRiderStatus(rider.id, rider.status === "Inactive" ? "Active" : "Inactive")}>
                  {rider.status === "Inactive" ? "Activate" : "Deactivate"}
                </GuardedButton>
              </div>,
            ])}
          />
        </div>

        <aside className="panel h-fit p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]">
                <Bike size={16} />
                Rider workspace
              </div>
              <h2 className="mt-1 text-xl font-black">{selectedRider?.name ?? "No rider selected"}</h2>
            </div>
            {selectedRider ? <Badge value={selectedRider.status} /> : null}
          </div>
          {selectedRider ? (
            <>
              <div className="mt-4 grid gap-3">
                <Field label="Franchise" value={selectedRider.franchise ?? "Unassigned"} />
                <Field label="Ponto" value={selectedRider.ponto ?? "Unassigned"} />
                <Field label="Leader" value={selectedRider.leader ?? "Unassigned"} />
                <Field label="CPF" value={selectedRider.cpf ?? "-"} />
                <Field label="PIX" value={selectedRider.pix ?? "-"} />
                <Field label="Phone" value={selectedRider.phone ?? "-"} />
                <Field label="99 ID" value={selectedRider.ninetyNineId ?? "-"} />
                <Field label="Join Date" value={selectedRider.joinDate ?? "-"} />
                <Field label="Points" value={<span className="font-black text-[var(--accent)]">{pointsBalances[selectedRider.id] ?? 0}</span>} />
                <Field label="Acceptance Rate" value={`${selectedRider.ar ?? 0}%`} />
              </div>
              <div className="mt-4 grid gap-2">
                <Link className="tag flex items-center justify-between" href={`/riders/${selectedRider.id}`}>Open rider profile <span>View</span></Link>
                <GuardedButton permission="create_incidents" onClick={() => setIncidentFor({ name: selectedRider.name ?? "Unknown Rider", ponto: selectedRider.ponto ?? "Unassigned" })}>
                  <ShieldAlert size={15} /> Open incident
                </GuardedButton>
                <GuardedButton permission="manage_riders" onClick={() => updateRiderStatus(selectedRider.id, selectedRider.status === "Inactive" ? "Active" : "Inactive")}>
                  {selectedRider.status === "Inactive" ? "Activate rider" : "Deactivate rider"}
                </GuardedButton>
              </div>
            </>
          ) : null}
        </aside>
      </section>
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
