"use client";

import { useEffect, useMemo, useState } from "react";
import { useDialog } from "../../components/dialog";
import { downloadCsv } from "../../lib/csv";
import type { MarketplaceProduct } from "../../lib/points";
import { Chip, DataTable, Drawer, ImagePreview, Pager, SearchInput, SectionCard, Skeleton, TodoCard, Toolbar, type DataColumn, type SortState } from "../kit";
import { isLowStock, productMargin, productStatusLabel, PROCUREMENT_MODE_LABEL, statusBadge, useMallAdmin, type ApiPath, type MallMessage, type ProcureProduct } from "./context";

/** 商品与定价 — 待办卡 + Toolbar + DataTable + 配置抽屉（kit 组件）工作台。 */

const PRODUCT_PAGE_SIZE = 20;

export default function ProductsTab() {
  const { loading, mall, products, procure, consentPendingIds, procurementReady, pointsPerBrlRate, pendingPricing, lowStock, priceChangePending, post, load, setMessage, message, navigate, preset, clearPreset } = useMallAdmin();
  const dialog = useDialog();
  /** First load still in flight — "…" cards + Skeleton table, never fake zeros. */
  const booting = loading && !mall;
  const n = (value: string | number) => (booting ? "…" : value);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [productSort, setProductSort] = useState<SortState>(null);
  const [productQuickFilter, setProductQuickFilter] = useState<"" | "consent" | "lowstock">("");
  const [drawerId, setDrawerId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productStatusFilter, setProductStatusFilter] = useState("");
  const [productPage, setProductPage] = useState(1);

  // One-shot presets from the overview todo cards / sidebar deep links.
  useEffect(() => {
    if (!preset) return;
    if (preset === "pending_pricing") { setProductStatusFilter("pending_pricing"); setProductQuickFilter(""); }
    else if (preset === "lowstock") { setProductStatusFilter(""); setProductQuickFilter("lowstock"); }
    else if (preset === "consent") { setProductStatusFilter(""); setProductQuickFilter("consent"); }
    setProductPage(1);
    clearPreset();
  }, [preset, clearPreset]);

  // ---- Keyword + status + quick filter + sort + pagination ----
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

  const drawerProduct = drawerId ? products.find((product) => product.id === drawerId) : undefined;

  // ---- Selection + bulk actions ----
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
          headers: { "Content-Type": "application/json" },
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

  // ---- DataTable 列定义（勾选 / 商品 / 状态 / 库存 / 积分价 / 毛利率 / 分成 / 操作） ----
  const allPageSelected = pagedProducts.length > 0 && pagedProducts.every((product) => selectedIds.has(product.id));
  const productColumns: Array<DataColumn<MarketplaceProduct>> = [
    {
      key: "select",
      className: "w-10",
      label: (
        <input
          type="checkbox"
          aria-label="全选本页"
          checked={allPageSelected}
          onChange={() => {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              for (const product of pagedProducts) { if (allPageSelected) next.delete(product.id); else next.add(product.id); }
              return next;
            });
          }}
          className="h-4 w-4 accent-[var(--accent)]"
        />
      ),
      render: (product) => (
        <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" aria-label={`选择 ${product.name}`} checked={selectedIds.has(product.id)} onChange={() => toggleSelect(product.id)} className="h-4 w-4 accent-[var(--accent)]" />
        </span>
      ),
    },
    {
      key: "product",
      label: "商品",
      sortKey: "name",
      render: (product) => (
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-base">🎁</div>}
          </div>
          <div className="min-w-0">
            <div className="max-w-[260px] truncate text-sm font-black">{product.name}{product.isVirtual ? <span className="ml-1.5 text-[10px] font-bold text-[var(--muted)]">虚拟</span> : null}</div>
            <div className="max-w-[260px] truncate text-[11px] font-bold text-[var(--muted)]">{product.supplierName ?? "自营"}{product.category ? ` · ${product.category}` : ""}</div>
          </div>
        </div>
      ),
    },
    { key: "status", label: "状态", render: (product) => statusBadge(product.status, productStatusLabel[product.status] ?? product.status) },
    {
      key: "stock",
      label: "库存",
      sortKey: "stock",
      render: (product) => {
        const low = isLowStock(product);
        return <span className={`font-black ${low ? "text-[var(--danger)]" : ""}`}>{product.stock}{low ? <span className="ml-1 text-[10px] font-bold">低</span> : null}</span>;
      },
    },
    {
      key: "points",
      label: "积分价",
      sortKey: "points",
      render: (product) => <span className="font-black">{product.pointsPrice > 0 ? product.pointsPrice.toLocaleString() : "—"}{(product.cashPriceBRL ?? 0) > 0 ? <span className="text-[11px] font-bold text-[var(--muted)]"> +R${(product.cashPriceBRL ?? 0).toFixed(2)}</span> : null}</span>,
    },
    {
      key: "margin",
      label: "毛利率",
      sortKey: "margin",
      render: (product) => {
        const m = productMargin(product, pointsPerBrlRate);
        return <span className={`font-black ${m.margin < 0 ? "text-[var(--danger)]" : ""}`}>{product.status === "pending_pricing" ? "—" : `${m.pct.toFixed(1)}%`}</span>;
      },
    },
    { key: "share", label: "加盟分成", render: (product) => ((product.franchiseShareBRL ?? 0) > 0 ? `R$ ${(product.franchiseShareBRL ?? 0).toFixed(2)}` : "—") },
    {
      key: "actions",
      label: "操作",
      align: "right",
      render: (product) => (
        <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => setDrawerId(product.id)} className="h-8 rounded-[8px] border border-[var(--line)] px-3 text-xs font-bold text-[var(--muted)] hover:border-[var(--accent)]">配置</button>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {/* ---- 待办卡：点击即过滤 / 跳转 ---- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <TodoCard label="待定价" value={n(pendingPricing)} tone={pendingPricing > 0 ? "warn" : "neutral"} hint="供应商已提报，等待总部定价" active={productStatusFilter === "pending_pricing" && !productQuickFilter} onClick={() => { setProductStatusFilter("pending_pricing"); setProductQuickFilter(""); setProductPage(1); }} />
        <TodoCard label="待审直采同意" value={n(consentPendingIds.size)} tone={consentPendingIds.size > 0 ? "info" : "neutral"} hint="供应商申请开放直采，待审批" active={productQuickFilter === "consent"} onClick={() => { setProductStatusFilter(""); setProductQuickFilter("consent"); setProductPage(1); }} />
        <TodoCard label="低库存" value={n(lowStock)} tone={lowStock > 0 ? "danger" : "neutral"} hint="在售且库存 ≤ 补货阈值" active={productQuickFilter === "lowstock"} onClick={() => { setProductStatusFilter(""); setProductQuickFilter("lowstock"); setProductPage(1); }} />
        <TodoCard label="调价待批" value={n(priceChangePending)} tone={priceChangePending > 0 ? "warn" : "neutral"} hint="去「补货与对账」处理" onClick={() => navigate("supply")} />
      </div>

      {/* ---- 搜索 + 状态筛选 + 分页 ---- */}
      <Toolbar right={<Pager page={safeProductPage} pages={productPages} total={filteredProducts.length} onPage={setProductPage} />}>
        <SearchInput value={productSearch} onChange={(value) => { setProductSearch(value); setProductPage(1); }} placeholder="搜索商品名 / 供应商 / 分类…" />
        {["", "active", "paused", "pending_pricing"].map((status) => (
          <Chip key={status || "all"} active={productStatusFilter === status && !productQuickFilter} onClick={() => { setProductStatusFilter(status); setProductQuickFilter(""); setProductPage(1); }}>
            {status === "" ? "全部" : productStatusLabel[status]}
          </Chip>
        ))}
        {productQuickFilter && (
          <button type="button" onClick={() => { setProductQuickFilter(""); setProductPage(1); }} className="rounded-full border border-[var(--accent)] bg-[var(--accent)]/10 px-3.5 py-1.5 text-xs font-bold text-[var(--accent)]">
            {productQuickFilter === "consent" ? "待审直采同意" : "低库存"} ✕
          </button>
        )}
      </Toolbar>

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

      {/* ---- 商品表格（kit DataTable；排序 / 行点击开抽屉；首载显示骨架条） ---- */}
      {booting ? (
        <Skeleton rows={8} />
      ) : products.length === 0 ? (
        <div className="panel p-10 text-center text-sm font-bold text-[var(--muted)]">还没有商品——等供应商在供应链后台提报。</div>
      ) : (
        <DataTable
          columns={productColumns}
          rows={pagedProducts}
          rowKey={(product) => product.id}
          onRowClick={(product) => setDrawerId(product.id)}
          sort={productSort}
          onSort={(key) => setProductSort((prev) => (prev?.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 }))}
          minWidth={900}
          empty="没有匹配的商品——换个关键字或状态试试。"
        />
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
  );
}

