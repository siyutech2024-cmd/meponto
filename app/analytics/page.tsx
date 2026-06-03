"use client";

import { AppShell, Badge, DataTable, Field, PageTitle } from "../components/ui";
import { getNetworkMetrics, getPontoRiskRows, getRiderRiskRows } from "../lib/analytics";
import { useVentoStore } from "../lib/store";

function RiskBar({ score }: { score: number }) {
  return (
    <div className="h-3 w-40 overflow-hidden rounded border border-[var(--line)] bg-[var(--surface)]">
      <div
        className="h-full bg-[var(--accent)]"
        style={{
          width: `${score}%`,
          background: score >= 75 ? "var(--danger)" : score >= 50 ? "var(--warning)" : score >= 25 ? "var(--accent)" : "var(--ok)",
        }}
      />
    </div>
  );
}

export default function AnalyticsPage() {
  const riders = useVentoStore((state) => state.riders);
  const incidents = useVentoStore((state) => state.incidents);
  const metrics = getNetworkMetrics(riders, incidents);
  const riderRiskRows = getRiderRiskRows(riders, incidents);
  const pontoRiskRows = getPontoRiskRows(riders, incidents);

  return (
    <AppShell>
      <PageTitle title="Network Analytics" eyebrow="Risk engine" />
      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Field label="Network Risk" value={`${metrics.networkRiskScore}/100`} />
        <Field label="High Risk Riders" value={metrics.highRiskRiders} />
        <Field label="Open Incidents" value={metrics.openIncidents} />
        <Field label="Critical Incidents" value={metrics.criticalIncidents} />
        <Field label="Night Shift Riders" value={metrics.nightShiftRiders} />
        <Field label="Average AR" value={`${metrics.avgAr}%`} />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-black">Rider Risk Ranking</h2>
          <DataTable
            headers={["Rider", "Ponto", "AR", "Open Incidents", "Risk", "Score"]}
            rows={riderRiskRows.map((row) => [
              row.rider.name,
              row.rider.ponto,
              `${row.rider.ar}%`,
              row.openIncidents,
              <Badge key="level" value={row.level} />,
              <div key="score" className="flex items-center gap-3">
                <RiskBar score={row.score} />
                <span className="font-black">{row.score}</span>
              </div>,
            ])}
          />
        </div>

        <div>
          <h2 className="mb-3 text-lg font-black">Ponto Risk Ranking</h2>
          <DataTable
            headers={["Ponto", "Active", "Night", "Open Incidents", "Risk", "Score"]}
            rows={pontoRiskRows.map((row) => [
              row.ponto.name,
              row.activeRiders,
              row.nightShiftRiders,
              row.openIncidents,
              <Badge key="level" value={row.level} />,
              <div key="score" className="flex items-center gap-3">
                <RiskBar score={row.score} />
                <span className="font-black">{row.score}</span>
              </div>,
            ])}
          />
        </div>
      </section>
    </AppShell>
  );
}
