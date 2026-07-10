"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PackagePlus, RefreshCcw, ShoppingBag, ShoppingCart, Store, Wallet } from "lucide-react";
import { AppShell, PageTitle } from "../../components/ui";
import { readSession } from "../../lib/session";
import { useVentoStore } from "../../lib/store";
import { translate, type TranslationKey } from "../../lib/i18n";
import type { MarketplaceOrder, MarketplaceProduct } from "../../lib/points";
import type { FranchisePurchaseOrder, ProcurementDiscrepancy, StationStockBucket } from "../../lib/procurement";
import { Chip, DataTable, Drawer, Pager, SearchInput, SectionCard, Stat, StatusBadge, Toolbar, type BadgeTone, type DataColumn } from "../kit";

/** Franchise mall portal — mall basics (always on) + direct procurement (flagged).
 *
 *  Mall basics — visible regardless of the procurementEnabled flag: overview
 *  stats (in-transit / arrived / delivered today / month revenue share), this
 *  franchise's redemption orders (read-only; fulfillment happens at the station
 *  desk) and the active catalog, both from GET /api/mall?franchise=<name>.
 *
 *  Direct procurement — 选货 → 订货 → 跟单 (docs/franchise-procurement-full-chain-plan.md),
 *  gated behind config.procurementEnabled: deposit SectionCard, catalog card
 *  grid with a cart bar, FPOs as a DataTable with a row-click detail drawer. */

type CatalogRow = {
  id: string; name: string; category?: string; supplierName: string;
  procurementMode: "off" | "consignment" | "buyout" | "both";
  supplyPrice: number; franchiseBuyoutPrice: number; minOrderQty: number; maxOrderQty: number;
};
type Snapshot = {
  config: { procurementEnabled: boolean; procurementFrozen: boolean };
  catalog: CatalogRow[];
  stations: Array<{ id: string; name: string }>;
  fpos: FranchisePurchaseOrder[];
  stock: StationStockBucket[];
  depositBalance: number;
  topUps: Array<{ id: string; amountBRL: number; pixRef: string; status: string; createdAt: string }>;
  discrepancies: ProcurementDiscrepancy[];
};

/** Green = flowing, amber = waiting on a human, red = exception, gray = terminal. */
const statusMeta: Record<string, { key: TranslationKey; tone: BadgeTone }> = {
  submitted: { key: "fpStSubmitted", tone: "warn" },
  approved: { key: "fpStApproved", tone: "success" },
  confirmed: { key: "fpStConfirmed", tone: "success" },
  shipped: { key: "fpStShipped", tone: "success" },
  arrived: { key: "fpStArrived", tone: "success" },
  received: { key: "fpStReceived", tone: "neutral" },
  rejected: { key: "fpStRejected", tone: "danger" },
  cancelled: { key: "fpStCancelled", tone: "neutral" },
};
const topUpMeta: Record<string, { key: TranslationKey; tone: BadgeTone }> = {
  submitted: { key: "fpTuSubmitted", tone: "warn" },
  confirmed: { key: "fpTuConfirmed", tone: "success" },
  rejected: { key: "fpTuRejected", tone: "danger" },
};
/** Mall redemption order lifecycle (same semantics as the station desk). */
const mallStatusMeta: Record<string, { key: TranslationKey; tone: BadgeTone }> = {
  created: { key: "msStCreated", tone: "success" },
  arrived: { key: "msStArrived", tone: "warn" },
  fulfilled: { key: "msStFulfilled", tone: "neutral" },
  cancelled: { key: "msStCancelled", tone: "neutral" },
};
/** Hybrid checkout reconciliation state (cash part of points+cash orders). */
const payStatusMeta: Record<string, { key: TranslationKey; tone: BadgeTone }> = {
  pending: { key: "fmPayPending", tone: "warn" },
  submitted: { key: "fmPaySubmitted", tone: "info" },
  paid: { key: "fmPayPaid", tone: "success" },
};
const ORDER_PAGE_SIZE = 20;

const inputCls = "rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]";
const selectCls = "h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]";
const btnGhost = "h-9 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-50";
const btnDanger = "h-8 rounded-[8px] border border-[var(--danger)]/40 px-3 text-xs font-black text-[var(--danger)]";

