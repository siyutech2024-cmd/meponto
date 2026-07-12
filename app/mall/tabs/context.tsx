"use client";

import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { MarketplaceOrder, MarketplaceProduct } from "../../lib/points";
import type { MallConfig } from "../../lib/mall";
import type { CashLedgerEntry, CashTopUp, MallBanner, MallCategory, MallCoupon, MallPayment, PriceChangeRequest, PurchaseOrder, SupplierStatement } from "../../lib/mall-ops";
import type { TranslationKey } from "../../lib/i18n";
import { StatusBadge, type BadgeTone } from "../kit";

/**
 * PontoMall back-office shared contract between the page shell (data loading,
 * navigation) and the per-tab workspaces under app/mall/tabs/.
 */

// ---------------------------------------------------------------------------
// Payload types (shape of GET /api/mall, /api/mall/ops, /api/mall/procurement)
// ---------------------------------------------------------------------------

export type MallPayload = {
  config: MallConfig;
  pixKey?: string;
  products: MarketplaceProduct[];
  orders: MarketplaceOrder[];
  supplierSettlement?: Array<{ supplier: string; qty: number; payable: number }>;
};

export type OpsSummary = {
  orders: number;
  pointsGmv: number;
  cashGmv: number;
  pendingPayments: number;
  reviewPending?: number;
  partnerOrders?: number;
  partnerPointsSpent?: number;
  topProducts?: Array<{ name: string; count: number }>;
  daily: Array<{ date: string; count: number }>;
  aging?: { pricingOver48h: number; priceChangesOver48h: number; topUpsOver48h: number };
};

export type OpsPayload = {
  categories: MallCategory[];
  banners: MallBanner[];
  coupons?: MallCoupon[];
  priceChanges: PriceChangeRequest[];
  purchaseOrders: PurchaseOrder[];
  statements: SupplierStatement[];
  payments: MallPayment[];
  topUps: CashTopUp[];
  cashLedger: CashLedgerEntry[];
  summary: OpsSummary;
};

/** HQ view of GET /api/mall/procurement (only the fields this page consumes). */
export type ProcureProduct = {
  id: string;
  name: string;
  supplierName?: string;
  procurementMode: "off" | "consignment" | "buyout" | "both";
  franchiseBuyoutPrice: number;
  minOrderQty: number;
  maxOrderQty: number;
  procurementConsent: "none" | "pending" | "approved";
  suggestedBuyoutPrice: number;
};
export type ProcurePayload = {
  config?: { procurementEnabled?: boolean };
  products?: ProcureProduct[];
  /** FPO headers — enough for the overview "直采待审批" todo card. */
  fpos?: Array<{ id: string; status: string }>;
};

// ---------------------------------------------------------------------------
// Labels / status tone mapping (shared across tabs)
// ---------------------------------------------------------------------------

/** Local fallbacks while the ops backend rolls out "disputed"/"draft" states. */
export const extraStatementLabel: Record<string, string> = { disputed: "有异议" };
export const extraPoLabel: Record<string, string> = { draft: "草稿·待确认" };

export const orderStatusLabel: Record<string, string> = { created: "在途", arrived: "已到站", fulfilled: "已交付", cancelled: "已取消" };
export const productStatusLabel: Record<string, string> = { active: "已上架", paused: "已下架", pending_pricing: "待定价" };
export const paymentStatusChip: Record<string, string> = { pending: "待付款", submitted: "凭证待核", paid: "已收款" };

export const PROCUREMENT_MODE_LABEL: Record<ProcureProduct["procurementMode"], string> = { off: "不开放", consignment: "代销", buyout: "买断", both: "代销+买断" };

/**
 * Unified status→tone mapping (products / orders / supply tabs):
 * green = active / paid / final-good, amber = waiting for someone,
 * red = dispute / rejected, grey = paused / cancelled / terminal.
 */
export const STATUS_TONES: Record<string, BadgeTone> = {
  active: "success", paid: "success", fulfilled: "success", approved: "success", received: "success",
  pending: "warn", pending_pricing: "warn", submitted: "warn", draft: "warn", created: "warn", arrived: "warn", ordered: "warn", confirmed: "warn", shipped: "warn",
  disputed: "danger", rejected: "danger",
};

