/**
 * PontoMall operations domain — the independent mall back office and the
 * supplier supply-chain system share these records:
 *
 * - Catalog merchandising: categories + storefront banners.
 * - Supplier price-change requests (with decision history = price history).
 * - Purchase orders (replenishment): admin orders → supplier confirms/ships →
 *   admin receives → stock increases.
 * - Monthly supplier statements: generated from fulfilled redemptions ×
 *   supply price, confirmed by the supplier, then paid by the mall office.
 * - Hybrid payments: points + PIX cash difference, manually reconciled by
 *   the mall office until a PSP (Mercado Pago) is integrated.
 */

export type MallCategory = {
  id: string;
  name: string;
  sort: number;
  active: boolean;
};

export type MallBanner = {
  id: string;
  title: string;
  imageUrl: string;
  href?: string;
  sort: number;
  active: boolean;
};

/**
 * Storefront coupon: a points discount applied automatically at redeem time
 * to the best-eligible coupon for the rider.
 *  - points_off: flat points discount (e.g. -100 pts).
 *  - percent_off: percentage discount on the (tier-discounted) points price.
 * Eligibility: rider tier ≥ minTier, points price ≥ minPoints (满减门槛),
 * active, not expired, and within the per-rider usage limit.
 */
export type MallCouponType = "points_off" | "percent_off";

export type MallCoupon = {
  id: string;
  title: string;
  type: MallCouponType;
  /** points_off → flat points; percent_off → 1..100. */
  value: number;
  /** Minimum (tier-discounted) points price for the coupon to apply (0 = none). */
  minPoints: number;
  /** Eligibility gate by membership tier. */
  minTier: "member" | "bronze" | "prata" | "ouro" | "diamante";
  /** Max uses per rider (0 = unlimited). */
  perRiderLimit: number;
  active: boolean;
  /** ISO date (YYYY-MM-DD); undefined = no expiry. */
  expiresAt?: string;
  createdAt: string;
  createdBy: string;
};

export type PriceChangeStatus = "pending" | "approved" | "rejected";

export type PriceChangeRequest = {
  id: string;
  productId: string;
  productName: string;
  supplierName: string;
  oldPrice: number;
  newPrice: number;
  note?: string;
  status: PriceChangeStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionNote?: string;
};

export type PurchaseOrderStatus = "ordered" | "confirmed" | "shipped" | "received" | "cancelled";

export type PurchaseOrderItem = {
  productId: string;
  name: string;
  qty: number;
  supplyPrice: number;
};

export type PurchaseOrder = {
  id: string;
  supplierName: string;
  items: PurchaseOrderItem[];
  totalCost: number;
  note?: string;
  status: PurchaseOrderStatus;
  createdAt: string;
  createdBy: string;
  confirmedAt?: string;
  shippedAt?: string;
  /** Supplier-provided tracking / shipment note. */
  shipNote?: string;
  receivedAt?: string;
  receivedBy?: string;
};

export type StatementStatus = "draft" | "confirmed" | "paid";

export type SupplierStatementLine = {
  orderId: string;
  productId: string;
  productName: string;
  supplyPrice: number;
  date: string;
};

export type SupplierStatement = {
  id: string;
  supplierName: string;
  /** Natural month, e.g. "2026-05". */
  month: string;
  lines: SupplierStatementLine[];
  total: number;
  status: StatementStatus;
  createdAt: string;
  /** Supplier confirmation. */
  confirmedAt?: string;
  /** Mall office payment. */
  paidAt?: string;
  paidBy?: string;
  /** PIX key the supplier wants to receive on (snapshot at confirmation). */
  pixKey?: string;
  receiptNote?: string;
};

export type MallPaymentStatus = "pending" | "submitted" | "confirmed" | "rejected";

export type MallPayment = {
  id: string;
  orderId: string;
  riderId: string;
  riderName: string;
  productName: string;
  amountBRL: number;
  /** Company PIX key shown to the rider (from mall config). */
  pixKey: string;
  /** Rider-submitted transfer reference / receipt code. */
  reference?: string;
  status: MallPaymentStatus;
  createdAt: string;
  submittedAt?: string;
  decidedAt?: string;
  decidedBy?: string;
  note?: string;
};