export default function MallFranchisePage() {
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
  const session = useMemo(() => readSession(), []);
  const franchise = session?.franchise || session?.organization || "";
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Franchise Admin" }), [session]);

  const [data, setData] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [stationId, setStationId] = useState("");
  const [mode, setMode] = useState<"consignment" | "buyout">("consignment");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpRef, setTopUpRef] = useState("");
  /** FPO opened in the detail drawer (row click). */
  const [activeFpoId, setActiveFpoId] = useState<string | null>(null);

  // ---- Mall basics (always on, flag-independent) ---------------------------
  const [mallOrders, setMallOrders] = useState<MarketplaceOrder[]>([]);
  const [mallProducts, setMallProducts] = useState<MarketplaceProduct[]>([]);
  const [monthShare, setMonthShare] = useState(0);
  const [orderQuery, setOrderQuery] = useState("");
  const [orderStatus, setOrderStatus] = useState<"all" | "created" | "arrived" | "fulfilled" | "cancelled">("all");
  const [orderPage, setOrderPage] = useState(1);
  const [productQuery, setProductQuery] = useState("");
  /** Mall order opened in the read-only detail drawer (row click). */
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/mall/procurement", { headers, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      setData(payload.data as Snapshot);
      if (!stationId && payload.data?.stations?.length) setStationId(payload.data.stations[0].id);
    }
  }, [headers, stationId]);

  useEffect(() => { void load(); }, [load]);

  /** Mall basics: this franchise's redemption orders + the active catalog from
   *  the same /api/mall response (mirrors /mall/station's ?station= usage; the
   *  API strips supplier economics for non-HQ sessions — use the payload
   *  as-is, no extra requests). */
  const loadMall = useCallback(async () => {
    if (!franchise) return;
    const response = await fetch(`/api/mall?franchise=${encodeURIComponent(franchise)}`, { headers, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      setMallOrders((payload.data?.orders ?? []) as MarketplaceOrder[]);
      setMallProducts((payload.data?.products ?? []) as MarketplaceProduct[]);
    }
  }, [headers, franchise]);

  useEffect(() => { void loadMall(); }, [loadMall]);

  // Month revenue share — same pattern as useMallShareSummary in
  // app/franchise/page.tsx: franchise-scoped /api/mall/ops revShareEntries
  // summed for the current month; 403 / no scope degrades silently to 0.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/mall/ops", { headers: { "x-vento-role": session.role ?? "" }, cache: "no-store" });
        if (!response.ok) return; // 403 / not logged in → keep the stat at 0.
        const payload = (await response.json())?.data;
        if (!payload || payload.scope !== "franchise") return;
        const month = new Date().toISOString().slice(0, 7);
        const entries = (payload.revShareEntries ?? []) as Array<{ month?: string; franchiseShareBRL?: number }>;
        const total = entries.filter((entry) => entry.month === month).reduce((sum, entry) => sum + (entry.franchiseShareBRL ?? 0), 0);
        if (!cancelled) setMonthShare(Math.round(total * 100) / 100);
      } catch {
        // Network failure → keep the page working with a zero share stat.
      }
    })();
    return () => { cancelled = true; };
  }, [session]);

  async function post(body: Record<string, unknown>, okText: string) {
    const response = await fetch("/api/mall/procurement", { method: "POST", headers, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const key = payload.errorKey as TranslationKey | undefined;
      setMessage({ tone: "err", text: key ? t(key) : payload.error ?? t("fpActFail", { status: response.status }) });
      return false;
    }
    setMessage({ tone: "ok", text: okText });
    void load();
    return true;
  }

  const catalog = (data?.catalog ?? []).filter((row) => row.procurementMode === "both" || row.procurementMode === mode);
  const cartLines = catalog.filter((row) => (cart[row.id] ?? 0) > 0);
  const cartTotal = cartLines.reduce((sum, row) => sum + (cart[row.id] ?? 0) * (mode === "buyout" ? row.franchiseBuyoutPrice : row.supplyPrice), 0);
  const activeFpo = (data?.fpos ?? []).find((fpo) => fpo.id === activeFpoId) ?? null;
  const procurementOn = data?.config.procurementEnabled === true;

  // ---- Mall basics derived data ---------------------------------------------
  const activeOrder = mallOrders.find((order) => order.id === activeOrderId) ?? null;

  // Overview stats (unfiltered).
  const today = new Date().toISOString().slice(0, 10);
  const statTransit = mallOrders.filter((order) => order.status === "created").length;
  const statArrived = mallOrders.filter((order) => order.status === "arrived").length;
  const statDoneToday = mallOrders.filter((order) => order.status === "fulfilled" && (order.pickedUpAt ?? "").startsWith(today)).length;

  // Orders list: status chip + text search (product / rider / station), 20/page.
  const oq = orderQuery.trim().toLowerCase();
  const filteredOrders = mallOrders.filter((order) =>
    (orderStatus === "all" || order.status === orderStatus) &&
    (!oq ||
      (order.productName ?? order.productId).toLowerCase().includes(oq) ||
      (order.riderName ?? "").toLowerCase().includes(oq) ||
      (order.pickupStoreName ?? order.station ?? "").toLowerCase().includes(oq)));
  const orderPages = Math.max(1, Math.ceil(filteredOrders.length / ORDER_PAGE_SIZE));
  const orderPageSafe = Math.min(orderPage, orderPages);
  const pagedOrders = filteredOrders.slice((orderPageSafe - 1) * ORDER_PAGE_SIZE, orderPageSafe * ORDER_PAGE_SIZE);

  // Active catalog (read-only; supplier economics already stripped for non-HQ).
  const pq = productQuery.trim().toLowerCase();
  const activeProducts = mallProducts.filter((product) =>
    product.status === "active" &&
    (!pq ||
      product.name.toLowerCase().includes(pq) ||
      (product.supplierName ?? "").toLowerCase().includes(pq) ||
      (product.category ?? "").toLowerCase().includes(pq)));

  const mallBadge = (order: MarketplaceOrder) =>
    order.reviewStatus === "pending"
      ? <StatusBadge tone="warn" label={t("dpPendingHq")} />
      : mallStatusMeta[order.status]
        ? <StatusBadge tone={mallStatusMeta[order.status].tone} label={t(mallStatusMeta[order.status].key)} />
        : <StatusBadge tone="neutral" label={order.status} />;

  const mallOrderCols: Array<DataColumn<MarketplaceOrder>> = [
    {
      key: "product", label: t("mkColProduct"), render: (order) => (
        <span className="block min-w-0">
          <span className="block truncate font-black">{order.productName ?? order.productId}</span>
          <span className="font-mono text-[11px] text-[var(--muted)]">{order.id}</span>
        </span>
      ),
    },
    { key: "rider", label: t("mkColRider"), render: (order) => order.riderName ?? "—" },
    { key: "pickup", label: t("fmColPickup"), render: (order) => <span className="text-[var(--muted)]">{order.pickupStoreName ?? order.station ?? "—"}</span> },
    {
      key: "paid", label: t("fmColPaid"), align: "right", render: (order) => (
        <>{order.pointsSpent} {t("dynPts")}{(order.cashDue ?? 0) > 0 ? ` + R$ ${(order.cashDue ?? 0).toFixed(2)}` : ""}</>
      ),
    },
    { key: "status", label: t("mkColStatus"), render: (order) => mallBadge(order) },
    { key: "date", label: t("mkColDate"), render: (order) => <span className="text-[var(--muted)]">{order.createdAt}</span> },
  ];

  const productCols: Array<DataColumn<MarketplaceProduct>> = [
    {
      key: "product", label: t("mkColProduct"), render: (product) => (
        <span className="flex min-w-0 items-center gap-2.5">
          {product.imageUrl
            ? <img src={product.imageUrl} alt={product.name} className="h-9 w-9 shrink-0 rounded-[8px] border border-[var(--line)] object-cover" />
            : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] text-base">🎁</span>}
          <span className="min-w-0">
            <span className="block truncate font-black">{product.name}</span>
            {product.category ? <span className="text-[11px] font-bold text-[var(--muted)]">{product.category}</span> : null}
          </span>
        </span>
      ),
    },
    { key: "supplier", label: t("fpSupplier"), render: (product) => <span className="text-[var(--muted)]">{product.supplierName || "HQ"}</span> },
    {
      key: "points", label: t("fmColPoints"), align: "right", render: (product) => (
        <>{product.pointsPrice} {t("dynPts")}{(product.cashPriceBRL ?? 0) > 0 ? ` + R$ ${(product.cashPriceBRL ?? 0).toFixed(2)}` : ""}</>
      ),
    },
    { key: "stock", label: t("fmColStock"), align: "right", render: (product) => product.stock },
    { key: "share", label: t("fmColShare"), align: "right", render: (product) => ((product.franchiseShareBRL ?? 0) > 0 ? `R$ ${(product.franchiseShareBRL ?? 0).toFixed(2)}` : <span className="text-[var(--muted)]">—</span>) },
    { key: "status", label: t("mkColStatus"), render: () => <StatusBadge tone="success" label={t("fmPdActive")} /> },
  ];

  async function submitOrder() {
    const ok = await post({
      action: "createFPO",
      stationId,
      mode,
      items: cartLines.map((row) => ({ productId: row.id, qty: cart[row.id] })),
    }, t("fpSubmitOk"));
    if (ok) setCart({});
  }

  const statusBadge = (status: string) =>
    statusMeta[status]
      ? <StatusBadge tone={statusMeta[status].tone} label={t(statusMeta[status].key)} />
      : <StatusBadge tone="neutral" label={status} />;

  const fpoCols: Array<DataColumn<FranchisePurchaseOrder>> = [
    { key: "id", label: t("mkColOrder"), render: (fpo) => <span className="font-mono text-xs">{fpo.id}</span> },
    { key: "supplier", label: t("fpSupplier"), render: (fpo) => fpo.supplierName },
    { key: "station", label: t("fpStation"), render: (fpo) => <span className="text-[var(--muted)]">{fpo.stationName}</span> },
    { key: "amount", label: t("mkColAmount"), align: "right", render: (fpo) => <>R$ {fpo.totalBRL.toFixed(2)}</> },
    {
      key: "status", label: t("mkColStatus"), render: (fpo) => (
        <span className="inline-flex items-center gap-1.5">
          <StatusBadge tone="info" label={t(fpo.mode === "buyout" ? "fpModeBuyout" : "fpModeConsignment")} />
          {statusBadge(fpo.status)}
        </span>
      ),
    },
    { key: "date", label: t("mkColDate"), render: (fpo) => <span className="text-[var(--muted)]">{fpo.createdAt.slice(0, 10)}</span> },
    {
      key: "actions", label: t("mkColActions"), align: "right", render: (fpo) => (
        <span className="inline-flex items-center justify-end gap-1.5">
          {fpo.status === "submitted" && (
            <button type="button" onClick={(e) => { e.stopPropagation(); void post({ action: "cancelFPO", fpoId: fpo.id }, t("fpCancelOk")); }} className={btnDanger}>
              {t("fpCancelOrder")}
            </button>
          )}
          <span className="text-xs font-black text-[var(--muted)]">{t("mkView")} ›</span>
        </span>
      ),
    },
  ];

  const stockCols: Array<DataColumn<StationStockBucket>> = [
    { key: "station", label: t("fpStation"), render: (bucket) => <span className="text-[var(--muted)]">{bucket.stationName}</span> },
    { key: "product", label: t("mkColProduct"), render: (bucket) => <span className="font-black">{bucket.productName}</span> },
    { key: "mode", label: t("fpoModeCol"), render: (bucket) => <StatusBadge tone={bucket.mode === "buyout" ? "info" : "neutral"} label={t(bucket.mode === "buyout" ? "fpModeBuyout" : "fpModeConsignment")} /> },
    { key: "qty", label: t("fpOnHand"), align: "right", render: (bucket) => bucket.qty },
    { key: "reserved", label: t("fpReserved"), align: "right", render: (bucket) => (bucket.reserved > 0 ? bucket.reserved : <span className="text-[var(--muted)]">—</span>) },
  ];

  const discrepancyCols: Array<DataColumn<ProcurementDiscrepancy>> = [
    { key: "fpo", label: t("mkColOrder"), render: (d) => <span className="font-mono text-xs">{d.fpoId}</span> },
    { key: "product", label: t("mkColProduct"), render: (d) => d.productName },
    { key: "qty", label: t("ssReceivedQty"), align: "right", render: (d) => <>{d.receivedQty}/{d.orderedQty}</> },
    { key: "resolution", label: t("fpReason"), render: (d) => <span className="text-xs text-[var(--muted)]">{d.kind} → {d.resolution}{d.refundBRL ? ` (R$ ${d.refundBRL.toFixed(2)})` : ""}</span> },
  ];

  return (
    <AppShell>
      <PageTitle
        title={t("fpTitle")}
        eyebrow={t("fpEyebrow", { x: franchise })}
        action={<button type="button" onClick={() => { void load(); void loadMall(); }} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> {t("pfRefresh")}</button>}
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      {/* Mall order detail drawer — read-only timeline / payment / pickup store. */}
      <Drawer
        open={activeOrder !== null}
        onClose={() => setActiveOrderId(null)}
        width={420}
        ariaLabel={t("fmOrderDetail")}
        title={activeOrder ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-black">{activeOrder.id}</span>
            {mallBadge(activeOrder)}
          </div>
        ) : null}
      >
        {activeOrder && (
          <div className="space-y-4">
            <div className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
              <div className="text-[10px] font-black uppercase text-[var(--muted)]">{t("mkColProduct")}</div>
              <div className="mt-0.5 text-sm font-black">{activeOrder.productName ?? activeOrder.productId}</div>
              <div className="mt-0.5 text-[11px] font-bold text-[var(--muted)]">{t("mkColRider")}: {activeOrder.riderName ?? "—"}</div>
            </div>

            {/* Timeline: redeemed → arrived → picked up */}
            <div className="overflow-hidden rounded-[8px] border border-[var(--line)]">
              <table className="w-full text-xs">
                <tbody>
                  {([
                    [t("fmTlCreated"), activeOrder.createdAt],
                    [t("fmTlArrived"), activeOrder.arrivedAt],
                    [t("fmTlPicked"), activeOrder.pickedUpAt],
                  ] as const).map(([label, value], index) => (
                    <tr key={label} className={`font-bold ${index > 0 ? "border-t border-[var(--line)]" : ""}`}>
                      <td className="px-3 py-2 text-[11px] font-black uppercase text-[var(--muted)]">{label}</td>
                      <td className="px-3 py-2 text-right">{value ?? <span className="text-[var(--muted)]">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Payment info */}
            <div className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
              <div className="text-[10px] font-black uppercase text-[var(--muted)]">{t("fmPayInfo")}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-black">
                <span>{activeOrder.pointsSpent} {t("dynPts")}</span>
                {(activeOrder.cashDue ?? 0) > 0 ? (
                  <>
                    <span>+ R$ {(activeOrder.cashDue ?? 0).toFixed(2)}</span>
                    {activeOrder.paymentStatus && payStatusMeta[activeOrder.paymentStatus]
                      ? <StatusBadge tone={payStatusMeta[activeOrder.paymentStatus].tone} label={t(payStatusMeta[activeOrder.paymentStatus].key)} />
                      : null}
                  </>
                ) : (
                  <StatusBadge tone="neutral" label={t("fmPayPointsOnly")} />
                )}
              </div>
            </div>

            {/* Pickup store */}
            <div className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
              <div className="text-[10px] font-black uppercase text-[var(--muted)]">{t("fmPickupStore")}</div>
              <div className="mt-0.5 text-sm font-black">{activeOrder.pickupStoreName ?? activeOrder.station ?? "—"}</div>
            </div>
          </div>
        )}
      </Drawer>

      {/* 商城概览统计 — 无论直采 flag 开关,加盟商都能看到商城基本盘 */}
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label={t("fmStatTransit")} value={String(statTransit)} />
        <Stat label={t("fmStatArrived")} value={String(statArrived)} />
        <Stat label={t("fmStatDoneToday")} value={String(statDoneToday)} />
        <Stat label={t("fmStatShare")} value={`R$ ${monthShare.toFixed(2)}`} />
      </div>

      {/* 商城订单(本加盟商) — 只读;履约操作在站点端 */}
      <SectionCard
        title={<span className="inline-flex items-center gap-2"><Store size={14} /> {t("fmOrders")}（{filteredOrders.length}）</span>}
        desc={t("fmOrdersDesc")}
        className="mb-4"
      >
        <div className="mb-3">
          <Toolbar right={<Pager page={orderPageSafe} pages={orderPages} total={filteredOrders.length} onPage={setOrderPage} />}>
            <SearchInput value={orderQuery} onChange={(value) => { setOrderQuery(value); setOrderPage(1); }} placeholder={t("fmSearchPh")} />
            {([
              ["all", t("fmChipAll")],
              ["created", t("msStCreated")],
              ["arrived", t("msStArrived")],
              ["fulfilled", t("msStFulfilled")],
              ["cancelled", t("msStCancelled")],
            ] as const).map(([key, label]) => (
              <Chip key={key} active={orderStatus === key} onClick={() => { setOrderStatus(key); setOrderPage(1); }}>{label}</Chip>
            ))}
          </Toolbar>
        </div>
        <DataTable
          columns={mallOrderCols}
          rows={pagedOrders}
          rowKey={(order) => order.id}
          onRowClick={(order) => setActiveOrderId(order.id)}
          minWidth={820}
          empty={t("fpNoData")}
        />
      </SectionCard>

      {/* 在售商品目录 — 只读(非 HQ 会话服务端已剥离供货价等敏感字段) */}
      <SectionCard
        title={<span className="inline-flex items-center gap-2"><ShoppingBag size={14} /> {t("fmCatalog")}（{activeProducts.length}）</span>}
        desc={t("fmCatalogDesc")}
        className="mb-4"
        right={<SearchInput value={productQuery} onChange={setProductQuery} placeholder={t("fmSearchProdPh")} />}
      >
        <DataTable columns={productCols} rows={activeProducts} rowKey={(product) => product.id} minWidth={820} empty={t("fpNoData")} />
      </SectionCard>

      {/* FPO detail drawer — PIX guidance for pending rows lives here. */}
      <Drawer
        open={activeFpo !== null}
        onClose={() => setActiveFpoId(null)}
        width={460}
        ariaLabel={t("fpOrderDetail")}
        title={activeFpo ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-black">{activeFpo.id}</span>
            <StatusBadge tone="info" label={t(activeFpo.mode === "buyout" ? "fpModeBuyout" : "fpModeConsignment")} />
            {statusBadge(activeFpo.status)}
          </div>
        ) : null}
      >
        {activeFpo && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                <div className="text-[10px] font-black uppercase text-[var(--muted)]">{t("fpStation")}</div>
                <div className="mt-0.5 text-sm font-black">{activeFpo.stationName}</div>
              </div>
              <div className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                <div className="text-[10px] font-black uppercase text-[var(--muted)]">{t("fpSupplier")}</div>
                <div className="mt-0.5 text-sm font-black">{activeFpo.supplierName}</div>
              </div>
            </div>

            <div className="overflow-hidden rounded-[8px] border border-[var(--line)]">
              <table className="w-full text-xs">
                <thead><tr className="bg-[var(--surface-raised)] text-left font-black uppercase text-[var(--muted)]"><th className="px-3 py-1.5">{t("mkColProduct")}</th><th className="px-3 py-1.5 text-right">{t("fpQty")}</th><th className="px-3 py-1.5 text-right">{t("ssReceivedQty")}</th></tr></thead>
                <tbody>
                  {activeFpo.items.map((item) => (
                    <tr key={item.productId} className="border-t border-[var(--line)] font-bold">
                      <td className="px-3 py-1.5">{item.name}</td>
                      <td className="px-3 py-1.5 text-right">{item.qty}</td>
                      <td className="px-3 py-1.5 text-right">{item.receivedQty !== undefined ? item.receivedQty : <span className="text-[var(--muted)]">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
              <span className="text-[11px] font-black uppercase text-[var(--muted)]">{t("fpTotal")}</span>
              <span className="text-xl font-black">R$ {activeFpo.totalBRL.toFixed(2)}</span>
            </div>

            <div className="text-[11px] font-bold text-[var(--muted)]">
              {activeFpo.createdAt}
              {activeFpo.shipNote ? t("dynLogistics", { x: activeFpo.shipNote }) : ""}
            </div>

            {activeFpo.status === "submitted" && (
              <>
                {activeFpo.mode === "buyout" && (
                  <div className="rounded-[10px] border border-[var(--warn)]/40 bg-[var(--warn-bg)] p-4">
                    <div className="text-[11px] font-black uppercase text-[var(--warn)]">{t("fpPixGuide")}</div>
                    <p className="mt-1 text-xs font-bold text-[var(--text)]">{t("fpPixGuideBody")}</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { const fpoId = activeFpo.id; setActiveFpoId(null); void post({ action: "cancelFPO", fpoId }, t("fpCancelOk")); }}
                  className="h-10 w-full rounded-[8px] border border-[var(--danger)]/40 px-3 text-xs font-black text-[var(--danger)]"
                >{t("fpCancelOrder")}</button>
              </>
            )}
          </div>
        )}
      </Drawer>

      {/* 直采区 — 保持现状 flag 门控;flag 关闭时整体隐藏,只留一行淡色说明 */}
      {data && !procurementOn && (
        <div className="panel p-4 text-sm font-bold text-[var(--muted)]">{t("fmProcClosed")}</div>
      )}
      {procurementOn && (<>
      {/* 押金余额 + 充值 — 直采区顶部 SectionCard */}
      <SectionCard title={<span className="inline-flex items-center gap-2"><Wallet size={14} /> {t("fpDeposit")}</span>} className="mb-4">
        <div className="grid gap-5 lg:grid-cols-[minmax(240px,320px)_1fr]">
          <div>
            <div className="text-4xl font-black tracking-tight">R$ {(data?.depositBalance ?? 0).toFixed(2)}</div>
            <div className="mt-4 space-y-3">
              <label className="block text-[11px] font-black text-[var(--muted)]">{t("fpTopUpAmount")}
                <input value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} placeholder={t("fpTopUpAmount")} className={`mt-1.5 h-10 w-full ${inputCls}`} />
              </label>
              <label className="block text-[11px] font-black text-[var(--muted)]">{t("fpTopUpRef")}
                <input value={topUpRef} onChange={(e) => setTopUpRef(e.target.value)} placeholder={t("fpTopUpRef")} className={`mt-1.5 h-10 w-full ${inputCls}`} />
              </label>
              <button
                type="button"
                onClick={() => void post({ action: "requestDepositTopUp", amountBRL: Number(topUpAmount), pixRef: topUpRef }, t("fpTopUpOk")).then((ok) => { if (ok) { setTopUpAmount(""); setTopUpRef(""); } })}
                className={`${btnGhost} w-full uppercase`}
              >
                {t("fpTopUpSend")}
              </button>
            </div>
          </div>
          <div>
            <div className="mb-2 text-[11px] font-black uppercase text-[var(--muted)]">{t("fpRecentTopUps")}</div>
            <div className="overflow-hidden rounded-[8px] border border-[var(--line)]">
              <table className="w-full text-xs">
                <thead><tr className="bg-[var(--surface-raised)] text-left font-black uppercase text-[var(--muted)]"><th className="px-3 py-1.5">{t("mkColAmount")}</th><th className="px-3 py-1.5">{t("fpTopUpRef")}</th><th className="px-3 py-1.5">{t("mkColStatus")}</th><th className="px-3 py-1.5">{t("mkColDate")}</th></tr></thead>
                <tbody>
                  {(data?.topUps ?? []).slice(0, 6).map((topUp) => (
                    <tr key={topUp.id} className="border-t border-[var(--line)] font-bold">
                      <td className="px-3 py-1.5">R$ {topUp.amountBRL.toFixed(2)}</td>
                      <td className="px-3 py-1.5 font-mono text-[var(--muted)]">{topUp.pixRef}</td>
                      <td className="px-3 py-1.5">{topUpMeta[topUp.status] ? <StatusBadge tone={topUpMeta[topUp.status].tone} label={t(topUpMeta[topUp.status].key)} /> : <StatusBadge tone="neutral" label={topUp.status} />}</td>
                      <td className="px-3 py-1.5 text-[var(--muted)]">{topUp.createdAt.slice(0, 10)}</td>
                    </tr>
                  ))}
                  {(data?.topUps ?? []).length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-4 text-center font-bold text-[var(--muted)]">{t("fpNoData")}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* 选货目录 — 卡片网格 + 底部购物车小计条 */}
      <SectionCard
        title={<span className="inline-flex items-center gap-2"><ShoppingCart size={14} /> {t("fpCatalog")}</span>}
        className="mb-4"
        right={
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <label>{t("fpModePick")}</label>
            <select value={mode} onChange={(e) => { setMode(e.target.value === "buyout" ? "buyout" : "consignment"); setCart({}); }} className={selectCls}>
              <option value="consignment">{t("fpModeConsignment")}</option>
              <option value="buyout">{t("fpModeBuyout")}</option>
            </select>
            <label>{t("fpStationPick")}</label>
            <select value={stationId} onChange={(e) => setStationId(e.target.value)} className={selectCls}>
              {(data?.stations ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        }
      >
        {catalog.length === 0 ? (
          <div className="py-6 text-center text-sm font-bold text-[var(--muted)]">{t("fpNoData")}</div>
        ) : (
          <div className="max-h-[560px] overflow-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {catalog.map((row) => {
                const price = mode === "buyout" ? row.franchiseBuyoutPrice : row.supplyPrice;
                const qty = cart[row.id] ?? 0;
                return (
                  <div key={row.id} className={`flex flex-col rounded-[12px] border p-3 transition-colors ${qty > 0 ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--line)] bg-[var(--surface-raised)]"}`}>
                    <div className="grid h-20 place-items-center rounded-[8px] border border-[var(--line)] bg-[var(--surface)] text-2xl">🎁</div>
                    <div className="mt-2.5 min-w-0">
                      <div className="truncate text-sm font-black">{row.name}</div>
                      <div className="truncate text-[11px] font-bold text-[var(--muted)]">{t("fpSupplier")}: {row.supplierName || "HQ"}</div>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div className="text-[11px] font-bold text-[var(--muted)]">
                        <div>{t("fpDistPrice")} {row.supplyPrice.toFixed(2)}</div>
                        <div className="text-sm font-black text-[var(--text)]">{t("fpYourPrice")} <span className="text-[var(--accent)]">R$ {price.toFixed(2)}</span></div>
                      </div>
                      <div className="text-right text-[10px] font-bold text-[var(--muted)]">{t("fpMinQty", { n: row.minOrderQty })}{row.maxOrderQty > 0 ? ` / ≤${row.maxOrderQty}` : ""}</div>
                    </div>
                    <label className="mt-2.5 flex items-center justify-between gap-2 text-[11px] font-black text-[var(--muted)]">
                      {t("fpQty")}
                      <input
                        type="number" min={0} max={row.maxOrderQty > 0 ? row.maxOrderQty : undefined}
                        value={qty}
                        onChange={(e) => setCart((prev) => ({ ...prev, [row.id]: Math.max(0, Math.trunc(Number(e.target.value) || 0)) }))}
                        className={`h-10 w-24 text-center ${inputCls}`}
                        aria-label={`${row.name} ${t("fpQty")}`}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* 购物车小计条 — 固定在目录区底部；提交按钮是本页唯一黄色主按钮 */}
        <div className="sticky bottom-0 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm font-black">
          <span>{t("fpCart")}: {t("fpItems", { n: cartLines.length })} ｜ {t("fpTotal")} <span className="text-[var(--accent)]">R$ {cartTotal.toFixed(2)}</span></span>
          <button
            type="button"
            disabled={cartLines.length === 0 || !stationId}
            onClick={() => void submitOrder()}
            className="inline-flex h-10 items-center gap-1.5 rounded-[8px] bg-[var(--accent)] px-5 text-xs font-black uppercase text-[var(--accent-ink)] disabled:opacity-40"
          >
            <PackagePlus size={13} /> {t("fpSubmit")}
          </button>
        </div>
      </SectionCard>

      {/* 我的订货单 */}
      <div className="mb-4">
        <div className="mb-2 text-xs font-black uppercase text-[var(--muted)]">{t("fpMyOrders")}（{(data?.fpos ?? []).length}）</div>
        <DataTable
          columns={fpoCols}
          rows={data?.fpos ?? []}
          rowKey={(fpo) => fpo.id}
          onRowClick={(fpo) => setActiveFpoId(fpo.id)}
          minWidth={880}
          empty={t("fpNoData")}
        />
      </div>

      {/* 站点库存 + 差异 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-black uppercase text-[var(--muted)]">{t("fpStock")}</div>
          <DataTable columns={stockCols} rows={data?.stock ?? []} rowKey={(bucket) => `${bucket.stationId}-${bucket.productId}-${bucket.mode}`} minWidth={520} empty={t("fpNoData")} />
        </div>
        <div>
          <div className="mb-2 text-xs font-black uppercase text-[var(--muted)]">{t("fpDiscrepancies")}</div>
          <DataTable columns={discrepancyCols} rows={data?.discrepancies ?? []} rowKey={(d) => d.id} minWidth={520} empty={t("fpNoData")} />
        </div>
      </div>
      </>)}
    </AppShell>
  );
}
