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