export const poStatusLabel: Record<PurchaseOrderStatus, string> = {
  ordered: "已下单",
  confirmed: "供应商已确认",
  shipped: "已发货",
  received: "已入库",
  cancelled: "已取消",
};

export const statementStatusLabel: Record<StatementStatus, string> = {
  draft: "待供应商确认",
  confirmed: "待付款",
  paid: "已付款",
};

export const paymentStatusLabel: Record<MallPaymentStatus, string> = {
  pending: "待骑手转账",
  submitted: "待核销",
  confirmed: "已核销",
  rejected: "已驳回",
};

export type CashTopUpStatus = "pending" | "submitted" | "confirmed" | "rejected";

/** Rider-initiated PIX top-up into the mall cash balance (manual review). */
export type CashTopUp = {
  id: string;
  riderId: string;
  riderName: string;
  amountBRL: number;
  /** Company PIX key shown to the rider (snapshot from mall config). */
  pixKey: string;
  /** Rider-submitted transfer reference / receipt code. */
  reference?: string;
  status: CashTopUpStatus;
  createdAt: string;
  submittedAt?: string;
  decidedAt?: string;
  decidedBy?: string;
  note?: string;
};

/** Immutable cash-balance ledger — every credit/debit keeps a record. */
export type CashLedgerEntry = {
  id: string;
  riderId: string;
  riderName: string;
  type: "topup" | "spend" | "refund" | "adjust";
  amountBRL: number;
  /** Source record: top-up id / order id / manual note. */
  sourceId: string;
  balanceAfter: number;
  note?: string;
  createdBy: string;
  createdAt: string;
};

export const topUpStatusLabel: Record<CashTopUpStatus, string> = {
  pending: "待转账",
  submitted: "待核销",
  confirmed: "已入账",
  rejected: "已驳回",
};

/**
 * Two-level sales revenue share, accrued once per FULFILLED mall order:
 *  - franchiseShareBRL: fixed R$ to the pickup store's franchise (HQ sets per product).
 *  - stationShareBRL:   fixed R$ the franchise passes to the pickup station.
 *  - franchiseNetBRL = franchiseShareBRL − stationShareBRL.
 * Append-only; settled via monthly RevenueShareStatement.
 */
export type RevenueShareEntry = {
  id: string; // rev-<orderId>
  orderId: string;
  productId: string;
  productName: string;
  pickupStoreId: string;
  pickupStoreName: string;
  franchise: string;
  franchiseShareBRL: number;
  stationShareBRL: number;
  franchiseNetBRL: number;
  /** Natural month of the order, e.g. "2026-06". */
  month: string;
  status: "accrued" | "settled";
  createdAt: string;
};

export type RevenueShareStatement = {
  id: string; // rst-<month>-<franchise>
  franchise: string;
  month: string;
  /** Per-station breakdown for the franchise. */
  stations: Array<{ store: string; orders: number; stationShareBRL: number }>;
  orders: number;
  franchiseNetTotal: number;
  stationShareTotal: number;
  total: number; // franchiseNetTotal + stationShareTotal = Σ franchiseShareBRL
  status: StatementStatus;
  createdAt: string;
  confirmedAt?: string;
  paidAt?: string;
  paidBy?: string;
  note?: string;
};

export const revShareStatementStatusLabel: Record<StatementStatus, string> = {
  draft: "待加盟商确认",
  confirmed: "待付款",
  paid: "已付款",
};

/** In-app message (站内信) delivered to a member/rider — shown in the storefront
 *  and rider app inbox. Used for arrival notices etc. (no SMS/WhatsApp). */
export type MemberMessage = {
  id: string;
  /** Recipient member/rider (by name, matching the storefront identity). */
  riderName: string;
  riderId?: string;
  title: string;
  body: string;
  href?: string;
  createdAt: string;
  readAt?: string;
};
