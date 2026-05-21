"use client";

import Link from "next/link";
import { useState } from "react";
import { AddPontoDrawer } from "../components/forms";
import { AddButton, AppShell, Badge, DataTable, GuardedButton, PageTitle } from "../components/ui";
import { can } from "../lib/rbac";
import { useVentoStore } from "../lib/store";

export default function PontosPage() {
  const pontos = useVentoStore((state) => state.pontos);
  const currentRole = useVentoStore((state) => state.currentRole);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <AppShell>
      <PageTitle
        title="Ponto Network"
        eyebrow="Garage field control"
        action={<AddButton label="Add Ponto" disabled={!can(currentRole, "manage_pontos")} onClick={() => setAddOpen(true)} />}
      />
      <DataTable
        headers={["Ponto Name", "Bairro", "Riders Count", "Night Shift Level", "Leader", "Safety Score", "Actions"]}
        rows={pontos.map((ponto) => [
          ponto.name,
          ponto.bairro,
          ponto.ridersCount,
          <Badge key="night" value={ponto.nightShiftLevel} />,
          ponto.leader,
          `${ponto.safetyScore}/100`,
          <div key="actions" className="flex flex-wrap gap-2">
            <Link className="tag" href={`/pontos/${ponto.id}`}>View</Link>
            <GuardedButton permission="manage_pontos">Edit</GuardedButton>
            <GuardedButton permission="view_analytics">Heatmap</GuardedButton>
          </div>,
        ])}
      />
      <AddPontoDrawer open={addOpen} onClose={() => setAddOpen(false)} />
    </AppShell>
  );
}