/**
 * Product configuration drawer — one product, every knob, section-scoped
 * saves (基本信息 / 定价 / 库存 / 直采 / 危险区). Container generalised into
 * the kit Drawer (420px fixed right panel; Esc/overlay closes). The parent
 * keeps the table mounted underneath, so the list scroll never resets.
 */
function ProductDrawer({ product, proc, showProcurement, rate, note, onClose, post, dialog }: {
  product: MarketplaceProduct;
  proc?: ProcureProduct;
  showProcurement: boolean;
  rate: number;
  note: MallMessage;
  onClose: () => void;
  post: (path: ApiPath, body: Record<string, unknown>, okText?: string) => Promise<unknown>;
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
    <Drawer
      open
      onClose={onClose}
      ariaLabel={`配置 ${product.name}`}
      title={(
        <div className="flex items-center gap-3">
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
        </div>
      )}
    >
      <div className="space-y-3">
        {note && (
          <div className={`rounded-[8px] border px-3 py-2 text-xs font-bold ${note.tone === "ok" ? "border-[var(--success)]/40 bg-[var(--success-bg)] text-[var(--success)]" : "border-[var(--danger)]/40 bg-[var(--danger-bg)] text-[var(--danger)]"}`}>
            {note.text}
          </div>
        )}

        {/* ---- 1. 基本信息 → updateProduct ---- */}
        <SectionCard title="基本信息">
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
            <ImagePreview url={basic.imageUrl} size={96} alt={`${product.name} 预览`} />
            <label className={labelCls}>描述
              <textarea value={basic.description} onChange={(e) => setBasic((prev) => ({ ...prev, description: e.target.value }))} rows={2} className="mt-1 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-sm font-bold outline-none focus:border-[var(--accent)]" />
            </label>
          </div>
          <button type="button" onClick={() => void saveBasic()} className={`mt-3 ${outlineBtn}`}>保存基本信息</button>
        </SectionCard>

        {/* ---- 2. 定价 → priceProduct（唯一主按钮） ---- */}
        <SectionCard title="定价">
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
        </SectionCard>

        {/* ---- 3. 库存 → updateProduct（改库存必填原因，入库存台账） ---- */}
        <SectionCard title="库存">
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
        </SectionCard>

        {/* ---- 4. 加盟商直采 → setProductProcurement / reviewProcurementConsent（flag 关或 403 时整区隐藏） ---- */}
        {showProcurement && proc && (
          <SectionCard
            title="加盟商直采"
            right={proc.procurementConsent === "approved" ? statusBadge("approved", "供应商已同意") : proc.procurementConsent === "pending" ? statusBadge("pending", "供应商同意待审") : statusBadge("none", "供应商未开放")}
          >
            {proc.procurementConsent === "pending" && (
              <div className="mb-3 flex items-center gap-2 rounded-[8px] border border-[var(--warn)]/40 bg-[var(--warn-bg)] px-3 py-2">
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
          </SectionCard>
        )}

        {/* ---- 5. 危险区 ---- */}
        <SectionCard title={<span className="text-[var(--danger)]">危险区</span>} className="border-[var(--danger)]/40">
          <div className="flex flex-wrap gap-2">
            {product.status === "active" && <button type="button" onClick={() => void pauseProduct()} className={dangerBtn}>下架商品</button>}
            <button type="button" onClick={() => void removeProduct()} className={dangerBtn}>删除商品</button>
          </div>
        </SectionCard>
      </div>
    </Drawer>
  );
}
