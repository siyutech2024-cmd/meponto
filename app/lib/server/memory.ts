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

/** 演示种子只在未开持久化(本地 / 冒烟)时灌入;生产从数据库水合。 */
const demoSeedsEnabled = process.env.USE_SUPABASE !== "true";
/** 演示事故 id(app/lib/data.ts);生产库里若还残留,读取时清掉。 */
export const DEMO_INCIDENT_IDS = new Set(["inc-9001", "inc-9002", "inc-9003"]);
export const DEMO_NOTIFICATION_IDS = new Set([...DEMO_INCIDENT_IDS].map((id) => `ntf-${id}`));
export const demoSeedsActive = () => demoSeedsEnabled;
import { crmPartners, crmCategories, type CrmPartner, type CrmCategory } from "../crm";
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
import { dispatchShifts, shiftQuotas, shiftSignups, swapRequests, type DispatchShift, type ShiftQuota, type ShiftSignup, type SwapRequest } from "../dispatch";
import { appUsers, type AppUser } from "../users";
import { riderDailyEarnings, riderDailyKpis, type RiderDailyEarning, type RiderDailyKpi } from "../performance";
import { mallConfigs, type MallConfig } from "../mall";
import type { CashLedgerEntry, CashTopUp, InventoryLedgerEntry, MallBanner, MallCategory, MallCoupon, MallPayment, MemberMessage, PriceChangeRequest, PurchaseOrder, RevenueShareEntry, RevenueShareStatement, SupplierStatement } from "../mall-ops";
import { riderWithdrawals, walletPayments, type RiderWithdrawal, type WalletPayment } from "../finance";
import { assessmentRules, type AssessmentRule } from "../assessment";
import { supportTickets, type SupportTicket } from "../support";
import { pushSubscriptions, fcmTokens, type PushSubscriptionRecord, type FcmTokenRecord } from "../push";
import { appSplashConfigs, type AppSplashRecord } from "../app-config";
import { appTasks, taskClaims, type AppTask, type TaskClaim } from "../tasks";
import { partnerReviews, type PartnerReview } from "../partner-reviews";
import { supplierProfiles, type SupplierProfile } from "../supplier";
import { franchises, type Franchise } from "../network";
import type {
  FranchiseDepositLedgerEntry,
  FranchiseDepositTopUp,
  FranchisePurchaseOrder,
  ProcurementDiscrepancy,
  ProcurementMarginEntry,
  StationStockLedgerEntry,
} from "../procurement";

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
    crmCategories: CrmCategory[];
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
    swapRequests: SwapRequest[];
    appUsers: AppUser[];
    riderDailyKpis: RiderDailyKpi[];
    riderDailyEarnings: RiderDailyEarning[];
    mallConfigs: MallConfig[];
    riderWithdrawals: RiderWithdrawal[];
    walletPayments: WalletPayment[];
    assessmentRules: AssessmentRule[];
    supportTickets: SupportTicket[];
    pushSubscriptions: PushSubscriptionRecord[];
    fcmTokens: FcmTokenRecord[];
    appSplashConfigs: AppSplashRecord[];
    appTasks: AppTask[];
    taskClaims: TaskClaim[];
    partnerReviews: PartnerReview[];
    supplierProfiles: SupplierProfile[];
    franchises: Franchise[];
    mallCategories: MallCategory[];
    mallBanners: MallBanner[];
    mallCoupons: MallCoupon[];
    priceChangeRequests: PriceChangeRequest[];
    purchaseOrders: PurchaseOrder[];
    supplierStatements: SupplierStatement[];
    mallPayments: MallPayment[];
    cashTopUps: CashTopUp[];
    cashLedgerEntries: CashLedgerEntry[];
    inventoryLedgerEntries: InventoryLedgerEntry[];
    mallRevenueShareEntries: RevenueShareEntry[];
    revenueShareStatements: RevenueShareStatement[];
    memberMessages: MemberMessage[];
    hotZoneAssignments: HotZoneAssignment[];
    franchisePurchaseOrders: FranchisePurchaseOrder[];
    stationStockLedgerEntries: StationStockLedgerEntry[];
    franchiseDepositLedgerEntries: FranchiseDepositLedgerEntry[];
    franchiseDepositTopUps: FranchiseDepositTopUp[];
    procurementDiscrepancies: ProcurementDiscrepancy[];
    procurementMarginEntries: ProcurementMarginEntry[];
  };
};

