export type NinetyNineSourceKey = "performance" | "earnings" | "account_statement";
export type NinetyNineImportStatus = "Ready" | "Warning" | "Blocked" | "Posted";

export type NinetyNineSourceDefinition = {
  key: NinetyNineSourceKey;
  label: string;
  filePattern: string;
  businessPurpose: string;
  required: boolean;
  businessDateColumn: string;
  uniqueColumns: string[];
  expectedColumns: string[];
  sampleFile: string;
  sampleRows: number;
  sampleRiders: number;
};

export type NinetyNineImportRule = {
  key: string;
  label: string;
  policy: string;
  riskGuard: string;
};

export type NinetyNineImportBatch = {
  id: string;
  uploadDate: string;
  businessDate: string;
  status: NinetyNineImportStatus;
  fileCount: number;
  performanceRows: number;
  earningsRows: number;
  statementRows: number;
  matchedRiders: number;
  warnings: string[];
  createdBy: string;
};

export type NinetyNineRiderPreview = {
  rider99Id: string;
  cpf: string;
  name: string;
  phone?: string;
  businessDate: string;
  membershipTier: 1 | 2 | 3 | 4 | 5;
  olStatus: "Not joined" | "Joined OL";
  orders: number;
  tshHours: number;
  ar: number | null;
  caa: number | null;
  grossEarnings: number | null;
  estimatedPoints: number;
  importStatus: NinetyNineImportStatus;
  issue: string;
};

export const ninetyNineSourceDefinitions: NinetyNineSourceDefinition[] = [
  {
    key: "performance",
    label: "Desempenho rider performance",
    filePattern: "Desempenho_do_entregador_parceiro_YYYYMMDD_*.xlsx",
    businessPurpose: "Orders, TSH, AR, CAA, shift hours, and rider performance score.",
    required: true,
    businessDateColumn: "日期",
    uniqueColumns: ["骑手ID", "骑手的身份证", "日期"],
    expectedColumns: [
      "骑手ID",
      "骑手的身份证",
      "骑手姓名",
      "电话号码",
      "城市",
      "在线时长",
      "完单数量",
      "报名的班次数量",
      "报名的班次总时长",
      "班次内实际在线时长",
      "%TSH",
      "AR",
      "CAA",
      "日期",
    ],
    sampleFile: "Desempenho_do_entregador_parceiro_20260529_5764785495129194973.xlsx",
    sampleRows: 23,
    sampleRiders: 23,
  },
  {
    key: "earnings",
    label: "Ganhos rider earnings",
    filePattern: "Ganhos_do_entregador_parceiro_YYYYMMDD_*.xlsx",
    businessPurpose: "Wallet read model, income summary, bonus, deductions, tips, and referral reward reconciliation.",
    required: true,
    businessDateColumn: "日期",
    uniqueColumns: ["骑手ID", "骑手身份证号", "日期"],
    expectedColumns: ["城市", "骑手ID", "骑手姓名", "骑手电话", "骑手身份证号", "今日统计", "行程收入", "现金单欠款", "餐损扣款", "奖励", "其他", "小费", "人工调整", "推荐奖励", "日期"],
    sampleFile: "Ganhos_do_entregador_parceiro_20260529_5764785496920162800.xlsx",
    sampleRows: 22,
    sampleRiders: 22,
  },
  {
    key: "account_statement",
    label: "Extrato account statement",
    filePattern: "Extrato_da_conta_YYYYMMDD_*.xlsx",
    businessPurpose: "Transaction detail, account statement drilldown, and reconciliation evidence.",
    required: true,
    businessDateColumn: "日期",
    uniqueColumns: ["source_file_id", "row_number", "骑手ID", "日期", "时间"],
    expectedColumns: ["日期", "时间", "骑手ID", "骑手姓名", "身份证号", "类型", "金额"],
    sampleFile: "Extrato_da_conta_20260529_5764785581166952920.xlsx",
    sampleRows: 547,
    sampleRiders: 22,
  },
];