export function statusBadge(status: string, label?: string) {
  return <StatusBadge tone={STATUS_TONES[status] ?? "neutral"} label={label ?? status} />;
}

// ---------------------------------------------------------------------------
// Domain helpers
// ---------------------------------------------------------------------------

/** Gross margin at the pointsPerBrl reference rate — same math the pricing drawer shows live. */
export function productMargin(product: MarketplaceProduct, rate: number, draft?: { points: number; cash: number; share: number }) {
  const points = draft ? draft.points : product.pointsPrice || 0;
  const cash = draft ? draft.cash : product.cashPriceBRL ?? 0;
  const share = draft ? draft.share : product.franchiseShareBRL ?? 0;
  const pointsAsBrl = rate > 0 ? points / rate : 0;
  const revenue = pointsAsBrl + cash;
  const cost = (product.supplyPrice ?? 0) + share;
  const margin = revenue - cost;
  return { pointsAsBrl, revenue, cost, margin, pct: revenue > 0 ? (margin / revenue) * 100 : 0 };
}

/** Low-stock line: at/below the product's restock threshold (default 3). */
export const isLowStock = (product: MarketplaceProduct) => product.stock <= (product.restockThreshold ?? 3);

// ---------------------------------------------------------------------------
// Navigation contract
// ---------------------------------------------------------------------------

export type TabId = "overview" | "products" | "merch" | "suppliers" | "points" | "orders" | "payments" | "supply" | "procurement" | "insights" | "members" | "settings";

/** One-shot pre-filter carried by navigate(tab, preset); target tab consumes and clears it. */
export type TabPreset = "pending_pricing" | "lowstock" | "consent" | "review" | null;

export type MallMessage = { tone: "ok" | "err"; text: string } | null;

export type ApiPath = "/api/mall" | "/api/mall/ops" | "/api/mall/procurement";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type MallAdminContextValue = {
  // Raw payloads + setters (setters power optimistic rollbacks in tabs).
  mall: MallPayload | null;
  ops: OpsPayload | null;
  procure: ProcurePayload | null;
  setMall: Dispatch<SetStateAction<MallPayload | null>>;
  setOps: Dispatch<SetStateAction<OpsPayload | null>>;

  /** True while the shell's first load() is still in flight (false once the
   *  initial payloads land). Tabs use it (together with "no data yet") to show
   *  "…" stats + Skeleton bars instead of the fake-broken zeros/empty tables. */
  loading: boolean;

  // Messaging + data plumbing.
  message: MallMessage;
  setMessage: (message: MallMessage) => void;
  load: () => Promise<void>;
  post: (path: ApiPath, body: Record<string, unknown>, okText?: string) => Promise<unknown>;
  optimisticPost: (path: Exclude<ApiPath, "/api/mall/procurement">, body: Record<string, unknown>, okText: string, apply: () => void, rollback: () => void) => Promise<unknown>;
  patchOrder: (orderId: string, patch: Partial<MarketplaceOrder>) => void;
  patchTopUp: (topUpId: string, patch: Partial<CashTopUp>) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number | undefined>) => string;

  // Navigation (URL-addressable ?tab=) + one-shot presets.
  tab: TabId;
  navigate: (tab: TabId, preset?: TabPreset) => void;
  preset: TabPreset;
  clearPreset: () => void;

  // Shared derived data (also feeds the sidebar badges).
  products: MarketplaceProduct[];
  suppliers: string[];
  pointsPerBrlRate: number;
  pendingPricing: number;
  lowStock: number;
  priceChangePending: number;
  payablePending: number;
  consentPendingIds: Set<string>;
  procurementReady: boolean;
};

export const MallAdminContext = createContext<MallAdminContextValue | null>(null);

export function useMallAdmin(): MallAdminContextValue {
  const value = useContext(MallAdminContext);
  if (!value) throw new Error("useMallAdmin must be used inside MallAdminContext.Provider");
  return value;
}