/** HQ assignment of an Eastwind hot zone (see app/rider-monitor/hot-zones.ts)
 *  to one or MORE franchises (zones can be shared). id = the zone's stable id.
 *  Legacy rows persisted with a single `franchise` string are normalized on
 *  read by the zone-assignments route. */
export type HotZoneAssignment = { id: string; franchises: string[]; updatedAt: string; franchise?: string };

export const memory =
  globalState.ventoMemory ??
  (globalState.ventoMemory = {
    riders: trackCollection("riders", [...riders]),
    // 生产(USE_SUPABASE=true)不再灌演示事故/通知:此前每次冷启动都把 2026-05 的
    // "Felipe Rocha 严重事故" 等演示数据塞回内存,小铃铛永远亮着几个月前的提示。
    incidents: trackCollection("incidents", demoSeedsEnabled ? [...incidents] : []),
    pontos: trackCollection("pontos", [...pontos]),
    leaders: trackCollection("leaders", [...leaders]),
    rewards: trackCollection("rewards", [...rewards]),
    ledgerEntries: trackCollection("ledgerEntries", [...ledgerEntries]),
    notifications: trackCollection("notifications", demoSeedsEnabled ? seedNotificationsFromIncidents(incidents) : []),
    crmPartners: trackCollection("crmPartners", [...crmPartners]),
    crmCategories: trackCollection("crmCategories", [...crmCategories]),
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
    swapRequests: trackCollection<SwapRequest>("swapRequests", [...swapRequests]),
    shiftQuotas: trackCollection("shiftQuotas", [...shiftQuotas]),
    shiftSignups: trackCollection("shiftSignups", [...shiftSignups]),
    appUsers: trackCollection("appUsers", [...appUsers]),
    riderDailyKpis: trackCollection("riderDailyKpis", [...riderDailyKpis]),
    riderDailyEarnings: trackCollection("riderDailyEarnings", [...riderDailyEarnings]),
    mallConfigs: trackCollection("mallConfigs", [...mallConfigs]),
    riderWithdrawals: trackCollection("riderWithdrawals", [...riderWithdrawals]),
    walletPayments: trackCollection("walletPayments", [...walletPayments]),
    assessmentRules: trackCollection("assessmentRules", [...assessmentRules]),
    supportTickets: trackCollection("supportTickets", [...supportTickets]),
    pushSubscriptions: trackCollection("pushSubscriptions", [...pushSubscriptions]),
    fcmTokens: trackCollection("fcmTokens", [...fcmTokens]),
    appSplashConfigs: trackCollection("appSplashConfigs", [...appSplashConfigs]),
    appTasks: trackCollection("appTasks", [...appTasks]),
    taskClaims: trackCollection("taskClaims", [...taskClaims]),
    partnerReviews: trackCollection("partnerReviews", [...partnerReviews]),
    supplierProfiles: trackCollection("supplierProfiles", [...supplierProfiles]),
    franchises: trackCollection("franchises", [...franchises]),
    mallCategories: trackCollection("mallCategories", []),
    mallBanners: trackCollection("mallBanners", []),
    mallCoupons: trackCollection("mallCoupons", []),
    priceChangeRequests: trackCollection("priceChangeRequests", []),
    purchaseOrders: trackCollection("purchaseOrders", []),
    supplierStatements: trackCollection("supplierStatements", []),
    mallPayments: trackCollection("mallPayments", []),
    cashTopUps: trackCollection("cashTopUps", []),
    cashLedgerEntries: trackCollection("cashLedgerEntries", []),
    inventoryLedgerEntries: trackCollection<InventoryLedgerEntry>("inventoryLedgerEntries", []),
    mallRevenueShareEntries: trackCollection("mallRevenueShareEntries", []),
    revenueShareStatements: trackCollection("revenueShareStatements", []),
    memberMessages: trackCollection("memberMessages", []),
    hotZoneAssignments: trackCollection<HotZoneAssignment>("hotZoneAssignments", []),
    franchisePurchaseOrders: trackCollection<FranchisePurchaseOrder>("franchisePurchaseOrders", []),
    stationStockLedgerEntries: trackCollection<StationStockLedgerEntry>("stationStockLedgerEntries", []),
    franchiseDepositLedgerEntries: trackCollection<FranchiseDepositLedgerEntry>("franchiseDepositLedgerEntries", []),
    franchiseDepositTopUps: trackCollection<FranchiseDepositTopUp>("franchiseDepositTopUps", []),
    procurementDiscrepancies: trackCollection<ProcurementDiscrepancy>("procurementDiscrepancies", []),
    procurementMarginEntries: trackCollection<ProcurementMarginEntry>("procurementMarginEntries", []),
  });

