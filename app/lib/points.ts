import type { CrmPartnerRisk, CrmPartnerStatus } from "./crm";

export type PointsLedgerType = "earn" | "spend" | "refund" | "expire" | "reverse" | "adjust" | "hold" | "release";
export type PointsLedgerStatus = "pending" | "approved" | "rejected" | "reversed";
export type PointsSourceType = "delivery" | "mission" | "partner_service" | "marketplace_order" | "admin_adjustment" | "expiry";
export type PointsAccountType = "rider" | "partner";

export type PointsLedgerEntry = {
  id: string;
  riderId: string;
  accountId: string;
  type: PointsLedgerType;
  points: number;
  status: PointsLedgerStatus;
  sourceType: PointsSourceType;
  sourceId: string;
  partnerId?: string;
  marketplaceOrderId?: string;
  campaignId?: string;
  expiresAt?: string;
  balanceAfter: number;
  reasonCode: string;
  note: string;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
};

export type PartnerPointsLedgerEntry = {
  id: string;
  partnerId: string;
  accountId: string;
  type: PointsLedgerType;
  points: number;
  status: PointsLedgerStatus;
  sourceType: "rider_service_payment" | "marketplace_order" | "admin_adjustment" | "expiry";
  sourceId: string;
  riderId?: string;
  marketplaceOrderId?: string;
  balanceAfter: number;
  reasonCode: string;
  note: string;
  createdBy: string;
  createdAt: string;
};

export type PartnerServiceCategory = "fuel" | "maintenance" | "phone_data" | "equipment" | "vehicle_service";
export type PartnerServiceStatus = "pending" | "paid" | "rejected";

export type PartnerServiceRecord = {
  id: string;
  riderId: string;
  partnerId: string;
  category: PartnerServiceCategory;
  amount: number;
  pointsCharged: number;
  pointsPaid: number;
  status: PartnerServiceStatus;
  receiptRef: string;
  createdAt: string;
  reviewReason?: string;
};

export type MarketplaceProductType = "equipment" | "fuel_coupon" | "maintenance_coupon" | "phone_data" | "safety_item" | "partner_voucher";
export type MarketplaceProductStatus = "active" | "paused";

export type MarketplaceProduct = {
  id: string;
  name: string;
  type: MarketplaceProductType;
  pointsPrice: number;
  stock: number;
  city: string;
  status: MarketplaceProductStatus;
  audience: PointsAccountType | "both";
  partnerId?: string;
  supplierId?: string;
};

export type MarketplaceOrderStatus = "created" | "fulfilled" | "cancelled";

export type MarketplaceOrder = {
  id: string;
  accountType: PointsAccountType;
  riderId?: string;
  partnerId?: string;
  productId: string;
  pointsSpent: number;
  status: MarketplaceOrderStatus;
  createdAt: string;
};

export type PointsRuleSummary = {
  transactionPartnerCap: number;
  riderPartnerDailyCap: number;
  riderAllPartnersDailyCap: number;
  riderPartnerMonthlyCap: number;
  dailyRedemptionCount: number;
  dailyRedemptionPoints: number;
  monthlyRedemptionPoints: number;
  expiryMonths: number;
};

export const pointsRules: PointsRuleSummary = {
  transactionPartnerCap: 300,
  riderPartnerDailyCap: 500,
  riderAllPartnersDailyCap: 800,
  riderPartnerMonthlyCap: 6000,
  dailyRedemptionCount: 3,
  dailyRedemptionPoints: 5000,
  monthlyRedemptionPoints: 20000,
  expiryMonths: 12,
};

export const pointsLedgerEntries: PointsLedgerEntry[] = [
  {
    id: "pts-001",
    riderId: "r-1002",
    accountId: "pts-r-1002",
    type: "earn",
    points: 2200,
    status: "approved",
    sourceType: "mission",
    sourceId: "mission-night-coverage-may",
    expiresAt: "2027-05-14",
    balanceAfter: 2200,
    reasonCode: "MISSION_WEEKLY_RELIABILITY",
    note: "Weekly reliability and night coverage missions.",
    createdBy: "System",
    createdAt: "2026-05-14 10:00",
    approvedBy: "System",
    approvedAt: "2026-05-14 10:00",
  },
  {
    id: "pts-002",
    riderId: "r-1002",
    accountId: "pts-r-1002",
    type: "earn",
    points: 640,
    status: "approved",
    sourceType: "mission",
    sourceId: "mission-service-network-bonus",
    expiresAt: "2027-05-15",
    balanceAfter: 2840,
    reasonCode: "SERVICE_NETWORK_BONUS",
    note: "Platform bonus for using approved offline service network.",
    createdBy: "System",
    createdAt: "2026-05-15 15:20",
    approvedBy: "System",
    approvedAt: "2026-05-15 16:00",
  },
  {
    id: "pts-003",
    riderId: "r-1002",
    accountId: "pts-r-1002",
    type: "earn",
    points: 180,
    status: "pending",
    sourceType: "mission",
    sourceId: "mission-safety-review",
    expiresAt: "2027-05-16",
    balanceAfter: 2840,
    reasonCode: "MISSION_REVIEW",
    note: "Pending mission review.",
    createdBy: "System",
    createdAt: "2026-05-16 11:45",
  },
];

