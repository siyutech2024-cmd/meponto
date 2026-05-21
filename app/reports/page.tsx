"use client";

import { CalendarClock, Database, FileBarChart2 } from "lucide-react";
import { AppShell, Badge, DataTable, Field, PageTitle } from "../components/ui";
import { getWarehouseSummary, reportCatalog } from "../lib/reports";

export default function ReportsPage() {
  const warehouseSummary = getWarehouseSummary();

  return (
    <AppShell>
      <PageTitle title="Reporting Warehouse" eyebrow="Data warehouse" />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Field label="Readiness Score" value={`${warehouseSummary.readinessScore}%`} />
        <Field label="Fact Tables Ready" value={warehouseSummary.factsReady} />
        <Field label="Dimensions Ready" value={warehouseSummary.dimensionsReady} />
        <Field label="Open Mapping Risks" value={warehouseSummary.openMappingRisks} />
        <Field label="Targets" value={warehouseSummary.warehouseCandidates.join(" / ")} />
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <FileBarChart2 className="text-[#8b5cf6]" size={20} />
            <h2 className="text-lg font-black">Operational Report Catalog</h2>
          </div>
          <DataTable
            headers={["Report", "Domain", "Audience", "Frequency", "Status", "Owner", "Sources", "Target", "Refresh"]}
            rows={reportCatalog.map((report) => [
              report.name,
              report.domain,
              report.audience,
              report.frequency,
              <Badge key="status" value={report.status} />,
              report.owner,
              report.sourceTables.join(", "),
              report.migrationTarget,
              report.lastRefreshedAt,
            ])}
          />
        </div>

        <aside className="panel p-4">
          <div className="mb-3 flex items-center gap-2">
            <Database className="text-[#8b5cf6]" size={20} />
            <h2 className="text-lg font-black">Warehouse Readiness</h2>
          </div>
          <div className="space-y-3">
            {warehouseSummary.readiness.map((item) => (
              <div key={item.id} className="rounded border border-[#2a2a4a] bg-[#0d0d1a] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black">{item.area}</div>
                    <div className="mt-1 text-xs text-[#8b8ba3]">{item.owner}</div>
                  </div>
                  <Badge value={item.status} />
                </div>
                <div className="mt-3 grid gap-2 text-xs text-[#a5a5bd]">
                  <div>
                    <span className="font-black text-[#c4c4d4]">BigQuery:</span> {item.bigQuery}
                  </div>
                  <div>
                    <span className="font-black text-[#c4c4d4]">Redshift:</span> {item.redshift}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="panel p-4">
          <div className="mb-3 text-xs font-black uppercase text-[#8b5cf6]">KPI snapshots</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {warehouseSummary.kpis.map((kpi) => (
              <div key={kpi.id} className="rounded border border-[#2a2a4a] bg-[#0d0d1a] p-3">
                <div className="text-xs uppercase text-[#8b8ba3]">{kpi.label}</div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div className="text-3xl font-black">{kpi.value}</div>
                  <div className="rounded bg-[#8b5cf6]/15 px-2 py-1 text-xs font-black text-[#8b5cf6]">{kpi.delta}</div>
                </div>
                <div className="mt-2 text-xs text-[#8b8ba3]">{kpi.source}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2">
            <CalendarClock className="text-[#8b5cf6]" size={20} />
            <h2 className="text-lg font-black">Scheduled Exports</h2>
          </div>
          <DataTable
            headers={["Export", "Format", "Cadence", "Destination", "Next Run", "Status"]}
            rows={warehouseSummary.scheduledExports.map((exportJob) => [
              exportJob.name,
              <Badge key="format" value={exportJob.format} />,
              exportJob.cadence,
              exportJob.destination,
              exportJob.nextRunAt,
              <Badge key="status" value={exportJob.status} />,
            ])}
          />
        </div>
      </section>

      <section className="mt-5 rounded border border-[#2a2a4a] bg-[#0d0d1a] p-4">
        <div className="text-xs font-black uppercase text-[#8b5cf6]">Next migration milestone</div>
        <div className="mt-2 text-lg font-black">{warehouseSummary.nextMilestone}</div>
      </section>
    </AppShell>
  );
}
