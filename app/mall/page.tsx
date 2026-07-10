"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { Banknote, BarChart3, Boxes, LayoutGrid, Package, RefreshCcw, Settings2, ShoppingBag, Truck } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
import type { MarketplaceOrder } from "../lib/points";
import type { CashTopUp } from "../lib/mall-ops";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";
import ProcurementTab from "./procurement-tab";
import { MallAdminContext, isLowStock, type ApiPath, type MallAdminContextValue, type MallMessage, type MallPayload, type OpsPayload, type ProcurePayload, type TabId, type TabPreset } from "./tabs/context";
import OverviewTab from "./tabs/overview";
import ProductsTab from "./tabs/products";
import MerchTab from "./tabs/merch";
import OrdersTab from "./tabs/orders";
import PaymentsTab from "./tabs/payments";
import SupplyTab from "./tabs/supply";
import SettingsTab from "./tabs/settings";

/**
 * PontoMall back office (mall.meponto.com/admin → /mall) — the independent
 * mall workspace. This file is only the shell: payload loading (/api/mall,
 * /api/mall/ops, /api/mall/procurement), the grouped sidebar navigation
 * (URL-addressable via ?tab=), and the message bar. Each business surface
 * lives in app/mall/tabs/*.
 */

const TAB_IDS: TabId[] = ["overview", "products", "merch", "orders", "payments", "supply", "procurement", "settings"];

type NavItem = { id: TabId; label: string; icon: typeof BarChart3 };
type NavGroup = { label: string | null; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  { label: "运营", items: [
    { id: "overview", label: "总览", icon: BarChart3 },
    { id: "products", label: "商品", icon: ShoppingBag },
    { id: "merch", label: "分类与营销", icon: LayoutGrid },
  ] },
  { label: "履约", items: [{ id: "orders", label: "订单", icon: Package }] },
  { label: "资金", items: [{ id: "payments", label: "收款与充值", icon: Banknote }] },
  { label: "供应链", items: [{ id: "supply", label: "补货与对账", icon: Truck }] },
  { label: null, items: [
    { id: "procurement", label: "直采", icon: Boxes },
    { id: "settings", label: "设置", icon: Settings2 },
  ] },
];

const TAB_COMPONENTS: Record<TabId, ComponentType> = {
  overview: OverviewTab,
  products: ProductsTab,
  merch: MerchTab,
  orders: OrdersTab,
  payments: PaymentsTab,
  supply: SupplyTab,
  procurement: ProcurementTab,
  settings: SettingsTab,
};

