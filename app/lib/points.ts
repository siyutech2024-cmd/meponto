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
  sourceType: "partner_service_benefit" | "marketplace_order" | "admin_adjustment" | "expiry";
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
export type PartnerServiceStatus = "pending" | "confirmed" | "rejected";

export type PartnerServiceRecord = {
  id: string;
  riderId: string;
  partnerId: string;
  category: PartnerServiceCategory;
  amount: number;
  riderTier: string;
  riderDiscountBrl: number;
  partnerPoints: number;
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
  pointsPerBrlReference: number;
  minimumDiscountTier: number;
  riderSameServiceDailyCap: number;
  partnerSameServiceDailyCap: number;
  newAccountPendingDays: number;
  partnerPointsPendingDays: number;
  dailyRedemptionCount: number;
  dailyRedemptionPoints: number;
  monthlyRedemptionPoints: number;
  expiryMonths: number;
};

export type RiderPerformanceMetricKey = "order_count" | "tsh" | "ar" | "caa_order";

export type RiderPerformancePointRule = {
  key: RiderPerformanceMetricKey;
  label: string;
  unit: string;
  pointsPerUnit: number;
  dailyCap: number;
  minimumEligibleValue: number;
  pendingDays: number;
  weight: number;
  riskGuard: string;
};

export type AcquisitionPointRuleKey = "rider_registration" | "rider_invites_rider" | "rider_invites_partner" | "partner_invites_partner" | "partner_quality_invite";

export type AcquisitionPointRule = {
  key: AcquisitionPointRuleKey;
  label: string;
  audience: PointsAccountType;
  points: number;
  trigger: string;
  pendingDays: number;
  monthlyCap: number;
  riskGuard: string;
};

export type PointsRuleSetVersion = {
  id: string;
  status: "active" | "scheduled" | "archived";
  effectiveFrom: string;
  effectiveTo?: string;
  owner: string;
  approval: string;
  changePolicy: string;
};

export type PendingReleaseRuleKey = "registration_welcome" | "performance_earn" | "partner_service" | "referral" | "manual_adjustment";

export type PendingReleaseRule = {
  key: PendingReleaseRuleKey;
  label: string;
  defaultPendingDays: number;
  autoRelease: boolean;
  reviewThresholdPoints: number;
  reviewerScope: string;
  rejectTriggers: string;
};

export type RedemptionLimitRule = {
  key: string;
  label: string;
  value: number;
  unit: string;
  scope: "rider" | "partner" | "account" | "order";
  riskGuard: string;
};

export const pointsRules: PointsRuleSummary = {
  pointsPerBrlReference: 10,
  minimumDiscountTier: 2,
  riderSameServiceDailyCap: 1,
  partnerSameServiceDailyCap: 80,
  newAccountPendingDays: 7,
  partnerPointsPendingDays: 3,
  dailyRedemptionCount: 3,
  dailyRedemptionPoints: 5000,
  monthlyRedemptionPoints: 20000,
  expiryMonths: 12,
};

export const pointsRuleSetVersions: PointsRuleSetVersion[] = [
  {
    id: "points-rules-v1-beta",
    status: "active",
    effectiveFrom: "2026-05-29",
    owner: "Product / Finance / Risk",
    approval: "Super Admin + Finance/Risk for high-impact changes",
    changePolicy: "New transactions use the active version; historical ledger rows must not be recalculated.",
  },
  {
    id: "points-rules-v1-next",
    status: "scheduled",
    effectiveFrom: "2026-06-15",
    owner: "Product / Finance / Risk",
    approval: "Requires audit reason and rollout note before activation",
    changePolicy: "Can be activated only after smoke checks and rule-diff review.",
  },
];

export const riderPerformancePointRules: RiderPerformancePointRule[] = [
  {
    key: "order_count",
    label: "Completed orders",
    unit: "order",
    pointsPerUnit: 2,
    dailyCap: 80,
    minimumEligibleValue: 1,
    pendingDays: 1,
    weight: 0.28,
    riskGuard: "Only completed and reconciled orders count; cancelled/refunded orders are excluded.",
  },
  {
    key: "tsh",
    label: "TSH online service hours",
    unit: "hour",
    pointsPerUnit: 8,
    dailyCap: 80,
    minimumEligibleValue: 4,
    pendingDays: 1,
    weight: 0.24,
    riskGuard: "Hours must be matched with platform online logs and Ponto shift windows.",
  },
  {
    key: "ar",
    label: "Acceptance rate",
    unit: "%",
    pointsPerUnit: 12,
    dailyCap: 60,
    minimumEligibleValue: 95,
    pendingDays: 1,
    weight: 0.28,
    riskGuard: "AR bonus starts at 95%; traceable safety refusals do not penalize the rider.",
  },
  {
    key: "caa_order",
    label: "CAA eligible orders",
    unit: "order",
    pointsPerUnit: 6,
    dailyCap: 90,
    minimumEligibleValue: 1,
    pendingDays: 2,
    weight: 0.2,
    riskGuard: "CAA orders require source-platform reconciliation and duplicate order protection.",
  },
];

