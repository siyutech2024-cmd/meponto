export const POINTS_PER_BRL = 10;

export type ImportBatchSummary = {
  id: string;
  provider: string;
  businessDate: string;
  status: string;
  orderRows: number;
  riderRows: number;
  financeRows: number;
  matchedRiders: number;
  unknownRiders: number;
  warnings: number;
  uploadedBy: string;
};

export type KpiRuleSummary = {
  id: string;
  name: string;
  version: number;
  status: string;
  minCompletedOrders: number;
  minAttendanceMinutes: number;
  minAcceptanceRate: number;
  maxCancellationRate: number;
  pointsReward: number;
};

export type QuotaCycleSummary = {
  id: string;
  externalScheduleRef: string;
  name: string;
  weekStart: string;
  weekEnd: string;
  platformCapacity: number;
  status: string;
};

export type FranchiseQuotaSummary = {
  id: string;
  cycleId: string;
  franchiseId: string;
  franchiseName: string;
  quota: number;
  stationAllocated: number;
  remaining: number;
};

export type StationQuotaSummary = {
  id: string;
  franchiseAllocationId: string;
  stationId: string;
  stationName: string;
  quota: number;
};

export type WhitelistExportSummary = {
  id: string;
  cycleId: string;
  status: string;
  rowCount: number;
  fileName: string;
  generatedBy: string;
  generatedAt: string;
};

export type OperationsCoreState = {
  source: "supabase" | "fallback";
  importBatches: ImportBatchSummary[];
  kpiRules: KpiRuleSummary[];
  quotaCycles: QuotaCycleSummary[];
  franchiseQuotas: FranchiseQuotaSummary[];
  stationQuotas: StationQuotaSummary[];
  whitelistExports: WhitelistExportSummary[];
  summary: {
    latestBusinessDate: string;
    importedRows: number;
    unknownRiders: number;
    platformCapacity: number;
    franchiseAllocated: number;
    stationAllocated: number;
    approvedEnrollments: number;
    readyForExport: number;
  };
};

export const fallbackOperationsCore: OperationsCoreState = {
  source: "fallback",
  importBatches: [
    {
      id: "imp-20260607-99",
      provider: "External Dispatch System",
      businessDate: "2026-06-07",
      status: "approved",
      orderRows: 1284,
      riderRows: 86,
      financeRows: 1284,
      matchedRiders: 84,
      unknownRiders: 2,
      warnings: 3,
      uploadedBy: "HQ Operations",
    },
  ],
  kpiRules: [
    {
      id: "kpi-rider-v1",
      name: "Rider Daily KPI",
      version: 1,
      status: "active",
      minCompletedOrders: 8,
      minAttendanceMinutes: 360,
      minAcceptanceRate: 85,
      maxCancellationRate: 8,
      pointsReward: 20,
    },
  ],
  quotaCycles: [
    {
      id: "quota-20260608",
      externalScheduleRef: "EXT-SCHEDULE-W24",
      name: "Week 24 Capacity",
      weekStart: "2026-06-08",
      weekEnd: "2026-06-14",
      platformCapacity: 180,
      status: "open",
    },
  ],
  franchiseQuotas: [
    {
      id: "fqa-core-w24",
      cycleId: "quota-20260608",
      franchiseId: "tenant-fr-sp-core",
      franchiseName: "SP Core Franchise",
      quota: 110,
      stationAllocated: 110,
      remaining: 0,
    },
    {
      id: "fqa-tatuape-w24",
      cycleId: "quota-20260608",
      franchiseId: "tenant-fr-tatuape",
      franchiseName: "Tatuape Growth Franchise",
      quota: 70,
      stationAllocated: 70,
      remaining: 0,
    },
  ],
  stationQuotas: [
    { id: "sqa-paulista-w24", franchiseAllocationId: "fqa-core-w24", stationId: "tenant-st-paulista", stationName: "Ponto Paulista Garage", quota: 65 },
    { id: "sqa-liberdade-w24", franchiseAllocationId: "fqa-core-w24", stationId: "tenant-st-liberdade", stationName: "Ponto Liberdade Sul", quota: 45 },
    { id: "sqa-tatuape-w24", franchiseAllocationId: "fqa-tatuape-w24", stationId: "tenant-st-tatuape", stationName: "Ponto Tatuape Norte", quota: 70 },
  ],
  whitelistExports: [],
  summary: {
    latestBusinessDate: "2026-06-07",
    importedRows: 2654,
    unknownRiders: 2,
    platformCapacity: 180,
    franchiseAllocated: 180,
    stationAllocated: 180,
    approvedEnrollments: 1,
    readyForExport: 1,
  },
};