export default function MallAdminPage() {
  const language = useVentoStore((s) => s.language);
  const t = useCallback((k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  }, [language]);
  const headers = useMemo(() => ({ "Content-Type": "application/json" }), []);

  const [tab, setTab] = useState<TabId>("overview");
  const [preset, setPreset] = useState<TabPreset>(null);
  const [mall, setMall] = useState<MallPayload | null>(null);
  const [ops, setOps] = useState<OpsPayload | null>(null);
  const [procure, setProcure] = useState<ProcurePayload | null>(null);
  const [message, setMessage] = useState<MallMessage>(null);

  // ---- URL addressability: ?tab=… (default overview, matching the old page) ----
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab") as TabId | null;
    if (wanted && TAB_IDS.includes(wanted)) setTab(wanted);
  }, []);

  const navigate = useCallback((next: TabId, nextPreset: TabPreset = null) => {
    setTab(next);
    setPreset(nextPreset);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  }, []);

  const clearPreset = useCallback(() => setPreset(null), []);

  // ---- Data plumbing ----
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

  const post = useCallback(async (path: ApiPath, body: Record<string, unknown>, okText?: string) => {
    const response = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? t("dynReqFail", { s: response.status }) });
      return null;
    }
    if (okText) setMessage({ tone: "ok", text: okText });
    void load();
    return payload.data;
  }, [headers, load, t]);

  /**
   * Optimistic mutation for high-frequency ops actions: patch the local
   * record first, roll back on failure, and re-run a silent load() on
   * success so the server stays the source of truth.
   */
  const optimisticPost = useCallback(async (path: Exclude<ApiPath, "/api/mall/procurement">, body: Record<string, unknown>, okText: string, apply: () => void, rollback: () => void) => {
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
  }, [headers, load, t]);

  const patchOrder = useCallback((orderId: string, patch: Partial<MarketplaceOrder>) => {
    setMall((prev) => (prev ? { ...prev, orders: prev.orders.map((o) => (o.id === orderId ? { ...o, ...patch } : o)) } : prev));
  }, []);

  const patchTopUp = useCallback((topUpId: string, patch: Partial<CashTopUp>) => {
    setOps((prev) => (prev ? { ...prev, topUps: prev.topUps.map((u) => (u.id === topUpId ? { ...u, ...patch } : u)) } : prev));
  }, []);

  // ---- Shared derived data (sidebar badges + overview + products) ----
  const products = useMemo(() => mall?.products ?? [], [mall]);
  /** Money equivalence reference: how many points ≈ R$1 (from GET /api/mall config). */
  const pointsPerBrlRate = mall?.config?.pointsPerBrl || 10;
  const suppliers = useMemo(() => [...new Set(products.map((product) => product.supplierName).filter(Boolean))] as string[], [products]);
  const procurementReady = procure?.config?.procurementEnabled === true;
  const consentPendingIds = useMemo(
    () => new Set(procurementReady ? (procure?.products ?? []).filter((p) => p.procurementConsent === "pending").map((p) => p.id) : []),
    [procure, procurementReady],
  );
  const pendingPricing = products.filter((product) => product.status === "pending_pricing").length;
  const lowStock = products.filter((product) => product.status === "active" && isLowStock(product)).length;
  const priceChangePending = (ops?.priceChanges ?? []).filter((row) => row.status === "pending").length;
  const payablePending = (ops?.statements ?? []).filter((statement) => statement.status === "confirmed").reduce((sum, statement) => sum + statement.total, 0);

  /** Pending-work badge per nav item (待定价 / 待核销 / 调价待批 / 直采待审). */
  const navBadges: Partial<Record<TabId, number>> = {
    products: pendingPricing,
    payments: ops?.summary?.pendingPayments ?? 0,
    supply: priceChangePending,
    procurement: consentPendingIds.size,
  };

  const context: MallAdminContextValue = {
    mall, ops, procure, setMall, setOps,
    message, setMessage, load, post, optimisticPost, patchOrder, patchTopUp, t,
    tab, navigate, preset, clearPreset,
    products, suppliers, pointsPerBrlRate,
    pendingPricing, lowStock, priceChangePending, payablePending, consentPendingIds, procurementReady,
  };

  const ActiveTab = TAB_COMPONENTS[tab];

  return (
    <AppShell>
      <PageTitle title="PontoMall 商城后台" eyebrow="PontoMall" />
      <p className="-mt-3 mb-5 text-sm font-bold text-[var(--muted)]">商品、运营、履约、收款与供应链——商城业务的独立工作台。</p>

      {message && (
        <div className={`mb-4 rounded-[10px] border px-4 py-3 text-sm font-bold ${message.tone === "ok" ? "border-[var(--success)]/40 bg-[var(--success-bg)] text-[var(--success)]" : "border-[var(--danger)]/40 bg-[var(--danger-bg)] text-[var(--danger)]"}`}>
          {message.text}
        </div>
      )}

      <div className="flex items-start gap-5">
        {/* ---- 分组侧栏（sticky；窄屏折叠成图标） ---- */}
        <aside className="sticky top-4 w-12 shrink-0 space-y-4 lg:w-48">
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label ?? `group-${gi}`}>
              {group.label && <div className="mb-1.5 hidden px-2 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)] lg:block">{group.label}</div>}
              <div className="space-y-1">
                {group.items.map(({ id, label, icon: Icon }) => {
                  const active = tab === id;
                  const badge = navBadges[id] ?? 0;
                  return (
                    <button
                      key={id}
                      type="button"
                      title={label}
                      onClick={() => navigate(id)}
                      className={`relative flex h-9 w-full items-center gap-2.5 rounded-[8px] border px-0 text-[13px] font-bold transition-colors lg:px-3 ${active ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]" : "border-transparent text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"}`}
                    >
                      <span className="grid w-12 shrink-0 place-items-center lg:w-auto"><Icon size={15} /></span>
                      <span className="hidden truncate lg:inline">{label}</span>
                      {badge > 0 && (
                        <>
                          <span className={`ml-auto hidden min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-black lg:inline-block ${active ? "bg-[var(--accent-ink)]/15 text-[var(--accent-ink)]" : "bg-[var(--danger)] text-white"}`}>{badge}</span>
                          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--danger)] lg:hidden" />
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <button type="button" onClick={() => void load()} className="flex h-9 w-full items-center gap-2.5 rounded-[8px] border border-[var(--line)] px-0 text-[13px] font-bold text-[var(--muted)] transition-colors hover:border-[var(--accent)] lg:px-3">
            <span className="grid w-12 shrink-0 place-items-center lg:w-auto"><RefreshCcw size={14} /></span>
            <span className="hidden lg:inline">刷新</span>
          </button>
        </aside>

        {/* ---- 工作区 ---- */}
        <div className="min-w-0 flex-1">
          <MallAdminContext.Provider value={context}>
            <ActiveTab />
          </MallAdminContext.Provider>
        </div>
      </div>
    </AppShell>
  );
}