export const acquisitionPointRules: AcquisitionPointRule[] = [
  {
    key: "rider_registration",
    label: "Rider registration welcome",
    audience: "rider",
    points: 20,
    trigger: "Rider completes member registration and passes duplicate identity/device checks.",
    pendingDays: 7,
    monthlyCap: 1,
    riskGuard: "One-time per CPF, phone, device, PIX/account, and member identity; suspicious registrations stay pending or rejected.",
  },
  {
    key: "rider_invites_rider",
    label: "Rider invites Rider",
    audience: "rider",
    points: 200,
    trigger: "Invited rider completes first valid activity period.",
    pendingDays: 7,
    monthlyCap: 10,
    riskGuard: "Registration alone does not release referral points; activity must reconcile with orders, TSH, and AR.",
  },
  {
    key: "rider_invites_partner",
    label: "Rider invites Partner",
    audience: "rider",
    points: 500,
    trigger: "Invited Partner is approved and completes first real service batch.",
    pendingDays: 14,
    monthlyCap: 3,
    riskGuard: "Partner must pass approval, map activation, receipt checks, and service-volume validation.",
  },
  {
    key: "partner_invites_partner",
    label: "Partner invites Partner",
    audience: "partner",
    points: 500,
    trigger: "Invited Partner is approved and completes first real service batch.",
    pendingDays: 14,
    monthlyCap: 5,
    riskGuard: "Same owner, address, CNPJ, phone, or device clusters require manual review.",
  },
  {
    key: "partner_quality_invite",
    label: "Partner quality invite bonus",
    audience: "partner",
    points: 1000,
    trigger: "Invited Partner reaches 30-day service and low-risk quality target.",
    pendingDays: 30,
    monthlyCap: 2,
    riskGuard: "Quality bonus is released only after sustained low-risk service and no duplicate receipt pattern.",
  },
];

export const pendingReleaseRules: PendingReleaseRule[] = [
  {
    key: "registration_welcome",
    label: "Registration welcome",
    defaultPendingDays: 7,
    autoRelease: true,
    reviewThresholdPoints: 20,
    reviewerScope: "points.review",
    rejectTriggers: "Duplicate CPF, phone, device, PIX/account, or suspicious registration cluster.",
  },
  {
    key: "performance_earn",
    label: "Performance earning",
    defaultPendingDays: 1,
    autoRelease: true,
    reviewThresholdPoints: 500,
    reviewerScope: "points.review",
    rejectTriggers: "Source-platform mismatch, cancelled orders, abnormal TSH, low-integrity AR, or duplicate CAA orders.",
  },
  {
    key: "partner_service",
    label: "Partner service benefit",
    defaultPendingDays: 3,
    autoRelease: true,
    reviewThresholdPoints: 300,
    reviewerScope: "partner.service.review",
    rejectTriggers: "Duplicate receipt, partner/rider repeated pattern, location mismatch, inactive partner, or high-risk partner.",
  },
  {
    key: "referral",
    label: "Referral activation",
    defaultPendingDays: 14,
    autoRelease: false,
    reviewThresholdPoints: 500,
    reviewerScope: "points.review",
    rejectTriggers: "Registration-only invite, same identity cluster, partner not activated, or invited rider without valid activity period.",
  },
  {
    key: "manual_adjustment",
    label: "Manual adjustment",
    defaultPendingDays: 0,
    autoRelease: false,
    reviewThresholdPoints: 1,
    reviewerScope: "points.adjust",
    rejectTriggers: "Missing reason, missing approver, or adjustment without linked operational evidence.",
  },
];

