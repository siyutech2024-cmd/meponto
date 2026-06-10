import { incidents, leaders, ledgerEntries, pontos, rewards, riders, type Incident, type LedgerEntry, type Rider } from "../data";
import { hydrateFromDatabase, trackCollection } from "./persistence";
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
import { chatMessages, chatRooms, type ChatMessage, type ChatRoom } from "../chat";
import { riderSlots, slotEnrollments, type RiderSlot, type SlotEnrollment } from "../slots";

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
    chatRooms: ChatRoom[];
    chatMessages: ChatMessage[];
    systemSettings: SystemSetting[];
    riderSlots: RiderSlot[];
    slotEnrollments: SlotEnrollment[];
    auditEntries: ServerAuditEntry[];
  };
};

export const memory =
  globalState.ventoMemory ??
  (globalState.ventoMemory = {
    riders: trackCollection("riders", [...riders]),
    incidents: trackCollection("incidents", [...incidents]),
    pontos: trackCollection("pontos", [...pontos]),
    leaders: trackCollection("leaders", [...leaders]),
    rewards: trackCollection("rewards", [...rewards]),
    ledgerEntries: trackCollection("ledgerEntries", [...ledgerEntries]),
    notifications: trackCollection("notifications", seedNotificationsFromIncidents(incidents)),
    crmPartners: trackCollection("crmPartners", [...crmPartners]),
    pointsLedgerEntries: trackCollection("pointsLedgerEntries", [...pointsLedgerEntries]),
    partnerServiceRecords: trackCollection("partnerServiceRecords", [...partnerServiceRecords]),
    partnerPointsLedgerEntries: trackCollection("partnerPointsLedgerEntries", [...partnerPointsLedgerEntries]),
    marketplaceProducts: trackCollection("marketplaceProducts", [...marketplaceProducts]),
    marketplaceOrders: trackCollection("marketplaceOrders", [...marketplaceOrders]),
    chatRooms: trackCollection("chatRooms", [...chatRooms]),
    chatMessages: trackCollection("chatMessages", [...chatMessages]),
    systemSettings: trackCollection("systemSettings", [...systemSettings]),
    riderSlots: trackCollection("riderSlots", [...riderSlots]),
    slotEnrollments: trackCollection("slotEnrollments", [...slotEnrollments]),
    auditEntries: trackCollection<ServerAuditEntry>("auditEntries", []),
  });

// Restore persisted data from the database (no-op when USE_SUPABASE is off).
void hydrateFromDatabase();

memory.ledgerEntries ??= [...ledgerEntries];
memory.notifications ??= seedNotificationsFromIncidents(memory.incidents);
memory.crmPartners ??= [...crmPartners];
memory.pointsLedgerEntries ??= [...pointsLedgerEntries];
memory.partnerServiceRecords ??= [...partnerServiceRecords];
memory.partnerPointsLedgerEntries ??= [...partnerPointsLedgerEntries];
memory.marketplaceProducts ??= [...marketplaceProducts];
memory.marketplaceOrders ??= [...marketplaceOrders];
memory.chatRooms ??= [...chatRooms];
memory.chatMessages ??= [...chatMessages];
memory.systemSettings ??= [...systemSettings];
memory.riderSlots ??= [...riderSlots];
memory.slotEnrollments ??= [...slotEnrollments];
memory.auditEntries ??= [];

// Ensure every collection is mutation-tracked, even when an older in-memory
// state survived a dev hot reload before tracking existed.
memory.riders = trackCollection("riders", memory.riders);
memory.incidents = trackCollection("incidents", memory.incidents);
memory.pontos = trackCollection("pontos", memory.pontos);
memory.leaders = trackCollection("leaders", memory.leaders);
memory.rewards = trackCollection("rewards", memory.rewards);
memory.ledgerEntries = trackCollection("ledgerEntries", memory.ledgerEntries);
memory.notifications = trackCollection("notifications", memory.notifications);
memory.crmPartners = trackCollection("crmPartners", memory.crmPartners);
memory.pointsLedgerEntries = trackCollection("pointsLedgerEntries", memory.pointsLedgerEntries);
memory.partnerServiceRecords = trackCollection("partnerServiceRecords", memory.partnerServiceRecords);
memory.partnerPointsLedgerEntries = trackCollection("partnerPointsLedgerEntries", memory.partnerPointsLedgerEntries);
memory.marketplaceProducts = trackCollection("marketplaceProducts", memory.marketplaceProducts);
memory.marketplaceOrders = trackCollection("marketplaceOrders", memory.marketplaceOrders);
memory.chatRooms = trackCollection("chatRooms", memory.chatRooms);
memory.chatMessages = trackCollection("chatMessages", memory.chatMessages);
memory.systemSettings = trackCollection("systemSettings", memory.systemSettings);
memory.riderSlots = trackCollection("riderSlots", memory.riderSlots);
memory.slotEnrollments = trackCollection("slotEnrollments", memory.slotEnrollments);
memory.auditEntries = trackCollection("auditEntries", memory.auditEntries);

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

/** Accept a client-generated id when it is a safe identifier, so the browser
 *  store and the server/database share the same record ids. */
export function acceptClientId(id: unknown): string | null {
  return typeof id === "string" && /^[\w.:-]{1,64}$/.test(id) ? id : null;
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