export const ninetyNineImportRules: NinetyNineImportRule[] = [
  {
    key: "business_date",
    label: "Previous-day business date",
    policy: "The Excel row date is the business date. The upload date only identifies the import batch.",
    riskGuard: "Blocks accidental use of today's upload timestamp for yesterday's rider performance.",
  },
  {
    key: "idempotency",
    label: "Daily idempotency",
    policy: "One active batch per business date. Re-import replaces the same date read model and reverses draft point calculations before reposting.",
    riskGuard: "Prevents duplicate points, duplicated wallet totals, and repeated referral activation.",
  },
  {
    key: "tier_gate",
    label: "OL membership gate",
    policy: "Registered riders start as tier 1. Joining OL promotes the rider to tier 2; only tier 2+ generates 99-driven performance records.",
    riskGuard: "Keeps public registrations from generating business data or discount benefits before OL activation.",
  },
  {
    key: "matching",
    label: "Rider matching priority",
    policy: "Match by 99 rider ID first, CPF second, phone third. Conflicts require manual review.",
    riskGuard: "Avoids assigning income, points, or star progress to the wrong rider.",
  },
  {
    key: "statement_raw_rows",
    label: "Account statement raw rows",
    policy: "Extrato rows are stored with source file ID and row number because identical transaction rows may be valid.",
    riskGuard: "Avoids deleting legitimate duplicate-looking transaction rows when no platform transaction ID exists.",
  },
  {
    key: "posting_hold",
    label: "Points posting hold",
    policy: "The import creates a daily performance read model first. Points ledger posting requires batch approval or auto-release rules.",
    riskGuard: "Keeps the points economy controlled while 99 source data quality is still being checked.",
  },
];

export const ninetyNineImportBatches: NinetyNineImportBatch[] = [
  {
    id: "99imp-20260528-001",
    uploadDate: "2026-05-29",
    businessDate: "2026-05-28",
    status: "Warning",
    fileCount: 3,
    performanceRows: 23,
    earningsRows: 22,
    statementRows: 547,
    matchedRiders: 22,
    warnings: ["Performance has 23 riders while earnings has 22 riders.", "Extrato has duplicate-looking raw rows and must keep source row identity."],
    createdBy: "Ops Desk",
  },
];

export const ninetyNineRiderPreviews: NinetyNineRiderPreview[] = [
  {
    rider99Id: "650911249813659",
    cpf: "2020649217",
    name: "DANIELA BRAGA DE SOUZA",
    phone: "11954809797",
    businessDate: "2026-05-28",
    membershipTier: 2,
    olStatus: "Joined OL",
    orders: 6,
    tshHours: 6.1,
    ar: 36.8,
    caa: 14.3,
    grossEarnings: null,
    estimatedPoints: 60,
    importStatus: "Warning",
    issue: "AR below bonus threshold; earnings row missing in sample match.",
  },
  {
    rider99Id: "650911472327075",
    cpf: "38343437810",
    name: "ADRANO RODRIGUES ALVES DOS SANTOS",
    phone: "11997217950",
    businessDate: "2026-05-28",
    membershipTier: 2,
    olStatus: "Joined OL",
    orders: 9,
    tshHours: 8.9,
    ar: 64.3,
    caa: 0,
    grossEarnings: null,
    estimatedPoints: 80,
    importStatus: "Ready",
    issue: "Ready for performance read model.",
  },
  {
    rider99Id: "650911840350961",
    cpf: "44499390850",
    name: "CLEITON SILVA DE OLIVEIRA",
    phone: "11914743222",
    businessDate: "2026-05-28",
    membershipTier: 2,
    olStatus: "Joined OL",
    orders: 0,
    tshHours: 0,
    ar: null,
    caa: null,
    grossEarnings: 190.14,
    estimatedPoints: 0,
    importStatus: "Warning",
    issue: "Earnings exists but performance row was not found in sample preview.",
  },
  {
    rider99Id: "650910973121259",
    cpf: "45932927860",
    name: "MARCIO FERREIRA MENEZES",
    phone: "11958087915",
    businessDate: "2026-05-28",
    membershipTier: 1,
    olStatus: "Not joined",
    orders: 0,
    tshHours: 0,
    ar: null,
    caa: null,
    grossEarnings: null,
    estimatedPoints: 0,
    importStatus: "Blocked",
    issue: "Tier 1 rider. Join OL before 99 performance can produce points.",
  },
];

export function summarizeNinetyNineImport() {
  const batch = ninetyNineImportBatches[0];
  const ready = ninetyNineRiderPreviews.filter((row) => row.importStatus === "Ready").length;
  const warnings = ninetyNineRiderPreviews.filter((row) => row.importStatus === "Warning").length;
  const blocked = ninetyNineRiderPreviews.filter((row) => row.importStatus === "Blocked").length;
  const estimatedPoints = ninetyNineRiderPreviews.reduce((sum, row) => sum + row.estimatedPoints, 0);

  return {
    businessDate: batch.businessDate,
    uploadDate: batch.uploadDate,
    files: batch.fileCount,
    ridersMatched: batch.matchedRiders,
    ready,
    warnings,
    blocked,
    estimatedPoints,
    status: batch.status,
  };
}
