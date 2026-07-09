"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, BarChart3, Boxes, CheckCircle2, CircleDollarSign, LayoutGrid, Package, RefreshCcw, Settings2, ShoppingBag, Truck, X, XCircle } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import { useDialog } from "../components/dialog";
import { downloadCsv } from "../lib/csv";
import type { MarketplaceOrder, MarketplaceProduct } from "../lib/points";
import type { MallConfig } from "../lib/mall";
import type { CashLedgerEntry, CashTopUp, MallBanner, MallCategory, MallCoupon, MallPayment, PriceChangeRequest, PurchaseOrder, SupplierStatement } from "../lib/mall-ops";
import { paymentStatusLabel, poStatusLabel, statementStatusLabel, topUpStatusLabel } from "../lib/mall-ops";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";
import ProcurementTab from "./procurement-tab";

/**
 * PontoMall back office (mall.meponto.com/admin → /mall) — the independent
 * mall workspace: merchandising, pricing, fulfilment, PIX reconciliation and
 * the supplier supply-chain (price changes / POs / statements).
 */

type MallPayload = {
  config: MallConfig;
  pixKey?: string;
  products: MarketplaceProduct[];
  orders: MarketplaceOrder[];
  supplierSettlement?: Array<{ supplier: string; qty: number; payable: number }>;
};

type OpsPayload = {
  categories: MallCategory[];
  banners: MallBanner[];
  coupons?: MallCoupon[];
  priceChanges: PriceChangeRequest[];
  purchaseOrders: PurchaseOrder[];
  statements: SupplierStatement[];
  payments: MallPayment[];
  topUps: CashTopUp[];
  cashLedger: CashLedgerEntry[];
  summary: { orders: number; pointsGmv: number; cashGmv: number; pendingPayments: number; reviewPending?: number; partnerOrders?: number; partnerPointsSpent?: number; topProducts?: Array<{ name: string; count: number }>; daily: Array<{ date: string; count: number }>; aging?: { pricingOver48h: number; priceChangesOver48h: number; topUpsOver48h: number } };
};

/** Local fallbacks while the ops backend rolls out "disputed"/"draft" states. */
const extraStatementLabel: Record<string, string> = { disputed: "有异议" };
const extraPoLabel: Record<string, string> = { draft: "草稿·待确认" };

const orderStatusLabel: Record<string, string> = { created: "在途", arrived: "已到站", fulfilled: "已交付", cancelled: "已取消" };
const productStatusLabel: Record<string, string> = { active: "已上架", paused: "已下架", pending_pricing: "待定价" };
const paymentStatusChip: Record<string, string> = { pending: "待付款", submitted: "凭证待核", paid: "已收款" };

/**
 * Unified four-tone status badge (products / orders / supply tabs):
 * green = active / paid / final-good, amber = waiting for someone,
 * red = dispute / rejected, grey = paused / cancelled / terminal.
 */
const BADGE_TONE_CLASS = {
  success: "border-[var(--success)]/40 bg-[var(--success)]/10 text-[var(--success)]",
  warn: "border-[var(--warn)]/40 bg-[var(--warn)]/10 text-[var(--warn)]",
  danger: "border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)]",
  muted: "border-[var(--line)] bg-[var(--surface-raised)] text-[var(--muted)]",
} as const;
const STATUS_TONES: Record<string, keyof typeof BADGE_TONE_CLASS> = {
  active: "success", paid: "success", fulfilled: "success", approved: "success", received: "success",
  pending: "warn", pending_pricing: "warn", submitted: "warn", draft: "warn", created: "warn", arrived: "warn", ordered: "warn", confirmed: "warn", shipped: "warn",
  disputed: "danger", rejected: "danger",
};
function statusBadge(status: string, label?: string) {
  const tone = STATUS_TONES[status] ?? "muted";
  return <span className={`inline-flex whitespace-nowrap rounded-[6px] border px-2 py-0.5 text-[11px] font-bold ${BADGE_TONE_CLASS[tone]}`}>{label ?? status}</span>;
}

/** Gross margin at the pointsPerBrl reference rate — same math the pricing drawer shows live. */
function productMargin(product: MarketplaceProduct, rate: number, draft?: { points: number; cash: number; share: number }) {
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
const isLowStock = (product: MarketplaceProduct) => product.stock <= (product.restockThreshold ?? 3);

/** HQ view of GET /api/mall/procurement (only the fields this page consumes). */
type ProcureProduct = {
  id: string;
  name: string;
  procurementMode: "off" | "consignment" | "buyout" | "both";
  franchiseBuyoutPrice: number;
  minOrderQty: number;
  maxOrderQty: number;
  procurementConsent: "none" | "pending" | "approved";
  suggestedBuyoutPrice: number;
};
type ProcurePayload = { config?: { procurementEnabled?: boolean }; products?: ProcureProduct[] };

const PROCUREMENT_MODE_LABEL: Record<ProcureProduct["procurementMode"], string> = { off: "不开放", consignment: "代销", buyout: "买断", both: "代销+买断" };

const PRODUCT_PAGE_SIZE = 20;
const ORDER_PAGE_SIZE = 50;

const TABS = [
  { id: "overview", label: "总览", icon: BarChart3 },
  { id: "products", label: "商品与定价", icon: ShoppingBag },
  { id: "merch", label: "分类与Banner", icon: LayoutGrid },
  { id: "orders", label: "订单履约", icon: Package },
  { id: "payments", label: "充值与收款", icon: Banknote },
  { id: "supply", label: "供应链", icon: Truck },
  { id: "procurement", label: "加盟商订货", icon: Boxes },
  { id: "settings", label: "设置", icon: Settings2 },
] as const;


function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (page: number) => void }) {
  return (
    <div className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="h-8 rounded-[8px] border border-[var(--line)] px-3 disabled:opacity-40">上一页</button>
      <span>第 {page} / {pages} 页 · 共 {total} 条</span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="h-8 rounded-[8px] border border-[var(--line)] px-3 disabled:opacity-40">下一页</button>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel p-4">
      <div className="text-[11px] font-bold uppercase text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] font-bold text-[var(--muted)]">{hint}</div>}
    </div>
  );
}

