import { incidents, leaders, ledgerEntries, pontos, rewards, riders, type Incident, type LedgerEntry, type Rider } from "../data";
import { seedNotificationsFromIncidents, type NotificationItem } from "../notifications";
import { crmPartners, type CrmPartner } from "../crm";
import {
  marketplaceOrders,
  marketplaceProducts,
  partnerServiceRecords,
  partnerPointsLedgerEntries,
  pointsLedgerEntries,
  type MarketplaceOrder,
  type MarketplaceProduct,
  type PartnerServiceRecord,
  type PartnerPointsLedgerEntry,
  type PointsLedgerEntry,
} from "../points";
import { systemSettings, type SystemSetting } from "../settings";
import { whatsappGroups, type WhatsappGroup } from "../whatsapp";

type Reward = (typeof rewards)[number];
type Ponto = (typeof pontos)[number];
type Leader = (typeof leaders)[number];

export type ServerAuditRisk = "Low" | "Medium" | "High";

export type ServerAuditEntry = {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  detail: string;
  createdAt: string;
  risk: ServerAuditRisk;
};

const globalState = globalThis as typeof globalThis & {
  ventoMemory?: {
    riders: Rider[];
    incidents: Incident[];
    pontos: Ponto[];
    leaders: Leader[];
    rewards: Reward[];
    ledgerEntries: LedgerEntry[];
    notifications: NotificationItem[];
    crmPartners: CrmPartner[];
    pointsLedgerEntries: PointsLedgerEntry[];
    partnerServiceRecords: PartnerServiceRecord[];
    partnerPointsLedgerEntries: PartnerPointsLedgerEntry[];
    marketplaceProducts: MarketplaceProduct[];
    marketplaceOrders: MarketplaceOrder[];
    whatsappGroups: WhatsappGroup[];
    systemSettings: SystemSetting[];
    auditEntries: ServerAuditEntry[];
  };
};

export const memory =
  globalState.ventoMemory ??
  (globalState.ventoMemory = {
    riders: [...riders],
    incidents: [...incidents],
    pontos: [...pontos],
    leaders: [...leaders],
    rewards: [...rewards],
    ledgerEntries: [...ledgerEntries],
    notifications: seedNotificationsFromIncidents(incidents),
    crmPartners: [...crmPartners],
    pointsLedgerEntries: [...pointsLedgerEntries],
    partnerServiceRecords: [...partnerServiceRecords],
    partnerPointsLedgerEntries: [...partnerPointsLedgerEntries],
    marketplaceProducts: [...marketplaceProducts],
    marketplaceOrders: [...marketplaceOrders],
    whatsappGroups: [...whatsappGroups],
    systemSettings: [...systemSettings],
    auditEntries: [],
  });

memory.ledgerEntries ??= [...ledgerEntries];
memory.notifications ??= seedNotificationsFromIncidents(memory.incidents);
memory.crmPartners ??= [...crmPartners];
memory.pointsLedgerEntries ??= [...pointsLedgerEntries];
memory.partnerServiceRecords ??= [...partnerServiceRecords];
memory.partnerPointsLedgerEntries ??= [...partnerPointsLedgerEntries];
memory.marketplaceProducts ??= [...marketplaceProducts];
memory.marketplaceOrders ??= [...marketplaceOrders];
memory.whatsappGroups ??= [...whatsappGroups];
memory.systemSettings ??= [...systemSettings];
memory.auditEntries ??= [];

export function jsonResponse<T>(data: T, init?: ResponseInit) {
  return Response.json(data, {
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
    status: init?.status,
  });
}

export function makeServerId(prefix: string, count: number) {
  return `${prefix}-${Date.now().toString(36)}-${count}`;
}

export function appendServerAudit(entry: Omit<ServerAuditEntry, "id" | "createdAt">) {
  const auditEntry: ServerAuditEntry = {
    id: makeServerId("aud", memory.auditEntries.length + 1),
    createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    ...entry,
  };

  memory.auditEntries.unshift(auditEntry);
  return auditEntry;
}