export const redemptionLimitRules: RedemptionLimitRule[] = [
  {
    key: "daily_redemption_count",
    label: "Daily redemption count",
    value: pointsRules.dailyRedemptionCount,
    unit: "orders/day",
    scope: "account",
    riskGuard: "Blocks repeated small redemptions used to drain points after account compromise.",
  },
  {
    key: "daily_redemption_points",
    label: "Daily redemption points",
    value: pointsRules.dailyRedemptionPoints,
    unit: "pts/day",
    scope: "account",
    riskGuard: "Keeps daily marketplace liability bounded.",
  },
  {
    key: "monthly_redemption_points",
    label: "Monthly redemption points",
    value: pointsRules.monthlyRedemptionPoints,
    unit: "pts/month",
    scope: "account",
    riskGuard: "Requires review for unusually high monthly redemption velocity.",
  },
  {
    key: "new_account_redemption_cap",
    label: "New account redemption cap",
    value: 2000,
    unit: "pts/first 7d",
    scope: "rider",
    riskGuard: "New accounts cannot immediately convert promotional or referral points into goods.",
  },
  {
    key: "high_value_item_review",
    label: "High-value item review",
    value: 8000,
    unit: "pts/order",
    scope: "order",
    riskGuard: "High-value marketplace orders require extra verification before fulfillment.",
  },
  {
    key: "product_monthly_limit",
    label: "Same product monthly limit",
    value: 1,
    unit: "item/month",
    scope: "account",
    riskGuard: "Prevents repeated redemptions of scarce products by the same account.",
  },
];

export const partnerServiceBenefitRules: Record<PartnerServiceCategory, { label: string; riderDiscountBrl: number; partnerPoints: number; riderCooldownDays: number; partnerDailyCap: number }> = {
  fuel: { label: "Fuel", riderDiscountBrl: 5, partnerPoints: 30, riderCooldownDays: 1, partnerDailyCap: 80 },
  phone_data: { label: "Phone/data", riderDiscountBrl: 5, partnerPoints: 30, riderCooldownDays: 1, partnerDailyCap: 50 },
  maintenance: { label: "Oil and maintenance", riderDiscountBrl: 20, partnerPoints: 100, riderCooldownDays: 7, partnerDailyCap: 20 },
  equipment: { label: "Safety equipment", riderDiscountBrl: 20, partnerPoints: 80, riderCooldownDays: 30, partnerDailyCap: 10 },
  vehicle_service: { label: "Vehicle service", riderDiscountBrl: 30, partnerPoints: 120, riderCooldownDays: 30, partnerDailyCap: 10 },
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
    points: 100,
    status: "approved",
    sourceType: "partner_service_benefit",
    sourceId: "psv-001",
    riderId: "r-1002",
    balanceAfter: 100,
    reasonCode: "PARTNER_SERVICE_BENEFIT",
    note: "Partner earned fixed points for verified maintenance benefit.",
    createdBy: "Partner",
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
    riderTier: "Diamond",
    riderDiscountBrl: 20,
    partnerPoints: 100,
    status: "confirmed",
    receiptRef: "NF-90881",
    createdAt: "2026-05-15 15:20",
    reviewReason: "Partner scanned rider member QR. Rider paid partner directly with member discount.",
  },
  {
    id: "psv-002",
    riderId: "r-1002",
    partnerId: "crm-002",
    category: "fuel",
    amount: 180,
    riderTier: "Diamond",
    riderDiscountBrl: 5,
    partnerPoints: 30,
    status: "pending",
    receiptRef: "FUEL-1129",
    createdAt: "2026-05-16 11:45",
    reviewReason: "Pending review before partner points become available.",
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
  if (input.existingServices.some((service) => service.receiptRef === input.receiptRef)) return "DUPLICATE_RECEIPT";

  const today = new Date().toISOString().slice(0, 10);
  const rule = partnerServiceBenefitRules[input.category];
  const todaySameRiderService = input.existingServices.filter(
    (service) => service.riderId === input.riderId && service.category === input.category && service.createdAt.startsWith(today),
  );
  if (todaySameRiderService.length >= pointsRules.riderSameServiceDailyCap) return "RIDER_SERVICE_DAILY_LIMIT";

  const todaySamePartnerService = input.existingServices.filter(
    (service) => service.partnerId === input.partnerId && service.category === input.category && service.createdAt.startsWith(today),
  );
  if (todaySamePartnerService.length >= rule.partnerDailyCap) return "PARTNER_SERVICE_DAILY_LIMIT";

  return null;
}