export default function MallAdminPage() {
  const dialog = useDialog();
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
  const headers = useMemo(() => ({ "Content-Type": "application/json" }), []);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("overview");
  const [mall, setMall] = useState<MallPayload | null>(null);
  const [ops, setOps] = useState<OpsPayload | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [procure, setProcure] = useState<ProcurePayload | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [productSort, setProductSort] = useState<{ key: "name" | "stock" | "points" | "margin"; dir: 1 | -1 } | null>(null);
  const [productQuickFilter, setProductQuickFilter] = useState<"" | "consent" | "lowstock">("");
  const [drawerId, setDrawerId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [bannerDraft, setBannerDraft] = useState({ title: "", imageUrl: "", href: "" });
  const [couponDraft, setCouponDraft] = useState({ title: "", type: "points_off", value: "", minPoints: "", minTier: "member", perRiderLimit: "", expiresAt: "" });
  const [orderFilter, setOrderFilter] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productStatusFilter, setProductStatusFilter] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");
  const [orderPage, setOrderPage] = useState(1);
  const [poSupplier, setPoSupplier] = useState("");
  const [poItems, setPoItems] = useState<Record<string, string>>({});
  const [statementMonth, setStatementMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  });
  const [configDraft, setConfigDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [mallRes, opsRes, procRes] = await Promise.all([
      fetch("/api/mall", { headers, cache: "no-store" }),
      fetch("/api/mall/ops", { headers, cache: "no-store" }),
      // Procurement is optional context (feature-flagged): 403/flag-off simply hides the drawer section.
      fetch("/api/mall/procurement", { headers, cache: "no-store" }).catch(() => null),
    ]);
    if (mallRes.ok) setMall((await mallRes.json()).data);
    if (opsRes.ok) setOps((await opsRes.json()).data);
    if (procRes?.ok) setProcure((await procRes.json()).data as ProcurePayload);
    else setProcure(null);
  }, [headers]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4500);
    return () => clearTimeout(timer);
  }, [message]);

  async function post(path: "/api/mall" | "/api/mall/ops" | "/api/mall/procurement", body: Record<string, unknown>, okText?: string) {
    const response = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? t("dynReqFail", { s: response.status }) });
      return null;
    }
    if (okText) setMessage({ tone: "ok", text: okText });
    void load();
    return payload.data;
  }

  /**
   * Optimistic mutation for high-frequency ops actions: patch the local
   * record first, roll back on failure, and re-run a silent load() on
   * success so the server stays the source of truth.
   */
  async function optimisticPost(path: "/api/mall" | "/api/mall/ops", body: Record<string, unknown>, okText: string, apply: () => void, rollback: () => void) {
    apply();
    const response = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      rollback();
      setMessage({ tone: "err", text: payload.error ?? t("dynReqFail", { s: response.status }) });
      return null;
    }
    setMessage({ tone: "ok", text: okText });
    void load(); // silent recalibration
    return payload.data;
  }

  function patchOrder(orderId: string, patch: Partial<MarketplaceOrder>) {
    setMall((prev) => (prev ? { ...prev, orders: prev.orders.map((o) => (o.id === orderId ? { ...o, ...patch } : o)) } : prev));
  }

  function patchTopUp(topUpId: string, patch: Partial<CashTopUp>) {
    setOps((prev) => (prev ? { ...prev, topUps: prev.topUps.map((u) => (u.id === topUpId ? { ...u, ...patch } : u)) } : prev));
  }

  const products = useMemo(() => mall?.products ?? [], [mall]);
  /** Money equivalence reference: how many points ≈ R$1 (from GET /api/mall config). */
  const pointsPerBrlRate = mall?.config?.pointsPerBrl || 10;

  // ---- Products tab: procurement context (flag-gated) ----------------------
  const procurementReady = procure?.config?.procurementEnabled === true;
  const consentPendingIds = useMemo(
    () => new Set(procurementReady ? (procure?.products ?? []).filter((p) => p.procurementConsent === "pending").map((p) => p.id) : []),
    [procure, procurementReady],
  );

  // ---- Products tab: keyword + status + quick filter + sort + pagination ----
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const base = products.filter((product) => {
      if (productQuickFilter === "consent" && !consentPendingIds.has(product.id)) return false;
      if (productQuickFilter === "lowstock" && !(product.status === "active" && isLowStock(product))) return false;
      if (productStatusFilter && product.status !== productStatusFilter) return false;
      if (!q) return true;
      return [product.name, product.supplierName ?? "", product.category ?? ""].some((text) => text.toLowerCase().includes(q));
    });
    if (!productSort) return base;
    const { key, dir } = productSort;
    return [...base].sort((a, b) => {
      if (key === "name") return a.name.localeCompare(b.name, "zh") * dir;
      if (key === "stock") return (a.stock - b.stock) * dir;
      if (key === "points") return (a.pointsPrice - b.pointsPrice) * dir;
      return (productMargin(a, pointsPerBrlRate).pct - productMargin(b, pointsPerBrlRate).pct) * dir;
    });
  }, [products, productSearch, productStatusFilter, productQuickFilter, consentPendingIds, productSort, pointsPerBrlRate]);
  const productPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCT_PAGE_SIZE));
  const safeProductPage = Math.min(productPage, productPages);
  const pagedProducts = useMemo(() => filteredProducts.slice((safeProductPage - 1) * PRODUCT_PAGE_SIZE, safeProductPage * PRODUCT_PAGE_SIZE), [filteredProducts, safeProductPage]);

  // ---- Orders tab: status + keyword + date range filter + pagination ----
  const allOrders = useMemo(() => mall?.orders ?? [], [mall]);
  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return allOrders.filter((order) => {
      if (orderFilter && order.status !== orderFilter) return false;
      if (q && ![order.productName ?? "", order.riderName ?? "", order.station ?? "", order.id].some((text) => text.toLowerCase().includes(q))) return false;
      const day = (order.createdAt ?? "").slice(0, 10);
      if (orderDateFrom && day < orderDateFrom) return false;
      if (orderDateTo && day > orderDateTo) return false;
      return true;
    });
  }, [allOrders, orderFilter, orderSearch, orderDateFrom, orderDateTo]);
  const orderPages = Math.max(1, Math.ceil(filteredOrders.length / ORDER_PAGE_SIZE));
  const safeOrderPage = Math.min(orderPage, orderPages);
  const pagedOrders = useMemo(() => filteredOrders.slice((safeOrderPage - 1) * ORDER_PAGE_SIZE, safeOrderPage * ORDER_PAGE_SIZE), [filteredOrders, safeOrderPage]);

  const suppliers = useMemo(() => [...new Set(products.map((product) => product.supplierName).filter(Boolean))] as string[], [products]);
  const summary = ops?.summary;
  const pendingPricing = products.filter((product) => product.status === "pending_pricing").length;
  const lowStock = products.filter((product) => product.status === "active" && isLowStock(product)).length;
  const priceChangePending = (ops?.priceChanges ?? []).filter((row) => row.status === "pending").length;
  const payablePending = (ops?.statements ?? []).filter((statement) => statement.status === "confirmed").reduce((sum, statement) => sum + statement.total, 0);
  const maxDaily = Math.max(1, ...(summary?.daily ?? []).map((day) => day.count));

  const drawerProduct = drawerId ? products.find((product) => product.id === drawerId) : undefined;

  // ---- Products tab: selection + bulk actions -------------------------------
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * Bulk (de)activation loops the existing priceProduct action per product,
   * keeping each product's current prices and only flipping the status.
   * pending_pricing products have no valid price yet — skipped with a hint.
   */
  async function bulkSetStatus(status: "active" | "paused") {
    if (bulkBusy) return;
    const targets = products.filter((product) => selectedIds.has(product.id));
    const eligible = targets.filter((product) => product.status !== "pending_pricing");
    const skipped = targets.length - eligible.length;
    if (eligible.length === 0) {
      setMessage({ tone: "err", text: "所选商品均为待定价，需先在配置抽屉里定价上架" });
      return;
    }
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    for (const product of eligible) {
      try {
        const res = await fetch("/api/mall", {
          method: "POST",
          headers,
          body: JSON.stringify({ action: "priceProduct", productId: product.id, pointsPrice: product.pointsPrice, cashPriceBRL: product.cashPriceBRL ?? 0, franchiseShareBRL: product.franchiseShareBRL ?? 0, status }),
        });
        if (res.ok) ok += 1;
        else fail += 1;
      } catch {
        fail += 1;
      }
    }
    setBulkBusy(false);
    setSelectedIds(new Set());
    setMessage({ tone: fail > 0 ? "err" : "ok", text: `批量${status === "active" ? "上架" : "下架"}完成：成功 ${ok} 个${fail > 0 ? `，失败 ${fail} 个` : ""}${skipped > 0 ? `，跳过待定价 ${skipped} 个` : ""}` });
    void load();
  }

  function exportSelectedCsv() {
    const targets = products.filter((product) => selectedIds.has(product.id));
    downloadCsv(
      "pontomall-products.csv",
      ["商品", "供应商", "分类", "状态", "库存", "积分价", "现金差价R$", "加盟分成R$", "供货价R$", "毛利率%"],
      targets.map((product) => {
        const m = productMargin(product, pointsPerBrlRate);
        return [product.name, product.supplierName ?? "", product.category ?? "", productStatusLabel[product.status] ?? product.status, product.stock, product.pointsPrice, (product.cashPriceBRL ?? 0).toFixed(2), (product.franchiseShareBRL ?? 0).toFixed(2), (product.supplyPrice ?? 0).toFixed(2), m.pct.toFixed(1)];
      }),
    );
  }

  return (
    <AppShell>
      <PageTitle title="PontoMall 商城后台" eyebrow="PontoMall" />
      <p className="-mt-3 mb-5 text-sm font-bold text-[var(--muted)]">商品、运营、履约、收款与供应链——商城业务的独立工作台。</p>

      {message && (
        <div className={`mb-4 rounded-[10px] border px-4 py-3 text-sm font-bold ${message.tone === "ok" ? "border-[var(--success)]/40 bg-[var(--success)]/10 text-[var(--success)]" : "border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)]"}`}>
          {message.text}
        </div>
      )}

      {/* ---- Tabs ---- */}
      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex h-10 items-center gap-2 rounded-[10px] border px-4 text-[13px] font-bold transition-colors ${tab === id ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent)]"}`}
          >
            <Icon size={15} /> {label}
            {id === "payments" && (summary?.pendingPayments ?? 0) > 0 && <span className="rounded-full bg-[var(--danger)] px-1.5 text-[10px] font-bold text-white">{summary?.pendingPayments}</span>}
            {id === "supply" && (ops?.priceChanges ?? []).some((row) => row.status === "pending") && <span className="h-2 w-2 rounded-full bg-[var(--danger)]" />}
          </button>
        ))}
        <button type="button" onClick={() => void load()} className="ml-auto inline-flex h-10 items-center gap-2 rounded-[10px] border border-[var(--line)] px-4 text-[13px] font-bold text-[var(--muted)] hover:border-[var(--accent)]">
          <RefreshCcw size={14} /> 刷新
        </button>
      </div>

      {/* ================= 总览 ================= */}
      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="兑换单数" value={String(summary?.orders ?? 0)} hint="非取消的全部订单" />
            <Stat label="积分 GMV" value={`${(summary?.pointsGmv ?? 0).toLocaleString()} ${t("dynPts")}`} hint="累计消耗积分" />
            <Stat label="现金 GMV（已核销）" value={`R$ ${(summary?.cashGmv ?? 0).toFixed(2)}`} hint="PIX 补差实收" />
            <Stat label="待核销收款" value={String(summary?.pendingPayments ?? 0)} hint="骑手已提交凭证" />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="待定价商品" value={String(pendingPricing)} hint="供应商已报价待上架" />
            <Stat label="低库存商品" value={String(lowStock)} hint="在售且库存 ≤ 3" />
            <Stat label="待付对账单" value={`R$ ${payablePending.toFixed(2)}`} hint="供应商已确认待付款" />
            <Stat label="调价待审批" value={String((ops?.priceChanges ?? []).filter((row) => row.status === "pending").length)} hint="供应链 Tab 处理" />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <button type="button" onClick={() => setTab("orders")} className="panel p-4 text-left transition-colors hover:border-[var(--accent)]" style={(summary?.reviewPending ?? 0) > 0 ? { borderColor: "var(--warn)" } : undefined}>
              <div className="text-[11px] font-bold uppercase text-[var(--muted)]">高价值待审核</div>
              <div className="mt-1 text-2xl font-black" style={(summary?.reviewPending ?? 0) > 0 ? { color: "var(--warn)" } : undefined}>{summary?.reviewPending ?? 0}</div>
              <div className="mt-0.5 text-[11px] font-bold text-[var(--muted)]">点击去订单 Tab 处理</div>
            </button>
            <Stat label="合作方兑换" value={String(summary?.partnerOrders ?? 0)} hint="Partner 兑换单数" />
            <Stat label="合作方积分消耗" value={`${(summary?.partnerPointsSpent ?? 0).toLocaleString()} ${t("dynPts")}`} hint="Partner 积分账户（独立口径）" />
            <Stat label="近 30 天兑换" value={String((summary?.daily ?? []).reduce((sum, d) => sum + d.count, 0))} hint="最近 30 天订单合计" />
          </div>

          {/* 老化警示：超过 48 小时未处理的排队事项（点击直达对应 Tab） */}
          {summary?.aging && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {([
                { label: "定价超 48h 未处理", count: summary.aging.pricingOver48h, hint: "供应商提报后待定价", target: "products" as const },
                { label: "调价超 48h 未审批", count: summary.aging.priceChangesOver48h, hint: "供应链 Tab 审批", target: "supply" as const },
                { label: "充值超 48h 未核销", count: summary.aging.topUpsOver48h, hint: "充值与收款 Tab 核销", target: "payments" as const },
              ]).map((card) => (
                <button
                  key={card.label}
                  type="button"
                  onClick={() => setTab(card.target)}
                  className="panel p-4 text-left transition-colors hover:border-[var(--accent)]"
                  style={card.count > 0 ? { borderColor: "var(--warn)", background: "color-mix(in srgb, var(--warn) 8%, transparent)" } : undefined}
                >
                  <div className="text-[11px] font-bold uppercase text-[var(--muted)]">{card.label}</div>
                  <div className="mt-1 text-2xl font-black" style={card.count > 0 ? { color: "var(--warn)" } : undefined}>{card.count}</div>
                  <div className="mt-0.5 text-[11px] font-bold text-[var(--muted)]">{card.count > 0 ? `⚠ ${card.hint}` : "无积压"}</div>
                </button>
              ))}
            </div>
          )}

          {(summary?.topProducts ?? []).length > 0 && (
            <div className="panel p-5">
              <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">热销商品 Top 5（兑换次数）</div>
              <div className="space-y-2">
                {(summary?.topProducts ?? []).map((row, i) => (
                  <div key={row.name} className="flex items-center gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--accent)]/15 text-xs font-bold text-[var(--accent)]">{i + 1}</span>
                    <span className="flex-1 truncate text-sm font-bold">{row.name}</span>
                    <span className="text-sm font-bold">{row.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="panel p-5">
            <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">近 30 天兑换量</div>
            <div className="flex h-28 items-end gap-[3px]">
              {(summary?.daily ?? []).map((day) => (
                <div key={day.date} className="group relative flex-1 rounded-t-[3px] bg-[var(--accent)]" style={{ height: `${Math.max(3, (day.count / maxDaily) * 100)}%`, opacity: day.count > 0 ? 0.9 : 0.18 }}>
                  <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-white group-hover:block">{day.date.slice(5)} · {day.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel p-5">
            <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">供应商应付汇总（履约口径）</div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] font-bold uppercase text-[var(--muted)]"><th className="py-2">供应商</th><th>履约件数</th><th>应付金额</th></tr></thead>
              <tbody>
                {(mall?.supplierSettlement ?? []).map((row) => (
                  <tr key={row.supplier} className="border-t border-[var(--line)] font-bold"><td className="py-2.5">{row.supplier}</td><td>{row.qty}</td><td>R$ {row.payable.toFixed(2)}</td></tr>
                ))}
                {(mall?.supplierSettlement ?? []).length === 0 && <tr><td colSpan={3} className="py-6 text-center text-[var(--muted)]">暂无履约订单。</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= 商品与定价（表格 + 配置抽屉工作台） ================= */}
      {tab === "products" && (
        <div className="space-y-3">
          {/* ---- 待办卡：点击即过滤 / 跳转 ---- */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {([
              { key: "pricing", label: "待定价", count: pendingPricing, color: "var(--warn)", hint: "供应商已提报，等待总部定价", onClick: () => { setProductStatusFilter("pending_pricing"); setProductQuickFilter(""); setProductPage(1); } },
              { key: "consent", label: "待审直采同意", count: consentPendingIds.size, color: "var(--ok)", hint: "供应商申请开放直采，待审批", onClick: () => { setProductStatusFilter(""); setProductQuickFilter("consent"); setProductPage(1); } },
              { key: "lowstock", label: "低库存", count: lowStock, color: "var(--danger)", hint: "在售且库存 ≤ 补货阈值", onClick: () => { setProductStatusFilter(""); setProductQuickFilter("lowstock"); setProductPage(1); } },
              { key: "pricechange", label: "调价待批", count: priceChangePending, color: "var(--muted)", hint: "去供应链 Tab 审批", onClick: () => setTab("supply") },
            ] as const).map((card) => (
              <button key={card.key} type="button" onClick={card.onClick} className={`panel p-4 text-left transition-colors hover:border-[var(--accent)] ${card.count === 0 ? "opacity-55" : ""}`}>
                <div className="text-[11px] font-bold uppercase text-[var(--muted)]">{card.label}</div>
                <div className="mt-1 text-2xl font-black" style={card.count > 0 ? { color: card.color } : { color: "var(--muted)" }}>{card.count}</div>
                <div className="mt-0.5 text-[11px] font-bold text-[var(--muted)]">{card.hint}</div>
              </button>
            ))}
          </div>

          {/* ---- 搜索 + 状态筛选 + 分页 ---- */}
          <div className="panel flex flex-wrap items-center gap-2 p-4">
            <input value={productSearch} onChange={(e) => { setProductSearch(e.target.value); setProductPage(1); }} placeholder="搜索商品名 / 供应商 / 分类…" className="h-10 w-64 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
            {["", "active", "paused", "pending_pricing"].map((status) => (
              <button key={status || "all"} type="button" onClick={() => { setProductStatusFilter(status); setProductQuickFilter(""); setProductPage(1); }} className={`rounded-full border px-3.5 py-1.5 text-xs font-bold ${productStatusFilter === status && !productQuickFilter ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]" : "border-[var(--line)] text-[var(--muted)]"}`}>
                {status === "" ? "全部" : productStatusLabel[status]}
              </button>
            ))}
            {productQuickFilter && (
              <button type="button" onClick={() => { setProductQuickFilter(""); setProductPage(1); }} className="rounded-full border border-[var(--accent)] bg-[var(--accent)]/10 px-3.5 py-1.5 text-xs font-bold text-[var(--accent)]">
                {productQuickFilter === "consent" ? "待审直采同意" : "低库存"} ✕
              </button>
            )}
            <div className="ml-auto">
              <Pager page={safeProductPage} pages={productPages} total={filteredProducts.length} onPage={setProductPage} />
            </div>
          </div>

          {/* ---- 批量操作条 ---- */}
          {selectedIds.size > 0 && (
            <div className="panel flex flex-wrap items-center gap-2 border-[var(--accent)] p-3">
              <span className="text-sm font-bold">已选 <b className="font-black">{selectedIds.size}</b> 个商品</span>
              <button type="button" disabled={bulkBusy} onClick={() => void bulkSetStatus("active")} className="h-9 rounded-[8px] border border-[var(--line)] px-3 text-xs font-bold text-[var(--muted)] hover:border-[var(--accent)] disabled:opacity-50">批量上架</button>
              <button type="button" disabled={bulkBusy} onClick={() => void bulkSetStatus("paused")} className="h-9 rounded-[8px] border border-[var(--line)] px-3 text-xs font-bold text-[var(--muted)] hover:border-[var(--accent)] disabled:opacity-50">批量下架</button>
              <button type="button" onClick={exportSelectedCsv} className="h-9 rounded-[8px] border border-[var(--line)] px-3 text-xs font-bold text-[var(--muted)] hover:border-[var(--accent)]">导出 CSV</button>
              <button type="button" onClick={() => setSelectedIds(new Set())} className="ml-auto h-9 px-2 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]">取消选择</button>
            </div>
          )}

          {products.length === 0 && <div className="panel p-10 text-center text-sm font-bold text-[var(--muted)]">还没有商品——等供应商在供应链后台提报。</div>}
          {products.length > 0 && filteredProducts.length === 0 && <div className="panel p-10 text-center text-sm font-bold text-[var(--muted)]">没有匹配的商品——换个关键字或状态试试。</div>}

          {/* ---- 商品表格 ---- */}
          {filteredProducts.length > 0 && (
            <div className="panel overflow-x-auto p-0">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-bold uppercase text-[var(--muted)]">
                    <th className="w-10 px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="全选本页"
                        checked={pagedProducts.length > 0 && pagedProducts.every((product) => selectedIds.has(product.id))}
                        onChange={() => {
                          const allSelected = pagedProducts.every((product) => selectedIds.has(product.id));
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            for (const product of pagedProducts) { if (allSelected) next.delete(product.id); else next.add(product.id); }
                            return next;
                          });
                        }}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                    </th>
                    {([
                      { key: "name" as const, label: "商品" },
                      { key: null, label: "状态" },
                      { key: "stock" as const, label: "库存" },
                      { key: "points" as const, label: "积分价" },
                      { key: "margin" as const, label: "毛利率" },
                      { key: null, label: "加盟分成" },
                    ]).map((col, i) => (
                      <th key={col.label} className={`py-2.5 ${i === 0 ? "" : "pr-2"}`}>
                        {col.key ? (
                          <button type="button" onClick={() => setProductSort((prev) => (prev?.key === col.key ? { key: col.key!, dir: prev.dir === 1 ? -1 : 1 } : { key: col.key!, dir: 1 }))} className="inline-flex items-center gap-1 uppercase hover:text-[var(--text)]">
                            {col.label}
                            <span className="text-[9px]">{productSort?.key === col.key ? (productSort.dir === 1 ? "▲" : "▼") : ""}</span>
                          </button>
                        ) : col.label}
                      </th>
                    ))}
                    <th className="pr-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedProducts.map((product) => {
                    const m = productMargin(product, pointsPerBrlRate);
                    const low = isLowStock(product);
                    return (
                      <tr key={product.id} onClick={() => setDrawerId(product.id)} className="cursor-pointer border-t border-[var(--line)] transition-colors hover:bg-[var(--surface-hover)]">
                        <td className="px-3 py-1" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" aria-label={`选择 ${product.name}`} checked={selectedIds.has(product.id)} onChange={() => toggleSelect(product.id)} className="h-4 w-4 accent-[var(--accent)]" />
                        </td>
                        <td className="py-1 pr-2">
                          <div className="flex items-center gap-2.5">
                            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)]">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-lg">🎁</div>}
                            </div>
                            <div className="min-w-0">
                              <div className="max-w-[260px] truncate text-sm font-black">{product.name}{product.isVirtual ? <span className="ml-1.5 text-[10px] font-bold text-[var(--muted)]">虚拟</span> : null}</div>
                              <div className="max-w-[260px] truncate text-[11px] font-bold text-[var(--muted)]">{product.supplierName ?? "自营"}{product.category ? ` · ${product.category}` : ""}</div>
                            </div>
                          </div>
                        </td>
                        <td className="pr-2">{statusBadge(product.status, productStatusLabel[product.status] ?? product.status)}</td>
                        <td className={`pr-2 font-black ${low ? "text-[var(--danger)]" : ""}`}>{product.stock}{low ? <span className="ml-1 text-[10px] font-bold">低</span> : null}</td>
                        <td className="pr-2 font-black">{product.pointsPrice > 0 ? product.pointsPrice.toLocaleString() : "—"}{(product.cashPriceBRL ?? 0) > 0 ? <span className="text-[11px] font-bold text-[var(--muted)]"> +R${(product.cashPriceBRL ?? 0).toFixed(2)}</span> : null}</td>
                        <td className={`pr-2 font-black ${m.margin < 0 ? "text-[var(--danger)]" : ""}`}>{product.status === "pending_pricing" ? "—" : `${m.pct.toFixed(1)}%`}</td>
                        <td className="pr-2 font-bold">{(product.franchiseShareBRL ?? 0) > 0 ? `R$ ${(product.franchiseShareBRL ?? 0).toFixed(2)}` : "—"}</td>
                        <td className="pr-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => setDrawerId(product.id)} className="h-8 rounded-[8px] border border-[var(--line)] px-3 text-xs font-bold text-[var(--muted)] hover:border-[var(--accent)]">配置</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ---- 配置抽屉 ---- */}
          {drawerProduct && (
            <ProductDrawer
              product={drawerProduct}
              proc={procure?.products?.find((p) => p.id === drawerProduct.id)}
              showProcurement={procurementReady}
              rate={pointsPerBrlRate}
              note={message}
              onClose={() => setDrawerId("")}
              post={post}
              dialog={dialog}
            />
          )}
        </div>
      )}

      {/* ================= 分类与 Banner ================= */}
      {tab === "merch" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="panel p-5">
            <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">商品分类</div>
            <div className="mb-3 flex gap-2">
              <input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="新分类名，如 Equipamento" className="h-10 flex-1 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
              <button type="button" disabled={!categoryName.trim()} onClick={() => void post("/api/mall/ops", { action: "addCategory", name: categoryName.trim() }, "分类已添加").then(() => setCategoryName(""))} className="h-10 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-bold text-[var(--accent-ink)] disabled:opacity-50">添加</button>
            </div>
            <div className="space-y-2">
              {(ops?.categories ?? []).map((category) => (
                <div key={category.id} className="flex items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2">
                  <span className="flex-1 text-sm font-bold" style={{ opacity: category.active ? 1 : 0.45 }}>{category.name}</span>
                  <button type="button" onClick={() => void post("/api/mall/ops", { action: "updateCategory", categoryId: category.id, active: !category.active })} className="tag">{category.active ? "停用" : "启用"}</button>
                  <button type="button" onClick={() => void post("/api/mall/ops", { action: "deleteCategory", categoryId: category.id })} className="text-xs font-bold text-[var(--danger)]">删除</button>
                </div>
              ))}
              {(ops?.categories ?? []).length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">未配置分类时，门面按商品自带分类自动归组。</div>}
            </div>
          </div>

          <div className="panel p-5">
            <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">门面 Banner</div>
            <div className="mb-3 grid gap-2">
              <input value={bannerDraft.title} onChange={(e) => setBannerDraft((prev) => ({ ...prev, title: e.target.value }))} placeholder="标题（无图时直接展示标题）" className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
              <div className="flex gap-2">
                <input value={bannerDraft.imageUrl} onChange={(e) => setBannerDraft((prev) => ({ ...prev, imageUrl: e.target.value }))} placeholder="图片 URL（可选，建议 1600×500）" className="h-10 flex-1 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
                <input value={bannerDraft.href} onChange={(e) => setBannerDraft((prev) => ({ ...prev, href: e.target.value }))} placeholder="点击跳转（可选）" className="h-10 flex-1 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
                <button type="button" disabled={!bannerDraft.title.trim()} onClick={() => void post("/api/mall/ops", { action: "addBanner", ...bannerDraft }, "Banner 已添加").then(() => setBannerDraft({ title: "", imageUrl: "", href: "" }))} className="h-10 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-bold text-[var(--accent-ink)] disabled:opacity-50">添加</button>
              </div>
            </div>
            <div className="space-y-2">
              {(ops?.banners ?? []).map((banner) => (
                <div key={banner.id} className="flex items-center gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {banner.imageUrl ? <img src={banner.imageUrl} alt="" className="h-10 w-20 rounded object-cover" /> : <div className="grid h-10 w-20 place-items-center rounded bg-[var(--line)] text-[10px] font-bold text-[var(--muted)]">文字</div>}
                  <span className="flex-1 truncate text-sm font-bold" style={{ opacity: banner.active ? 1 : 0.45 }}>{banner.title}</span>
                  <button type="button" onClick={() => void post("/api/mall/ops", { action: "updateBanner", bannerId: banner.id, active: !banner.active })} className="tag">{banner.active ? "停用" : "启用"}</button>
                  <button type="button" onClick={() => void post("/api/mall/ops", { action: "deleteBanner", bannerId: banner.id })} className="text-xs font-bold text-[var(--danger)]">删除</button>
                </div>
              ))}
            </div>
          </div>

          {/* ---- 优惠券 ---- */}
          <div className="panel p-5 lg:col-span-2">
            <div className="mb-1 text-xs font-black uppercase text-[var(--muted)]">优惠券（兑换时按等级自动抵扣最优券）</div>
            <div className="mb-3 text-[11px] font-bold text-[var(--muted)]">满减券：消耗满「门槛」积分可用；折扣券：按抵扣后积分价百分比。按会员等级发放，每人可限用次数。</div>
            <div className="mb-3 grid gap-2 md:grid-cols-7">
              <input value={couponDraft.title} onChange={(e) => setCouponDraft((p) => ({ ...p, title: e.target.value }))} placeholder="券名" className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)] md:col-span-2" />
              <select value={couponDraft.type} onChange={(e) => setCouponDraft((p) => ({ ...p, type: e.target.value }))} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]">
                <option value="points_off">满减(积分)</option>
                <option value="percent_off">折扣(%)</option>
              </select>
              <input value={couponDraft.value} onChange={(e) => setCouponDraft((p) => ({ ...p, value: e.target.value.replace(/[^0-9]/g, "") }))} placeholder={couponDraft.type === "percent_off" ? "折扣% (1-100)" : "立减积分"} inputMode="numeric" className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
              <input value={couponDraft.minPoints} onChange={(e) => setCouponDraft((p) => ({ ...p, minPoints: e.target.value.replace(/[^0-9]/g, "") }))} placeholder="门槛积分(可空)" inputMode="numeric" className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
              <select value={couponDraft.minTier} onChange={(e) => setCouponDraft((p) => ({ ...p, minTier: e.target.value }))} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]">
                <option value="member">全员</option>
                <option value="bronze">铜牌+</option>
                <option value="prata">银牌+</option>
                <option value="ouro">金牌+</option>
                <option value="diamante">钻石</option>
              </select>
              <input value={couponDraft.perRiderLimit} onChange={(e) => setCouponDraft((p) => ({ ...p, perRiderLimit: e.target.value.replace(/[^0-9]/g, "") }))} placeholder="每人限(0不限)" inputMode="numeric" className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
            </div>
            <div className="mb-3 flex gap-2">
              <input type="date" value={couponDraft.expiresAt} onChange={(e) => setCouponDraft((p) => ({ ...p, expiresAt: e.target.value }))} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
              <button type="button" disabled={!couponDraft.title.trim() || !(Number(couponDraft.value) > 0)} onClick={() => void post("/api/mall/ops", { action: "addCoupon", title: couponDraft.title.trim(), type: couponDraft.type, value: Number(couponDraft.value), minPoints: Number(couponDraft.minPoints) || 0, minTier: couponDraft.minTier, perRiderLimit: Number(couponDraft.perRiderLimit) || 0, expiresAt: couponDraft.expiresAt || undefined }, "优惠券已创建").then(() => setCouponDraft({ title: "", type: "points_off", value: "", minPoints: "", minTier: "member", perRiderLimit: "", expiresAt: "" }))} className="h-10 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-bold text-[var(--accent-ink)] disabled:opacity-50">创建券</button>
            </div>
            <div className="space-y-2">
              {(ops?.coupons ?? []).map((coupon) => (
                <div key={coupon.id} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2" style={{ opacity: coupon.active ? 1 : 0.5 }}>
                  <span className="text-sm font-bold">{coupon.title}</span>
                  <span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[11px] font-bold text-[var(--accent)]">{coupon.type === "percent_off" ? t("dynPctOff", { v: coupon.value }) : t("dynPtsOff", { v: coupon.value })}</span>
                  <span className="text-[11px] font-bold text-[var(--muted)]">{t("dynCouponMeta", { min: coupon.minPoints, tier: ({ member: t("dynTierAll"), bronze: t("dynTierBronze"), prata: t("dynTierSilver"), ouro: t("dynTierGold"), diamante: t("dynTierDiamond") } as Record<string, string>)[coupon.minTier], limit: coupon.perRiderLimit === 0 ? t("dynLimitNone") : coupon.perRiderLimit, until: coupon.expiresAt ? t("dynUntil", { d: coupon.expiresAt }) : "" })}</span>
                  <button type="button" onClick={() => void post("/api/mall/ops", { action: "updateCoupon", couponId: coupon.id, active: !coupon.active })} className="tag ml-auto">{coupon.active ? "停用" : "启用"}</button>
                  <button type="button" onClick={() => void post("/api/mall/ops", { action: "deleteCoupon", couponId: coupon.id })} className="text-xs font-bold text-[var(--danger)]">删除</button>
                </div>
              ))}
              {(ops?.coupons ?? []).length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">暂无优惠券。创建后骑手兑换时自动按等级匹配最优券抵扣。</div>}
            </div>
          </div>
        </div>
      )}

      {/* ================= 订单履约 ================= */}
      {tab === "orders" && (
        <div className="panel p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {["", "created", "arrived", "fulfilled", "cancelled"].map((status) => (
              <button key={status || "all"} type="button" onClick={() => { setOrderFilter(status); setOrderPage(1); }} className={`rounded-full border px-3.5 py-1.5 text-xs font-bold ${orderFilter === status ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]" : "border-[var(--line)] text-[var(--muted)]"}`}>
                {status === "" ? "全部" : orderStatusLabel[status]}
              </button>
            ))}
            <button type="button" onClick={() => downloadCsv("pontomall-orders.csv", ["订单", "商品", "骑手", "站点", "积分", "现金", "支付", "状态", "创建时间"], filteredOrders.map((order) => [order.id, order.productName ?? "", order.riderName ?? "", order.station ?? "", String(order.pointsSpent), order.cashDue ? order.cashDue.toFixed(2) : "", order.paymentStatus ?? "", orderStatusLabel[order.status] ?? order.status, order.createdAt]))} className="ml-auto h-9 rounded-[8px] border border-[var(--line)] px-3 text-xs font-bold text-[var(--muted)] hover:border-[var(--accent)]">导出 CSV（当前筛选）</button>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input value={orderSearch} onChange={(e) => { setOrderSearch(e.target.value); setOrderPage(1); }} placeholder="搜索商品 / 骑手 / 站点 / 订单号…" className="h-9 w-64 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
            <label className="text-[11px] font-bold text-[var(--muted)]">从
              <input type="date" value={orderDateFrom} onChange={(e) => { setOrderDateFrom(e.target.value); setOrderPage(1); }} className="ml-1.5 h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]" />
            </label>
            <label className="text-[11px] font-bold text-[var(--muted)]">至
              <input type="date" value={orderDateTo} onChange={(e) => { setOrderDateTo(e.target.value); setOrderPage(1); }} className="ml-1.5 h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]" />
            </label>
            <div className="ml-auto">
              <Pager page={safeOrderPage} pages={orderPages} total={filteredOrders.length} onPage={setOrderPage} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="text-left text-[11px] font-bold uppercase text-[var(--muted)]"><th className="py-2">商品</th><th>骑手</th><th>站点</th><th>金额</th><th>支付</th><th>状态</th><th>时间</th><th className="text-right">操作</th></tr></thead>
              <tbody>
                {pagedOrders.map((order) => (
                  <tr key={order.id} className="border-t border-[var(--line)] font-bold">
                    <td className="py-2.5">{order.productName}</td>
                    <td>{order.riderName}</td>
                    <td>{order.station}</td>
                    <td>{order.pointsSpent} 分{order.cashDue ? ` + R$${order.cashDue.toFixed(2)}` : ""}</td>
                    <td>{order.paymentStatus ? statusBadge(order.paymentStatus, paymentStatusChip[order.paymentStatus] ?? order.paymentStatus) : "—"}</td>
                    <td>{order.reviewStatus === "pending" ? statusBadge("pending", "待审核·高价值") : statusBadge(order.status, orderStatusLabel[order.status] ?? order.status)}</td>
                    <td className="text-xs text-[var(--muted)]">{order.createdAt}</td>
                    <td className="text-right">
                      {order.reviewStatus === "pending" ? (
                        <>
                          <button type="button" onClick={() => { const prev = mall; void optimisticPost("/api/mall", { action: "reviewOrder", orderId: order.id, decision: "approve" }, "已批准，资格放行", () => patchOrder(order.id, { reviewStatus: "approved" }), () => setMall(prev)); }} className="h-8 rounded-[8px] bg-[var(--accent)] px-2.5 text-xs font-bold text-[var(--accent-ink)]">批准</button>
                          <button type="button" onClick={async () => { if (!(await dialog.confirm("拒绝高价值兑换", { message: `拒绝并退还 ${order.pointsSpent} 分给 ${order.riderName}？`, confirmText: "拒绝并退分", tone: "danger" }))) return; const prev = mall; void optimisticPost("/api/mall", { action: "reviewOrder", orderId: order.id, decision: "reject" }, "已拒绝并退分", () => patchOrder(order.id, { reviewStatus: "rejected", status: "cancelled" }), () => setMall(prev)); }} className="ml-1.5 h-8 rounded-[8px] border border-[var(--danger)]/40 px-2.5 text-xs font-bold text-[var(--danger)]">拒绝</button>
                        </>
                      ) : order.accountType === "partner" ? (
                        <span className="text-xs text-[var(--muted)]">{order.status === "fulfilled" ? "合作方已确认收货" : "直送门店·待合作方确认"}</span>
                      ) : (
                        <>
                          {order.status === "created" && !order.voucherCode && <button type="button" onClick={() => { const prev = mall; void optimisticPost("/api/mall", { action: "markArrived", orderId: order.id }, "已标记到站并推送骑手", () => patchOrder(order.id, { status: "arrived" }), () => setMall(prev)); }} className="h-8 rounded-[8px] border border-[var(--line)] px-2.5 text-xs font-bold text-[var(--muted)] hover:border-[var(--accent)]">到站</button>}
                          {order.status === "arrived" && <button type="button" onClick={() => { const prev = mall; void optimisticPost("/api/mall", { action: "markPickedUp", orderId: order.id }, "已交付", () => patchOrder(order.id, { status: "fulfilled" }), () => setMall(prev)); }} className="ml-1.5 h-8 rounded-[8px] bg-[var(--accent)] px-2.5 text-xs font-bold text-[var(--accent-ink)]">交付</button>}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredOrders.length === 0 && <tr><td colSpan={8} className="py-8 text-center font-bold text-[var(--muted)]">{allOrders.length === 0 ? "暂无订单。" : "没有匹配的订单——调整关键字、状态或日期范围。"}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= 充值与收款 ================= */}
      {tab === "payments" && (
        <div className="space-y-5">
          <div className="panel p-5">
            <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">PIX 充值核销 · 确认到账后入余额（操作留痕）</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead><tr className="text-left text-[11px] font-bold uppercase text-[var(--muted)]"><th className="py-2">骑手</th><th>金额</th><th>凭证号</th><th>状态</th><th>申请时间</th><th>处理</th><th className="text-right">操作</th></tr></thead>
                <tbody>
                  {(ops?.topUps ?? []).map((topUp) => (
                    <tr key={topUp.id} className="border-t border-[var(--line)] font-bold">
                      <td className="py-2.5">{topUp.riderName}</td>
                      <td>R$ {topUp.amountBRL.toFixed(2)}</td>
                      <td className="font-mono text-xs">{topUp.reference ?? "—"}</td>
                      <td><Badge value={topUpStatusLabel[topUp.status]} /></td>
                      <td className="text-xs text-[var(--muted)]">{topUp.createdAt}</td>
                      <td className="text-xs text-[var(--muted)]">{topUp.decidedAt ? `${topUp.decidedAt} · ${topUp.decidedBy}` : "—"}</td>
                      <td className="text-right">
                        {topUp.status === "submitted" && (
                          <span className="inline-flex gap-1.5">
                            <button type="button" onClick={() => { const prev = ops; void optimisticPost("/api/mall/ops", { action: "confirmTopUp", topUpId: topUp.id }, "已确认到账，余额已入账", () => patchTopUp(topUp.id, { status: "confirmed" }), () => setOps(prev)); }} className="inline-flex h-8 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-2.5 text-xs font-bold text-[var(--accent-ink)]"><CheckCircle2 size={13} /> 确认到账</button>
                            <button type="button" onClick={async () => { const note = await dialog.prompt("驳回充值", { message: `驳回 ${topUp.riderName} 的 R$ ${topUp.amountBRL.toFixed(2)} 充值申请。`, placeholder: "驳回原因（可空）" }); if (note === null) return; const prev = ops; void optimisticPost("/api/mall/ops", { action: "rejectTopUp", topUpId: topUp.id, note }, "已驳回", () => patchTopUp(topUp.id, { status: "rejected" }), () => setOps(prev)); }} className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-[var(--danger)]/40 px-2.5 text-xs font-bold text-[var(--danger)]"><XCircle size={13} /> 驳回</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(ops?.topUps ?? []).length === 0 && <tr><td colSpan={7} className="py-8 text-center font-bold text-[var(--muted)]">暂无充值申请。</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-black uppercase text-[var(--muted)]">现金余额台账（不可篡改记录）</span>
              <button type="button" onClick={() => downloadCsv("cash-ledger.csv", ["时间", "骑手", "类型", "金额", "余额", "来源", "备注", "操作人"], (ops?.cashLedger ?? []).map((entry) => [entry.createdAt, entry.riderName, entry.type, entry.amountBRL.toFixed(2), entry.balanceAfter.toFixed(2), entry.sourceId, entry.note ?? "", entry.createdBy]))} className="ml-auto h-9 rounded-[8px] border border-[var(--line)] px-3 text-xs font-bold text-[var(--muted)] hover:border-[var(--accent)]">导出 CSV</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead><tr className="text-left text-[11px] font-bold uppercase text-[var(--muted)]"><th className="py-2">时间</th><th>骑手</th><th>类型</th><th>金额</th><th>余额</th><th>来源</th><th>操作人</th></tr></thead>
                <tbody>
                  {(ops?.cashLedger ?? []).map((entry) => (
                    <tr key={entry.id} className="border-t border-[var(--line)] font-bold">
                      <td className="py-2.5 text-xs text-[var(--muted)]">{entry.createdAt}</td>
                      <td>{entry.riderName}</td>
                      <td>{entry.type === "topup" ? "充值" : entry.type === "spend" ? "消费" : entry.type === "refund" ? "退款" : "调整"}</td>
                      <td style={{ color: entry.type === "spend" ? "var(--danger)" : "var(--success)" }}>{entry.type === "spend" ? "-" : "+"}R$ {Math.abs(entry.amountBRL).toFixed(2)}</td>
                      <td>R$ {entry.balanceAfter.toFixed(2)}</td>
                      <td className="font-mono text-xs">{entry.sourceId}{entry.note ? ` · ${entry.note}` : ""}</td>
                      <td className="text-xs text-[var(--muted)]">{entry.createdBy}</td>
                    </tr>
                  ))}
                  {(ops?.cashLedger ?? []).length === 0 && <tr><td colSpan={7} className="py-8 text-center font-bold text-[var(--muted)]">暂无余额流水。</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {(ops?.payments ?? []).length > 0 && (
            <div className="panel p-5">
              <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">历史按单收款记录（旧流程存档）</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead><tr className="text-left text-[11px] font-bold uppercase text-[var(--muted)]"><th className="py-2">骑手</th><th>商品</th><th>金额</th><th>凭证号</th><th>状态</th></tr></thead>
                  <tbody>
                    {(ops?.payments ?? []).map((payment) => (
                      <tr key={payment.id} className="border-t border-[var(--line)] font-bold">
                        <td className="py-2.5">{payment.riderName}</td>
                        <td>{payment.productName}</td>
                        <td>R$ {payment.amountBRL.toFixed(2)}</td>
                        <td className="font-mono text-xs">{payment.reference ?? "—"}</td>
                        <td><Badge value={paymentStatusLabel[payment.status]} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= 供应链 ================= */}
      {tab === "supply" && (
        <div className="space-y-5">
          <div className="panel p-5">
            <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">供货价调整审批</div>
            <div className="space-y-2">
              {(ops?.priceChanges ?? []).map((row) => (
                <div key={row.id} className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-black">{row.productName} <span className="text-[var(--muted)]">· {row.supplierName}</span></div>
                    <div className="text-xs font-bold text-[var(--muted)]">R$ {row.oldPrice.toFixed(2)} → <b style={{ color: row.newPrice > row.oldPrice ? "var(--danger)" : "var(--success)" }}>R$ {row.newPrice.toFixed(2)}</b>{row.note ? ` · ${row.note}` : ""} · {row.createdAt}</div>
                  </div>
                  {row.status === "pending" ? (
                    <span className="flex gap-1.5">
                      <button type="button" onClick={() => void post("/api/mall/ops", { action: "decidePriceChange", requestId: row.id, approve: true }, "已批准，供货价已更新")} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-bold text-[var(--accent-ink)]">批准</button>
                      <button type="button" onClick={() => void post("/api/mall/ops", { action: "decidePriceChange", requestId: row.id, approve: false }, "已拒绝")} className="h-8 rounded-[8px] border border-[var(--line)] px-3 text-xs font-bold text-[var(--muted)]">拒绝</button>
                    </span>
                  ) : (
                    statusBadge(row.status, row.status === "approved" ? "已批准" : "已拒绝")
                  )}
                </div>
              ))}
              {(ops?.priceChanges ?? []).length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">暂无调价申请。</div>}
            </div>
          </div>

          <div className="panel p-5">
            <div className="mb-1 text-xs font-black uppercase text-[var(--muted)]">补货单（PO）· 代销备货流转</div>
            <p className="mb-3 text-[11px] font-bold text-[var(--muted)]">代销模式:补货单仅用于备货/调拨与入库流转,<b>不产生应付账款</b>。供应商货款一律以月度对账(履约订单 × 供货价)结算,补货金额仅为备货参考成本。</p>
            <div className="mb-4 rounded-[10px] border border-dashed border-[var(--line)] p-3.5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <select value={poSupplier} onChange={(e) => { setPoSupplier(e.target.value); setPoItems({}); }} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none">
                  <option value="">选择供应商下补货单…</option>
                  {suppliers.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}
                </select>
                {poSupplier && (
                  <button
                    type="button"
                    onClick={() => {
                      const items = Object.entries(poItems).filter(([, qty]) => Number(qty) > 0).map(([productId, qty]) => ({ productId, qty: Number(qty) }));
                      if (items.length === 0) { setMessage({ tone: "err", text: "请填写至少一个商品数量" }); return; }
                      void post("/api/mall/ops", { action: "createPO", supplierName: poSupplier, items }, "补货单已下达，等待供应商确认").then(() => { setPoSupplier(""); setPoItems({}); });
                    }}
                    className="h-10 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-bold text-[var(--accent-ink)]"
                  >下达补货单</button>
                )}
              </div>
              {poSupplier && (
                <div className="grid gap-1.5 md:grid-cols-2">
                  {products.filter((product) => product.supplierName === poSupplier).map((product) => (
                    <label key={product.id} className="flex items-center gap-2 text-sm font-bold">
                      <input value={poItems[product.id] ?? ""} onChange={(e) => setPoItems((prev) => ({ ...prev, [product.id]: e.target.value }))} placeholder="0" className="h-9 w-16 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-center text-sm font-bold outline-none focus:border-[var(--accent)]" />
                      <span className="truncate">{product.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-[var(--muted)]">R$ {(product.supplyPrice ?? 0).toFixed(2)} · 现库存 {product.stock}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              {(ops?.purchaseOrders ?? []).map((po) => (
                <div key={po.id} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Boxes size={15} className="text-[var(--muted)]" />
                    <span className="text-sm font-black">{po.supplierName}</span>
                    {statusBadge(po.status, (poStatusLabel as Record<string, string>)[po.status] ?? extraPoLabel[po.status] ?? po.status)}
                    <span className="text-xs font-bold text-[var(--muted)]">{po.items.reduce((sum, item) => sum + item.qty, 0)} 件 · 备货参考成本 R$ {po.totalCost.toFixed(2)} · {po.createdAt}</span>
                    <span className="ml-auto flex gap-1.5">
                      {(po.status as string) === "draft" && <button type="button" onClick={() => void post("/api/mall/ops", { action: "confirmDraftPO", poId: po.id }, "补货单已下达，等待供应商确认")} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-bold text-[var(--accent-ink)]">确认下达</button>}
                      {po.status === "shipped" && <button type="button" onClick={() => void post("/api/mall/ops", { action: "receivePO", poId: po.id }, "已入库，库存已增加")} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-bold text-[var(--accent-ink)]">确认入库</button>}
                      {((po.status as string) === "draft" || po.status === "ordered" || po.status === "confirmed") && <button type="button" onClick={() => void post("/api/mall/ops", { action: "cancelPO", poId: po.id }, "已取消")} className="h-8 rounded-[8px] border border-[var(--line)] px-3 text-xs font-bold text-[var(--muted)]">取消</button>}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-bold text-[var(--muted)]">{po.items.map((item) => `${item.name}×${item.qty}`).join("、")}{po.shipNote ? t("dynLogistics", { x: po.shipNote }) : ""}</div>
                </div>
              ))}
              {(ops?.purchaseOrders ?? []).length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">暂无补货单。</div>}
            </div>
          </div>

          <div className="panel p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase text-[var(--muted)]">月度对账单</span>
              <input type="month" value={statementMonth} onChange={(e) => setStatementMonth(e.target.value)} className="ml-auto h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none" />
              <button type="button" onClick={() => void post("/api/mall/ops", { action: "generateStatement", month: statementMonth }, t("dynStatementGen", { m: statementMonth }))} className="h-9 rounded-[8px] bg-[var(--accent)] px-3.5 text-xs font-bold text-[var(--accent-ink)]">生成对账单</button>
            </div>
            <div className="space-y-2">
              {(ops?.statements ?? []).map((statement) => (
                <div key={statement.id} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <CircleDollarSign size={15} className="text-[var(--muted)]" />
                    <span className="text-sm font-black">{statement.supplierName} · {statement.month}</span>
                    {statusBadge(statement.status, (statementStatusLabel as Record<string, string>)[statement.status] ?? extraStatementLabel[statement.status] ?? statement.status)}
                    <span className="text-xs font-bold text-[var(--muted)]">{statement.lines.length} 笔 · <b>R$ {statement.total.toFixed(2)}</b>{statement.pixKey ? ` · PIX ${statement.pixKey}` : ""}</span>
                    <span className="ml-auto flex gap-1.5">
                      {statement.status === "confirmed" && (
                        <button type="button" onClick={async () => { if (!(await dialog.confirm("标记付款", { message: `确认向供应商「${statement.supplierName}」标记已付款 R$ ${statement.total.toFixed(2)}（${statement.month} 月对账单，${statement.lines.length} 笔）？` }))) return; const note = await dialog.prompt("付款凭证备注", { message: "转账ID等，可空。", placeholder: "如 PIX E2E ID" }); if (note === null) return; void post("/api/mall/ops", { action: "payStatement", statementId: statement.id, receiptNote: note }, "已标记付款"); }} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-bold text-[var(--accent-ink)]">标记已付款</button>
                      )}
                      {(statement.status as string) === "disputed" && (
                        <button type="button" onClick={async () => { if (!(await dialog.confirm("重新打开对账单", { message: `将「${statement.supplierName} · ${statement.month}」重置为待确认，供应商可重新核对。` }))) return; void post("/api/mall/ops", { action: "reopenStatement", statementId: statement.id }, "已重新打开，等待供应商确认"); }} className="h-8 rounded-[8px] border border-[var(--warn)]/50 px-3 text-xs font-bold text-[var(--warn)]">重新打开</button>
                      )}
                      <button type="button" onClick={() => downloadCsv(`statement-${statement.supplierName}-${statement.month}.csv`, ["日期", "订单", "商品", "供货价"], statement.lines.map((line) => [line.date, line.orderId, line.productName, line.supplyPrice.toFixed(2)]))} className="h-8 rounded-[8px] border border-[var(--line)] px-3 text-xs font-bold text-[var(--muted)]">明细 CSV</button>
                    </span>
                  </div>
                  {(statement.status as string) === "disputed" && (statement as SupplierStatement & { disputeNote?: string }).disputeNote && (
                    <div className="mt-1 text-xs font-bold" style={{ color: "var(--warn)" }}>异议原因：{(statement as SupplierStatement & { disputeNote?: string }).disputeNote}</div>
                  )}
                  {statement.paidAt && <div className="mt-1 text-xs font-bold text-[var(--muted)]">{t("dynPaidOn", { d: statement.paidAt })}{statement.receiptNote ? ` · ${statement.receiptNote}` : ""}</div>}
                </div>
              ))}
              {(ops?.statements ?? []).length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">选择月份生成对账单：按「履约订单 × 供货价」自动汇总每个供应商。</div>}
            </div>
          </div>

          <div className="panel p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase text-[var(--muted)]">销售分成 · 月度对账（加盟商）</span>
              <input type="month" value={statementMonth} onChange={(e) => setStatementMonth(e.target.value)} className="ml-auto h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none" />
              <button type="button" onClick={() => void post("/api/mall/ops", { action: "generateRevShareStatement", month: statementMonth }, t("dynShareStatementGen", { m: statementMonth }))} className="h-9 rounded-[8px] bg-[var(--accent)] px-3.5 text-xs font-bold text-[var(--accent-ink)]">生成分成对账单</button>
            </div>
            <div className="space-y-2">
              {(((ops as { revShareStatements?: Array<{ id: string; franchise: string; month: string; status: "draft" | "confirmed" | "paid" | "disputed"; total: number; orders: number; stationShareTotal: number; franchiseNetTotal: number; paidAt?: string; disputeNote?: string }> } | null)?.revShareStatements) ?? []).map((s) => (
                <div key={s.id} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <CircleDollarSign size={15} className="text-[var(--muted)]" />
                    <span className="text-sm font-black">{s.franchise} · {s.month}</span>
                    {statusBadge(s.status, ({ draft: "待加盟商确认", confirmed: "待付款", paid: "已付款", disputed: "有异议" } as Record<string, string>)[s.status] ?? s.status)}
                    <span className="text-xs font-bold text-[var(--muted)]">{s.orders} 单 · 加盟商净 R$ {s.franchiseNetTotal.toFixed(2)} · 站点 R$ {s.stationShareTotal.toFixed(2)} · 合计 <b>R$ {s.total.toFixed(2)}</b></span>
                    {s.status === "confirmed" && (
                      <button type="button" onClick={async () => { if (!(await dialog.confirm("标记付款", { message: `确认向加盟商「${s.franchise}」标记已付款 R$ ${s.total.toFixed(2)}（${s.month} 月分成对账单，${s.orders} 单）？` }))) return; const note = await dialog.prompt("付款凭证备注", { message: "转账ID等，可空。", placeholder: "如 PIX E2E ID" }); if (note === null) return; void post("/api/mall/ops", { action: "payRevShareStatement", statementId: s.id, note }, "已标记付款"); }} className="ml-auto h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-bold text-[var(--accent-ink)]">标记已付款</button>
                    )}
                    {s.status === "disputed" && (
                      <button type="button" onClick={async () => { if (!(await dialog.confirm("重新打开分成对账单", { message: `将「${s.franchise} · ${s.month}」重置为待确认，加盟商可重新核对。` }))) return; void post("/api/mall/ops", { action: "reopenRevShareStatement", statementId: s.id }, "已重新打开，等待加盟商确认"); }} className="ml-auto h-8 rounded-[8px] border border-[var(--warn)]/50 px-3 text-xs font-bold text-[var(--warn)]">重新打开</button>
                    )}
                  </div>
                  {s.status === "disputed" && s.disputeNote && <div className="mt-1 text-xs font-bold" style={{ color: "var(--warn)" }}>异议原因：{s.disputeNote}</div>}
                  {s.paidAt && <div className="mt-1 text-xs font-bold text-[var(--muted)]">{t("dynPaidOn", { d: s.paidAt })}</div>}
                </div>
              ))}
              {(((ops as { revShareStatements?: unknown[] } | null)?.revShareStatements) ?? []).length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">按「已取货订单 × 产品加盟商分成」自动汇总。加盟商在自己后台确认后，这里可标记付款。</div>}
            </div>
          </div>
        </div>
      )}

      {/* ================= 加盟商订货（采购全链路,唯一写操作入口） ================= */}
      {tab === "procurement" && <ProcurementTab />}

      {/* ================= 设置 ================= */}
      {tab === "settings" && (
        <div className="panel max-w-2xl p-5">
          <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">收款配置</div>
          <label className="block text-[11px] font-bold text-[var(--muted)]">公司 PIX 收款 Key（骑手充值 / 混合付款时展示）
            <input value={configDraft.pixKey ?? mall?.pixKey ?? ""} onChange={(e) => setConfigDraft((prev) => ({ ...prev, pixKey: e.target.value }))} placeholder="CNPJ / e-mail / chave aleatória" className="mt-1 h-10 w-full max-w-md rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 font-mono text-sm font-bold outline-none focus:border-[var(--accent)]" />
          </label>
          <button type="button" onClick={() => void post("/api/mall", { action: "setConfig", pixKey: configDraft.pixKey ?? mall?.pixKey ?? "" }, "收款配置已保存")} className="mt-4 h-11 rounded-[8px] bg-[var(--accent)] px-6 text-sm font-bold text-[var(--accent-ink)]">保存</button>

          <div className="mt-5 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <div className="text-sm font-black">积分规则统一在「积分经济」页管理</div>
            <p className="mt-1 text-xs font-bold leading-5 text-[var(--muted)]">完单积分、邀请裂变、生日、Partner 服务积分、金钱等价(R$ ↔ 分)、每日/每月兑换上限、高价值审核阈值等,都已移到 <a href="/points-economy" className="text-[var(--accent)] underline">积分经济</a> 页统一设置(避免两处重复)。</p>
          </div>
          <p className="mt-3 text-xs font-bold text-[var(--muted)]">门面：mall.meponto.com · 统一控制台：mall.meponto.com/admin（运营 / 供应商 / 合作方按角色进入，同一登录）</p>
        </div>
      )}
    </AppShell>
  );
}

/**
 * Product configuration drawer — one product, every knob, section-scoped
 * saves (基本信息 / 定价 / 库存 / 直采 / 危险区). Fixed right panel (420px)
 * with overlay; Esc or overlay click closes. The parent keeps the table
 * mounted underneath, so the list scroll position never resets.
 */
function ProductDrawer({ product, proc, showProcurement, rate, note, onClose, post, dialog }: {
  product: MarketplaceProduct;
  proc?: ProcureProduct;
  showProcurement: boolean;
  rate: number;
  note: { tone: "ok" | "err"; text: string } | null;
  onClose: () => void;
  post: (path: "/api/mall" | "/api/mall/ops" | "/api/mall/procurement", body: Record<string, unknown>, okText?: string) => Promise<unknown>;
  dialog: ReturnType<typeof useDialog>;
}) {
  const [basic, setBasic] = useState({ name: product.name, category: product.category ?? "", imageUrl: product.imageUrl ?? "", description: product.description ?? "" });
  const [price, setPrice] = useState({ points: String(product.pointsPrice || ""), cash: product.cashPriceBRL ? String(product.cashPriceBRL) : "", share: product.franchiseShareBRL ? String(product.franchiseShareBRL) : "" });
  const [stockDraft, setStockDraft] = useState({ stock: String(product.stock), restockThreshold: String(product.restockThreshold ?? 0), purchaseLimit: String(product.purchaseLimit ?? 0) });
  const [procDraft, setProcDraft] = useState<{ mode: ProcureProduct["procurementMode"]; buyout: string }>({ mode: proc?.procurementMode ?? "off", buyout: proc?.franchiseBuyoutPrice ? String(proc.franchiseBuyoutPrice) : "" });

  // Re-seed drafts only when switching to another product (and the procurement
  // block additionally when its payload first arrives) — a section save reloads
  // the payload but must never clobber the other sections' unsaved edits.
  useEffect(() => {
    setBasic({ name: product.name, category: product.category ?? "", imageUrl: product.imageUrl ?? "", description: product.description ?? "" });
    setPrice({ points: String(product.pointsPrice || ""), cash: product.cashPriceBRL ? String(product.cashPriceBRL) : "", share: product.franchiseShareBRL ? String(product.franchiseShareBRL) : "" });
    setStockDraft({ stock: String(product.stock), restockThreshold: String(product.restockThreshold ?? 0), purchaseLimit: String(product.purchaseLimit ?? 0) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);
  useEffect(() => {
    setProcDraft({ mode: proc?.procurementMode ?? "off", buyout: proc?.franchiseBuyoutPrice ? String(proc.franchiseBuyoutPrice) : "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id, proc?.id]);

  // Esc closes the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const draftPoints = Number(price.points) || 0;
  const draftCash = Number(price.cash) || 0;
  const draftShare = Number(price.share) || 0;
  const m = productMargin(product, rate, { points: draftPoints, cash: draftCash, share: draftShare });

  const labelCls = "block text-[11px] font-bold text-[var(--muted)]";
  const inputCls = "mt-1 h-9 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-2.5 text-sm font-bold outline-none focus:border-[var(--accent)]";
  const outlineBtn = "h-9 rounded-[8px] border border-[var(--line)] px-3.5 text-xs font-bold text-[var(--muted)] hover:border-[var(--accent)]";
  const dangerBtn = "h-9 rounded-[8px] border border-[var(--danger)]/40 px-3.5 text-xs font-bold text-[var(--danger)] hover:border-[var(--danger)]";

  async function saveBasic() {
    await post("/api/mall", { action: "updateProduct", productId: product.id, name: basic.name, description: basic.description, imageUrl: basic.imageUrl, category: basic.category }, "基本信息已保存");
  }

  async function savePricing() {
    if (m.margin < 0 && !(await dialog.confirm("负毛利定价确认", { message: `当前定价为负毛利：每单亏损 R$ ${Math.abs(m.margin).toFixed(2)}（收入 R$ ${m.revenue.toFixed(2)} − 成本 R$ ${m.cost.toFixed(2)}）。确认仍要定价上架？`, confirmText: "仍要上架", tone: "danger" }))) return;
    await post("/api/mall", { action: "priceProduct", productId: product.id, pointsPrice: draftPoints, cashPriceBRL: draftCash, franchiseShareBRL: draftShare, status: "active" }, "已定价上架");
  }

  async function saveStock() {
    const newStock = Number(stockDraft.stock) || 0;
    let reason: string | undefined;
    if (newStock !== product.stock) {
      const input = await dialog.prompt("库存变更原因", { message: `库存将由 ${product.stock} 改为 ${newStock}，请填写修改原因（必填，将随库存台账记录）。`, placeholder: "如：盘点修正 / 破损报废…" });
      if (input === null) return;
      if (!input.trim()) { await dialog.alert("库存变更必须填写修改原因"); return; }
      reason = input.trim();
    }
    await post("/api/mall", { action: "updateProduct", productId: product.id, stock: newStock, purchaseLimit: Number(stockDraft.purchaseLimit) || 0, restockThreshold: Number(stockDraft.restockThreshold) || 0, ...(reason ? { reason } : {}) }, "库存配置已保存");
  }

  async function saveProcurement() {
    await post("/api/mall/procurement", { action: "setProductProcurement", productId: product.id, procurementMode: procDraft.mode, franchiseBuyoutPrice: Number(procDraft.buyout) || 0 }, "直采配置已保存");
  }

  async function reviewConsent(approve: boolean) {
    await post("/api/mall/procurement", { action: "reviewProcurementConsent", productId: product.id, approve }, approve ? "已批准直采开放" : "已驳回直采申请");
  }

  async function pauseProduct() {
    await post("/api/mall", { action: "priceProduct", productId: product.id, pointsPrice: product.pointsPrice, cashPriceBRL: product.cashPriceBRL ?? 0, franchiseShareBRL: product.franchiseShareBRL ?? 0, status: "paused" }, "已下架");
  }

  async function removeProduct() {
    if (!(await dialog.confirm("删除商品", { message: `删除商品「${product.name}」？当前库存 ${product.stock}、状态「${productStatusLabel[product.status] ?? product.status}」。删除后不可恢复。`, confirmText: "删除", tone: "danger" }))) return;
    const result = await post("/api/mall", { action: "deleteProduct", productId: product.id }, "已删除");
    if (result !== null) onClose();
  }

  return (
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onMouseDown={onClose} />
      <aside role="dialog" aria-modal="true" aria-label={`配置 ${product.name}`} className="absolute right-0 top-0 flex h-full w-[420px] max-w-[94vw] flex-col border-l border-[var(--line)] bg-[var(--surface)] shadow-2xl">
        {/* ---- 抽屉头 ---- */}
        <div className="flex items-center gap-3 border-b border-[var(--line)] p-4">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-lg">🎁</div>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-black">{product.name}</span>
              {statusBadge(product.status, productStatusLabel[product.status] ?? product.status)}
            </div>
            <div className="mt-0.5 truncate text-[11px] font-bold text-[var(--muted)]">
              {product.supplierName ?? "自营"} · 供货价 R$ {(product.supplyPrice ?? 0).toFixed(2)} · {product.audience === "partner" ? "合作方" : product.audience === "both" ? "骑手+合作方" : "骑手"}{product.isVirtual ? " · 虚拟" : ""} · 周期 {product.deliveryCycleDays ?? 7} 天
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-[var(--line)] text-[var(--muted)] hover:border-[var(--accent)]">
            <X size={16} />
          </button>
        </div>

        {note && (
          <div className={`mx-4 mt-3 rounded-[8px] border px-3 py-2 text-xs font-bold ${note.tone === "ok" ? "border-[var(--success)]/40 bg-[var(--success)]/10 text-[var(--success)]" : "border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)]"}`}>
            {note.text}
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {/* ---- 1. 基本信息 → updateProduct ---- */}
          <section className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">基本信息</div>
            <div className="space-y-2.5">
              <label className={labelCls}>名称
                <input value={basic.name} onChange={(e) => setBasic((prev) => ({ ...prev, name: e.target.value }))} className={inputCls} />
              </label>
              <label className={labelCls}>分类
                <input value={basic.category} onChange={(e) => setBasic((prev) => ({ ...prev, category: e.target.value }))} placeholder="如 Equipamento" className={inputCls} />
              </label>
              <label className={labelCls}>图片 URL
                <input value={basic.imageUrl} onChange={(e) => setBasic((prev) => ({ ...prev, imageUrl: e.target.value }))} placeholder="https://…" className={inputCls} />
              </label>
              {basic.imageUrl.trim() !== "" && (
                <div className="h-24 w-24 overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={basic.imageUrl} alt="预览" className="h-full w-full object-cover" />
                </div>
              )}
              <label className={labelCls}>描述
                <textarea value={basic.description} onChange={(e) => setBasic((prev) => ({ ...prev, description: e.target.value }))} rows={2} className="mt-1 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-sm font-bold outline-none focus:border-[var(--accent)]" />
              </label>
            </div>
            <button type="button" onClick={() => void saveBasic()} className={`mt-3 ${outlineBtn}`}>保存基本信息</button>
          </section>

          {/* ---- 2. 定价 → priceProduct（唯一主按钮） ---- */}
          <section className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">定价</div>
            <div className="grid grid-cols-3 gap-2">
              <label className={labelCls}>积分价
                <input value={price.points} onChange={(e) => setPrice((prev) => ({ ...prev, points: e.target.value }))} inputMode="numeric" className={inputCls} />
              </label>
              <label className={labelCls}>现金差价 R$
                <input value={price.cash} onChange={(e) => setPrice((prev) => ({ ...prev, cash: e.target.value }))} placeholder="0" inputMode="decimal" className={inputCls} />
              </label>
              <label className={labelCls} title="每次成功取货付给取货门店加盟商的固定 R$（销售分成）">加盟分成 R$
                <input value={price.share} onChange={(e) => setPrice((prev) => ({ ...prev, share: e.target.value }))} placeholder="0" inputMode="decimal" className={inputCls} />
              </label>
            </div>
            <div className="mt-2 text-[11px] font-bold leading-5" style={{ color: m.margin < 0 ? "var(--danger)" : "var(--muted)" }}>
              积分折合 R$ {m.pointsAsBrl.toFixed(2)}（{rate} 分 = R$1）· 收入 R$ {m.revenue.toFixed(2)} · 成本 R$ {m.cost.toFixed(2)}（供货 {(product.supplyPrice ?? 0).toFixed(2)} + 分成 {draftShare.toFixed(2)}）· 毛利 <b className="font-black">R$ {m.margin.toFixed(2)}（{m.pct.toFixed(1)}%）</b>{m.margin < 0 ? " ⚠ 负毛利" : ""}
            </div>
            <button type="button" onClick={() => void savePricing()} className="mt-3 h-9 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-bold text-[var(--accent-ink)]">定价上架</button>
          </section>

          {/* ---- 3. 库存 → updateProduct（改库存必填原因，入库存台账） ---- */}
          <section className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">库存</div>
            <div className="grid grid-cols-3 gap-2">
              <label className={labelCls}>当前库存
                <input value={stockDraft.stock} onChange={(e) => setStockDraft((prev) => ({ ...prev, stock: e.target.value }))} inputMode="numeric" className={inputCls} />
              </label>
              <label className={labelCls}>补货阈值（0=不提醒）
                <input value={stockDraft.restockThreshold} onChange={(e) => setStockDraft((prev) => ({ ...prev, restockThreshold: e.target.value }))} inputMode="numeric" className={inputCls} />
              </label>
              <label className={labelCls}>每月限购（0=不限）
                <input value={stockDraft.purchaseLimit} onChange={(e) => setStockDraft((prev) => ({ ...prev, purchaseLimit: e.target.value }))} inputMode="numeric" className={inputCls} />
              </label>
            </div>
            <div className="mt-2 text-[11px] font-bold text-[var(--muted)]">修改库存需填写原因，将随库存台账（不可篡改）记录。</div>
            <button type="button" onClick={() => void saveStock()} className={`mt-3 ${outlineBtn}`}>保存库存配置</button>
          </section>

          {/* ---- 4. 加盟商直采 → setProductProcurement / reviewProcurementConsent（flag 关或 403 时整区隐藏） ---- */}
          {showProcurement && proc && (
            <section className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xs font-black uppercase text-[var(--muted)]">加盟商直采</span>
                {proc.procurementConsent === "approved" ? statusBadge("approved", "供应商已同意") : proc.procurementConsent === "pending" ? statusBadge("pending", "供应商同意待审") : statusBadge("none", "供应商未开放")}
              </div>
              {proc.procurementConsent === "pending" && (
                <div className="mb-3 flex items-center gap-2 rounded-[8px] border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-3 py-2">
                  <span className="flex-1 text-[11px] font-bold text-[var(--warn)]">供应商申请开放直采{proc.suggestedBuyoutPrice > 0 ? `，建议买断价 R$ ${proc.suggestedBuyoutPrice.toFixed(2)}` : ""}</span>
                  <button type="button" onClick={() => void reviewConsent(true)} className="h-8 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-bold text-[var(--muted)] hover:border-[var(--accent)]">批准</button>
                  <button type="button" onClick={() => void reviewConsent(false)} className="h-8 rounded-[8px] border border-[var(--danger)]/40 px-3 text-xs font-bold text-[var(--danger)]">驳回</button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className={labelCls}>采购模式
                  <select value={procDraft.mode} onChange={(e) => setProcDraft((prev) => ({ ...prev, mode: e.target.value as ProcureProduct["procurementMode"] }))} className="mt-1 h-9 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]">
                    {(Object.keys(PROCUREMENT_MODE_LABEL) as Array<ProcureProduct["procurementMode"]>).map((mode) => (
                      <option key={mode} value={mode}>{PROCUREMENT_MODE_LABEL[mode]}</option>
                    ))}
                  </select>
                </label>
                {(procDraft.mode === "buyout" || procDraft.mode === "both") && (
                  <label className={labelCls}>买断价 R$
                    <input value={procDraft.buyout} onChange={(e) => setProcDraft((prev) => ({ ...prev, buyout: e.target.value }))} placeholder={proc.suggestedBuyoutPrice > 0 ? String(proc.suggestedBuyoutPrice) : "0"} inputMode="decimal" className={inputCls} />
                  </label>
                )}
              </div>
              {proc.procurementConsent !== "approved" && <div className="mt-2 text-[11px] font-bold text-[var(--muted)]">供应商商品需先获供应商同意并经总部批准，才能开放直采模式。</div>}
              <button type="button" onClick={() => void saveProcurement()} className={`mt-3 ${outlineBtn}`}>保存直采配置</button>
            </section>
          )}

          {/* ---- 5. 危险区 ---- */}
          <section className="rounded-[10px] border border-[var(--danger)]/40 p-4">
            <div className="mb-3 text-xs font-black uppercase text-[var(--danger)]">危险区</div>
            <div className="flex flex-wrap gap-2">
              {product.status === "active" && <button type="button" onClick={() => void pauseProduct()} className={dangerBtn}>下架商品</button>}
              <button type="button" onClick={() => void removeProduct()} className={dangerBtn}>删除商品</button>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