// Restore persisted data from the database (no-op when USE_SUPABASE is off).
void hydrateFromDatabase();

memory.ledgerEntries ??= [...ledgerEntries];
memory.notifications ??= demoSeedsEnabled ? seedNotificationsFromIncidents(memory.incidents) : [];
memory.crmPartners ??= [...crmPartners];
memory.crmCategories ??= [...crmCategories];
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
memory.crmCategories = trackCollection("crmCategories", memory.crmCategories);
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
memory.riderWithdrawals ??= [];
memory.riderWithdrawals = trackCollection("riderWithdrawals", memory.riderWithdrawals);
memory.supportTickets ??= [];
memory.supportTickets = trackCollection("supportTickets", memory.supportTickets);
memory.pushSubscriptions ??= [];
memory.pushSubscriptions = trackCollection("pushSubscriptions", memory.pushSubscriptions);
memory.fcmTokens ??= [];
memory.fcmTokens = trackCollection("fcmTokens", memory.fcmTokens);
memory.appSplashConfigs ??= [...appSplashConfigs];
if (memory.appSplashConfigs.length === 0) memory.appSplashConfigs.push({ ...appSplashConfigs[0] });
memory.appSplashConfigs = trackCollection("appSplashConfigs", memory.appSplashConfigs);
memory.appTasks ??= [...appTasks];
memory.appTasks = trackCollection("appTasks", memory.appTasks);
memory.taskClaims ??= [];
memory.taskClaims = trackCollection("taskClaims", memory.taskClaims);
memory.partnerReviews ??= [];
memory.partnerReviews = trackCollection("partnerReviews", memory.partnerReviews);
memory.supplierProfiles ??= [];
memory.supplierProfiles = trackCollection("supplierProfiles", memory.supplierProfiles);
memory.franchises ??= [];
memory.franchises = trackCollection("franchises", memory.franchises);
memory.mallCategories ??= [];
memory.mallCategories = trackCollection("mallCategories", memory.mallCategories);
memory.mallBanners ??= [];
memory.mallBanners = trackCollection("mallBanners", memory.mallBanners);
memory.mallCoupons ??= [];
memory.mallCoupons = trackCollection("mallCoupons", memory.mallCoupons);
memory.priceChangeRequests ??= [];
memory.priceChangeRequests = trackCollection("priceChangeRequests", memory.priceChangeRequests);
memory.purchaseOrders ??= [];
memory.purchaseOrders = trackCollection("purchaseOrders", memory.purchaseOrders);
memory.supplierStatements ??= [];
memory.supplierStatements = trackCollection("supplierStatements", memory.supplierStatements);
memory.mallPayments ??= [];
memory.mallPayments = trackCollection("mallPayments", memory.mallPayments);
memory.cashTopUps ??= [];
memory.cashTopUps = trackCollection("cashTopUps", memory.cashTopUps);
memory.cashLedgerEntries ??= [];
memory.cashLedgerEntries = trackCollection("cashLedgerEntries", memory.cashLedgerEntries);
memory.inventoryLedgerEntries ??= [];
memory.inventoryLedgerEntries = trackCollection("inventoryLedgerEntries", memory.inventoryLedgerEntries);
memory.mallRevenueShareEntries ??= [];
memory.mallRevenueShareEntries = trackCollection("mallRevenueShareEntries", memory.mallRevenueShareEntries);
memory.revenueShareStatements ??= [];
memory.revenueShareStatements = trackCollection("revenueShareStatements", memory.revenueShareStatements);
memory.memberMessages ??= [];
memory.memberMessages = trackCollection("memberMessages", memory.memberMessages);
memory.walletPayments ??= [];
memory.walletPayments = trackCollection("walletPayments", memory.walletPayments);
memory.assessmentRules ??= [];
memory.assessmentRules = trackCollection("assessmentRules", memory.assessmentRules);
memory.swapRequests ??= [];
memory.swapRequests = trackCollection("swapRequests", memory.swapRequests);
memory.hotZoneAssignments ??= [];
memory.hotZoneAssignments = trackCollection("hotZoneAssignments", memory.hotZoneAssignments);
memory.franchisePurchaseOrders ??= [];
memory.franchisePurchaseOrders = trackCollection("franchisePurchaseOrders", memory.franchisePurchaseOrders);
memory.stationStockLedgerEntries ??= [];
memory.stationStockLedgerEntries = trackCollection("stationStockLedgerEntries", memory.stationStockLedgerEntries);
memory.franchiseDepositLedgerEntries ??= [];
memory.franchiseDepositLedgerEntries = trackCollection("franchiseDepositLedgerEntries", memory.franchiseDepositLedgerEntries);
memory.franchiseDepositTopUps ??= [];
memory.franchiseDepositTopUps = trackCollection("franchiseDepositTopUps", memory.franchiseDepositTopUps);
memory.procurementDiscrepancies ??= [];
memory.procurementDiscrepancies = trackCollection("procurementDiscrepancies", memory.procurementDiscrepancies);
memory.procurementMarginEntries ??= [];
memory.procurementMarginEntries = trackCollection("procurementMarginEntries", memory.procurementMarginEntries);

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

