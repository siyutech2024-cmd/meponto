"use client";

import { AlertRow, AppShell, Button, DataTable, Field, MiniMap, PageTitle, Badge } from "../components/ui";
import { getPontoRiskRows } from "../lib/analytics";
import { useVentoStore } from "../lib/store";

export default function NightShiftPage() {
  const riders = useVentoStore((state) => state.riders);
  const incidents = useVentoStore((state) => state.incidents);
  const nightRiders = riders.filter((rider) => rider.status === "Night Shift");
  const pontoRisks = getPontoRiskRows(riders, incidents);
  const riskAreas = pontoRisks.filter((row) => row.score >= 50);
  const openAlerts = incidents.filter((incident) => incident.status !== "Closed" && (incident.severity === "High" || incident.severity === "Critical"));

  return (
    <AppShell>
      <PageTitle title="Night Shift Safety" eyebrow="Risk watch" action={<Button>Emergency Support</Button>} />
      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <MiniMap />
        <div className="space-y-4">
          <div className="panel p-4">
            <h2 className="mb-3 text-lg font-black">Current Online</h2>
            <div className="grid gap-3">
              <Field label="Night Shift Riders" value={nightRiders.length} />
              <Field label="Risk Areas" value={riskAreas.length} />
              <Field label="Open Alerts" value={openAlerts.length} />
            </div>
          </div>
          <div className="panel p-4">
            <h2 className="mb-3 text-lg font-black">Safety Alerts</h2>
            <div className="space-y-3">
              {riskAreas.slice(0, 3).map((row) => (
                <AlertRow
                  key={row.ponto.id}
                  title={`${row.ponto.bairro} ${row.level}`}
                  detail={`${row.openIncidents} open incidents, ${row.nightShiftRiders} night riders, safety score ${row.ponto.safetyScore}.`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="mt-5">
        <h2 className="mb-3 text-lg font-black">Night Shift Ponto Risk</h2>
        <DataTable
          headers={["Ponto", "Night Riders", "Open Incidents", "Risk Level", "Score"]}
          rows={pontoRisks.map((row) => [
            row.ponto.name,
            row.nightShiftRiders,
            row.openIncidents,
            <Badge key="risk" value={row.level} />,
            `${row.score}/100`,
          ])}
        />
      </section>
    </AppShell>
  );
}
