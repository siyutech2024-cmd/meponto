import type { Incident, LedgerEntry, Rider, RiderStatus } from "./data";

export type ExportEntity = "Riders" | "Incidents" | "Finance";
export type ExportFormat = "CSV" | "JSON";
export type OperationStatus = "Ready" | "Queued" | "Processing" | "Completed" | "Failed";

export type ExportDefinition = {
  id: string;
  entity: ExportEntity;
  format: ExportFormat;
  records: number;
  lastRunAt: string;
  requestedBy: string;
  filename: string;
};

export type RiderImportPreview = {
  row: number;
  name: string;
  cpf: string;
  phone: string;
  ponto: string;
  leader: string;
  status: RiderStatus;
  issues: string[];
};

export type OperationHistoryItem = {
  id: string;
  operation: "Import" | "Export";
  entity: ExportEntity;
  status: OperationStatus;
  records: number;
  requestedBy: string;
  createdAt: string;
  detail: string;
};

export type ImportJobInput = {
  entity?: ExportEntity;
  filename?: string;
  rows?: number;
  requestedBy?: string;
};

export function buildExportDefinitions(riders: Rider[], incidents: Incident[], ledgerEntries: LedgerEntry[]): ExportDefinition[] {
  return [
    {
      id: "exp-riders-csv",
      entity: "Riders",
      format: "CSV",
      records: riders.length,
      lastRunAt: "2026-05-15 17:20",
      requestedBy: "Ops Desk",
      filename: "vento-riders-export.csv",
    },
    {
      id: "exp-incidents-csv",
      entity: "Incidents",
      format: "CSV",
      records: incidents.length,
      lastRunAt: "2026-05-15 16:05",
      requestedBy: "Safety Lead",
      filename: "vento-incidents-export.csv",
    },
    {
      id: "exp-finance-json",
      entity: "Finance",
      format: "JSON",
      records: ledgerEntries.length,
      lastRunAt: "2026-05-14 23:40",
      requestedBy: "Finance Admin",
      filename: "vento-finance-ledger.json",
    },
  ];
}

export const riderImportCsv = `name,cpf,phone,ponto,leader,status
Bruna Nascimento,410.774.220-01,+55 11 90000-2101,Ponto Paulista Garage,Rafael Costa,Active
Igor Almeida,553.918.707-02,+55 11 90000-2102,Ponto Tatuape Norte,Marcos Lima,Night Shift
Renata Souza,,+55 11 90000-2103,Ponto Liberdade Sul,Joao Pereira,Risk`;

export function parseRiderImportPreview(csv: string): RiderImportPreview[] {
  const rows = csv.trim().split(/\r?\n/).slice(1);

  return rows
    .map((line, index) => {
      const [name = "", cpf = "", phone = "", ponto = "", leader = "", rawStatus = "Active"] = line.split(",").map((value) => value.trim());
      const status = normalizeStatus(rawStatus);
      const issues = [
        !name ? "Missing name" : "",
        !cpf ? "Missing CPF" : "",
        !phone ? "Missing phone" : "",
        !ponto ? "Missing ponto" : "",
        !leader ? "Missing leader" : "",
      ].filter(Boolean);

      return {
        row: index + 2,
        name,
        cpf,
        phone,
        ponto,
        leader,
        status,
        issues,
      };
    })
    .filter((row) => row.name || row.cpf || row.phone);
}

export const operationHistory: OperationHistoryItem[] = [
  {
    id: "op-901",
    operation: "Import",
    entity: "Riders",
    status: "Completed",
    records: 42,
    requestedBy: "Super Admin",
    createdAt: "2026-05-15 15:18",
    detail: "Rider onboarding batch matched by CPF with 2 warnings",
  },
  {
    id: "op-902",
    operation: "Export",
    entity: "Incidents",
    status: "Completed",
    records: 3,
    requestedBy: "Safety Lead",
    createdAt: "2026-05-15 16:05",
    detail: "Incident response CSV generated for regional review",
  },
  {
    id: "op-903",
    operation: "Export",
    entity: "Finance",
    status: "Ready",
    records: 4,
    requestedBy: "Finance Admin",
    createdAt: "2026-05-14 23:40",
    detail: "Ledger JSON package available for reconciliation",
  },
];

export function createImportJob(input: ImportJobInput): OperationHistoryItem {
  return {
    id: `op-${Date.now().toString(36)}`,
    operation: "Import",
    entity: input.entity ?? "Riders",
    status: "Queued",
    records: input.rows ?? 0,
    requestedBy: input.requestedBy ?? "Ops Desk",
    createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    detail: `${input.filename ?? "riders-import.csv"} queued for validation preview`,
  };
}

function normalizeStatus(value: string): RiderStatus {
  if (value === "Inactive" || value === "Risk" || value === "Night Shift") {
    return value;
  }

  return "Active";
}
