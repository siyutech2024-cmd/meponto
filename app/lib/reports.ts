export type ReportFrequency = "Realtime" | "Hourly" | "Daily" | "Weekly" | "Monthly";
export type ReportAudience = "Ops" | "Finance" | "Leadership" | "Risk" | "Growth";
export type ReportStatus = "Active" | "Draft" | "Needs Mapping";
export type ExportFormat = "CSV" | "Parquet" | "XLSX" | "PDF";
export type WarehouseStatus = "Ready" | "In Progress" | "Blocked";

export type ReportCatalogItem = {
  id: string;
  name: string;
  domain: string;
  audience: ReportAudience;
  frequency: ReportFrequency;
  status: ReportStatus;
  owner: string;
  sourceTables: string[];
  lastRefreshedAt: string;
  migrationTarget: "BigQuery" | "Redshift" | "Dual";
};

export type KpiSnapshot = {
  id: string;
  label: string;
  value: string;
  delta: string;
  source: string;
};

export type ScheduledExport = {
  id: string;
  name: string;
  format: ExportFormat;
  cadence: ReportFrequency;
  destination: string;
  nextRunAt: string;
  status: "Queued" | "Active" | "Paused";
};

export type WarehouseReadinessItem = {
  id: string;
  area: string;
  status: WarehouseStatus;
  bigQuery: string;
  redshift: string;
  owner: string;
};

export type WarehouseSummary = {
  readinessScore: number;
  warehouseCandidates: string[];
  factsReady: number;
  dimensionsReady: number;
  openMappingRisks: number;
  nextMilestone: string;
  readiness: WarehouseReadinessItem[];
  kpis: KpiSnapshot[];
  scheduledExports: ScheduledExport[];
};

export const reportCatalog: ReportCatalogItem[] = [
  {
    id: "report-ops-control",
    name: "Ops Control Tower",
    domain: "Operations",
    audience: "Ops",
    frequency: "Realtime",
    status: "Active",
    owner: "Ops Desk",
    sourceTables: ["riders", "pontos", "incidents"],
    lastRefreshedAt: "2026-05-15 08:30 BRT",
    migrationTarget: "Dual",
  },
  {
    id: "report-risk-ledger",
    name: "Rider Risk Ledger",
    domain: "Risk",
    audience: "Risk",
    frequency: "Hourly",
    status: "Active",
    owner: "Safety Ops",
    sourceTables: ["riders", "incidents", "audit_log"],
    lastRefreshedAt: "2026-05-15 08:00 BRT",
    migrationTarget: "BigQuery",
  },
  {
    id: "report-finance-close",
    name: "Finance Close Pack",
    domain: "Finance",
    audience: "Finance",
    frequency: "Daily",
    status: "Active",
    owner: "Finance Ops",
    sourceTables: ["ledger_entries", "rewards", "riders"],
    lastRefreshedAt: "2026-05-15 07:45 BRT",
    migrationTarget: "Redshift",
  },
  {
    id: "report-leader-scorecard",
    name: "Leader Scorecard",
    domain: "Network",
    audience: "Leadership",
    frequency: "Weekly",
    status: "Draft",
    owner: "Network Growth",
    sourceTables: ["leaders", "pontos", "riders"],
    lastRefreshedAt: "2026-05-14 18:00 BRT",
    migrationTarget: "BigQuery",
  },
  {
    id: "report-crm-pipeline",
    name: "Partner CRM Pipeline",
    domain: "Growth",
    audience: "Growth",
    frequency: "Weekly",
    status: "Needs Mapping",
    owner: "Growth Desk",
    sourceTables: ["crm_accounts", "chat_threads"],
    lastRefreshedAt: "2026-05-13 17:20 BRT",
    migrationTarget: "Dual",
  },
];

export const kpiSnapshots: KpiSnapshot[] = [
  { id: "kpi-refresh", label: "Freshness SLA", value: "96%", delta: "+4 pts", source: "warehouse_jobs" },
  { id: "kpi-facts", label: "Fact Tables Ready", value: "7/9", delta: "+2 this week", source: "dbt_manifest" },
  { id: "kpi-exports", label: "Scheduled Exports", value: "8", delta: "1 paused", source: "export_jobs" },
  { id: "kpi-cost", label: "Projected Monthly Cost", value: "R$ 4.8k", delta: "-11%", source: "warehouse_estimates" },
];

export const scheduledExports: ScheduledExport[] = [
  {
    id: "export-ops-shift",
    name: "Ops Shift Handoff",
    format: "PDF",
    cadence: "Daily",
    destination: "ops-leads@vento.local",
    nextRunAt: "2026-05-15 18:00 BRT",
    status: "Active",
  },
  {
    id: "export-risk-hourly",
    name: "Risk Hotlist",
    format: "CSV",
    cadence: "Hourly",
    destination: "s3://vento-reporting/risk",
    nextRunAt: "2026-05-15 09:00 BRT",
    status: "Queued",
  },
  {
    id: "export-finance-close",
    name: "Finance Close Extract",
    format: "XLSX",
    cadence: "Daily",
    destination: "finance-close@vento.local",
    nextRunAt: "2026-05-16 06:30 BRT",
    status: "Active",
  },
  {
    id: "export-warehouse-parquet",
    name: "Warehouse Landing Parquet",
    format: "Parquet",
    cadence: "Daily",
    destination: "gs://vento-warehouse-landing",
    nextRunAt: "2026-05-16 01:15 BRT",
    status: "Paused",
  },
];

export const warehouseReadiness: WarehouseReadinessItem[] = [
  {
    id: "ready-riders",
    area: "Rider dimension",
    status: "Ready",
    bigQuery: "Partitioned by activation month",
    redshift: "DISTKEY rider_id",
    owner: "Data Platform",
  },
  {
    id: "ready-incidents",
    area: "Incident fact",
    status: "Ready",
    bigQuery: "Clustered by ponto and severity",
    redshift: "SORTKEY occurred_at",
    owner: "Safety Ops",
  },
  {
    id: "ready-finance",
    area: "Ledger fact",
    status: "In Progress",
    bigQuery: "Decimal precision review",
    redshift: "Late-arriving rewards mapping",
    owner: "Finance Ops",
  },
  {
    id: "ready-crm",
    area: "CRM activity fact",
    status: "Blocked",
    bigQuery: "Missing partner source keys",
    redshift: "Requires consent flags",
    owner: "Growth Desk",
  },
];

export function getWarehouseSummary(): WarehouseSummary {
  const readyCount = warehouseReadiness.filter((item) => item.status === "Ready").length;
  const inProgressCount = warehouseReadiness.filter((item) => item.status === "In Progress").length;
  const readinessScore = Math.round(((readyCount + inProgressCount * 0.5) / warehouseReadiness.length) * 100);

  return {
    readinessScore,
    warehouseCandidates: ["BigQuery", "Redshift"],
    factsReady: 7,
    dimensionsReady: 5,
    openMappingRisks: warehouseReadiness.filter((item) => item.status !== "Ready").length,
    nextMilestone: "Finalize finance ledger precision and CRM partner keys before dual-write pilot.",
    readiness: warehouseReadiness,
    kpis: kpiSnapshots,
    scheduledExports,
  };
}
