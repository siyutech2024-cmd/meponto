import { incidents, leaders, ledgerEntries, pontos, rewards, riders, type Incident, type LedgerEntry, type Rider } from "../data";
import { flushPendingToDatabase, hasPendingPersistence, hydrateFromDatabase, trackCollection } from "./persistence";

/**
 * Next's `after()` keeps a serverless function alive until the given promise
 * settles. Without it, Vercel freezes the function right after the response
 * is sent and the database write-through would never run. Loaded dynamically
 * so this module keeps working outside the Next runtime (tests, scripts).
 */
type NextAfter = (task: Promise<unknown>) => void;
let nextAfter: NextAfter | undefined;
void import("next/server")
  .then((mod) => {
    nextAfter = (mod as { after?: NextAfter }).after;
  })
  .catch(() => {
    nextAfter = undefined;
  });

function scheduleResponseFlush() {
  if (!hasPendingPersistence()) return;
  const task = flushPendingToDatabase().catch(() => undefined);
  if (nextAfter) {
    try {
      nextAfter(task);
      return;
    } catch {
      // outside a request scope — the floating promise below still runs
    }
  }
}
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
import { leads, type Lead } from "../leads";
import { dispatchShifts, shiftQuotas, shiftSignups, type DispatchShift, type ShiftQuota, type ShiftSignup } from "../dispatch";
import { appUsers, type AppUser } from "../users";
import { riderDailyEarnings, riderDailyKpis, type RiderDailyEarning, type RiderDailyKpi } from "../performance";
import { mallConfigs, type MallConfig } from "../mall";

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
    leads: Lead[];
    dispatchShifts: DispatchShift[];
    shiftQuotas: ShiftQuota[];
    shiftSignups: ShiftSignup[];
    appUsers: AppUser[];
    riderDailyKpis: RiderDailyKpi[];
    riderDailyEarnings: RiderDailyEarning[];
    mallConfigs: MallConfig[];
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
    leads: trackCollection("leads", [...leads]),
    dispatchShifts: trackCollection("dispatchShifts", [...dispatchShifts]),
    shiftQuotas: trackCollection("shiftQuotas", [...shiftQuotas]),
    shiftSignups: trackCollection("shiftSignups", [...shiftSignups]),
    appUsers: trackCollection("appUsers", [...appUsers]),
    riderDailyKpis: trackCollection("riderDailyKpis", [...riderDailyKpis]),
    riderDailyEarnings: trackCollection("riderDailyEarnings", [...riderDailyEarnings]),
    mallConfigs: trackCollection("mallConfigs", [...mallConfigs]),
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
memory.leads ??= [];
memory.leads = trackCollection("leads", memory.leads);
memory.dispatchShifts ??= [];
memory.dispatchShifts = trackCollection("dispatchShifts", memory.dispatchShifts);
memory.shiftQuotas ??= [];
memory.shiftQuotas = trackCollection("shiftQuotas", memory.shiftQuotas);
memory.shiftSignups ??= [];
memory.shiftSignups = trackCollection("shiftSignups", memory.shiftSignups);
memory.appUsers ??= [];
memory.appUsers = trackCollection("appUsers", memory.appUsers);
memory.riderDailyKpis ??= [];
memory.riderDailyKpis = trackCollection("riderDailyKpis", memory.riderDailyKpis);
memory.riderDailyEarnings ??= [];
memory.riderDailyEarnings = trackCollection("riderDailyEarnings", memory.riderDailyEarnings);
memory.mallConfigs ??= [...mallConfigs];
memory.mallConfigs = trackCollection("mallConfigs", memory.mallConfigs);

export function jsonResponse<T>(data: T, init?: ResponseInit) {
  // Make sure pending mutations reach the database even on serverless,
  // where the runtime freezes as soon as the response is returned.
  scheduleResponseFlush();

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