/** Append a record to the append-only inventory ledger (Hard Rule #4 —
 *  every `product.stock` mutation must leave a ledger record). */
export function appendInventoryLedger(entry: Omit<InventoryLedgerEntry, "id" | "createdAt">) {
  const row: InventoryLedgerEntry = {
    id: makeServerId("inv", memory.inventoryLedgerEntries.length + 1),
    createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    ...entry,
  };
  memory.inventoryLedgerEntries.unshift(row);
  return row;
}

/**
 * P1-2 low-stock auto-replenish: called right after a redemption decrements
 * `product.stock` (mall route + marketplace/orders share this single point).
 * Creates a status:"draft" PO (needs `confirmDraftPO` in the mall office to
 * become "ordered") when:
 *  - the product has a supplierName, AND
 *  - stock ≤ (restockThreshold ?? 3), AND
 *  - no open PO (draft/ordered/confirmed/shipped) already covers this product.
 * qty = max(ceil(30-day redemptions × (deliveryCycleDays ?? 7) / 30), threshold × 2).
 */
export function maybeAutoReplenishDraft(productId: string, actor: string): PurchaseOrder | null {
  const product = memory.marketplaceProducts.find((item) => item.id === productId);
  if (!product?.supplierName) return null;
  const threshold = product.restockThreshold ?? 3;
  if (product.stock > threshold) return null;
  const OPEN_PO = new Set<PurchaseOrder["status"]>(["draft", "ordered", "confirmed", "shipped"]);
  if (memory.purchaseOrders.some((po) => OPEN_PO.has(po.status) && po.items.some((item) => item.productId === product.id))) return null;
  const since = Date.now() - 30 * 24 * 3600 * 1000;
  const recentRedemptions = memory.marketplaceOrders.filter(
    (order) => order.productId === product.id && order.status !== "cancelled" && new Date(order.createdAt.replace(" ", "T")).getTime() >= since,
  ).length;
  const cycleDays = product.deliveryCycleDays ?? 7;
  const qty = Math.max(Math.ceil((recentRedemptions * cycleDays) / 30), threshold * 2);
  const supplyPrice = product.supplyPrice ?? 0;
  const po: PurchaseOrder = {
    id: makeServerId("mpo", memory.purchaseOrders.length + 1),
    supplierName: product.supplierName,
    items: [{ productId: product.id, name: product.name, qty, supplyPrice }],
    totalCost: Math.round(qty * supplyPrice * 100) / 100,
    note: `auto-replenish: estoque ${product.stock} ≤ limiar ${threshold}`,
    status: "draft",
    createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    createdBy: "System",
  };
  memory.purchaseOrders.unshift(po);
  appendServerAudit({ actor, action: "MALL_PO_AUTODRAFT", entity: "PurchaseOrder", entityId: po.id, detail: `${product.name} (${product.supplierName}): estoque ${product.stock} ≤ ${threshold} → rascunho de ${qty} un.`, risk: "Low" });
  return po;
}

export function appendServerAudit(entry: Omit<ServerAuditEntry, "id" | "createdAt">) {
  const auditEntry: ServerAuditEntry = {
    // ⚠️ 不能用 memory.auditEntries.length —— 审计已从冷启动水合里排除
    // (persistence.ts: HYDRATION_EXCLUDED),内存长度只反映本实例,每次冷启动
    // 都会从 aud-1 重新数,upsert 时就会**覆盖数据库里的历史审计**。
    // 时间戳(36 进制)+ 随机后缀:单调递增、跨实例不撞、也不依赖任何计数。
    id: `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    ...entry,
  };

  memory.auditEntries.unshift(auditEntry);
  return auditEntry;
}