export const partnerPointsLedgerEntries: PartnerPointsLedgerEntry[] = [
  {
    id: "ppts-001",
    partnerId: "crm-001",
    accountId: "ppts-crm-001",
    type: "earn",
    points: 300,
    status: "approved",
    sourceType: "rider_service_payment",
    sourceId: "psv-001",
    riderId: "r-1002",
    balanceAfter: 300,
    reasonCode: "RIDER_SERVICE_PAYMENT",
    note: "Rider paid points for maintenance service.",
    createdBy: "Rider",
    createdAt: "2026-05-15 15:20",
  },
];

export const partnerServiceRecords: PartnerServiceRecord[] = [
  {
    id: "psv-001",
    riderId: "r-1002",
    partnerId: "crm-001",
    category: "maintenance",
    amount: 640,
    pointsCharged: 300,
    pointsPaid: 300,
    status: "paid",
    receiptRef: "NF-90881",
    createdAt: "2026-05-15 15:20",
    reviewReason: "Rider paid by QR. Transaction cap applied.",
  },
  {
    id: "psv-002",
    riderId: "r-1002",
    partnerId: "crm-002",
    category: "fuel",
    amount: 180,
    pointsCharged: 180,
    pointsPaid: 0,
    status: "pending",
    receiptRef: "FUEL-1129",
    createdAt: "2026-05-16 11:45",
    reviewReason: "Awaiting rider QR confirmation.",
  },
];

export const marketplaceProducts: MarketplaceProduct[] = [
  { id: "mkt-001", name: "Helmet discount coupon", type: "safety_item", pointsPrice: 1600, stock: 24, city: "Sao Paulo", status: "active", audience: "rider", supplierId: "crm-003" },
  { id: "mkt-002", name: "Fuel partner voucher", type: "fuel_coupon", pointsPrice: 900, stock: 80, city: "Sao Paulo", status: "active", audience: "rider", partnerId: "crm-002" },
  { id: "mkt-003", name: "Oil change voucher", type: "maintenance_coupon", pointsPrice: 1200, stock: 18, city: "Sao Paulo", status: "active", audience: "rider", partnerId: "crm-001" },
  { id: "mkt-004", name: "Partner supply credit", type: "partner_voucher", pointsPrice: 300, stock: 40, city: "Sao Paulo", status: "active", audience: "partner", supplierId: "crm-003" },
];

export const marketplaceOrders: MarketplaceOrder[] = [];

export function getAvailablePoints(entries: PointsLedgerEntry[], riderId: string) {
  return entries.reduce((balance, entry) => {
    if (entry.riderId !== riderId || entry.status !== "approved") return balance;
    if (entry.type === "earn" || entry.type === "refund" || entry.type === "release" || entry.type === "adjust") return balance + entry.points;
    if (entry.type === "spend" || entry.type === "expire" || entry.type === "reverse" || entry.type === "hold") return balance - entry.points;
    return balance;
  }, 0);
}

export function getPendingPoints(entries: PointsLedgerEntry[], riderId: string) {
  return entries
    .filter((entry) => entry.riderId === riderId && entry.status === "pending" && entry.type === "earn")
    .reduce((sum, entry) => sum + entry.points, 0);
}

export function getPointsAccount(entries: PointsLedgerEntry[], riderId: string) {
  return {
    riderId,
    accountId: `pts-${riderId}`,
    available: getAvailablePoints(entries, riderId),
    pending: getPendingPoints(entries, riderId),
    expiringSoon: entries
      .filter((entry) => entry.riderId === riderId && entry.status === "approved" && entry.expiresAt)
      .slice(0, 3),
  };
}

export function getAvailablePartnerPoints(entries: PartnerPointsLedgerEntry[], partnerId: string) {
  return entries.reduce((balance, entry) => {
    if (entry.partnerId !== partnerId || entry.status !== "approved") return balance;
    if (entry.type === "earn" || entry.type === "refund" || entry.type === "release" || entry.type === "adjust") return balance + entry.points;
    if (entry.type === "spend" || entry.type === "expire" || entry.type === "reverse" || entry.type === "hold") return balance - entry.points;
    return balance;
  }, 0);
}

export function getPartnerPointsAccount(entries: PartnerPointsLedgerEntry[], partnerId: string) {
  return {
    partnerId,
    accountId: `ppts-${partnerId}`,
    available: getAvailablePartnerPoints(entries, partnerId),
  };
}

export function shouldHoldPartnerService(input: {
  amount: number;
  receiptRef: string;
  partnerRisk?: CrmPartnerRisk;
  partnerStatus?: CrmPartnerStatus;
  existingServices: PartnerServiceRecord[];
  riderId: string;
  partnerId: string;
  category: PartnerServiceCategory;
}) {
  if (input.partnerStatus !== "Active") return "PARTNER_NOT_ACTIVE";
  if (input.partnerRisk === "High") return "PARTNER_HIGH_RISK";
  if (input.amount > pointsRules.transactionPartnerCap) return "TRANSACTION_CAP_REVIEW";
  if (input.existingServices.some((service) => service.receiptRef === input.receiptRef)) return "DUPLICATE_RECEIPT";

  const today = new Date().toISOString().slice(0, 10);
  const todaysSamePartner = input.existingServices.filter(
    (service) => service.riderId === input.riderId && service.partnerId === input.partnerId && service.createdAt.startsWith(today),
  );
  if (todaysSamePartner.length >= 3) return "RIDER_PARTNER_FREQUENCY_REVIEW";

  return null;
}
