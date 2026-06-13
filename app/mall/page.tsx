"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, BarChart3, Boxes, CheckCircle2, CircleDollarSign, LayoutGrid, Package, RefreshCcw, Settings2, ShoppingBag, Truck, XCircle } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import { downloadCsv } from "../lib/csv";
import type { MarketplaceOrder, MarketplaceProduct } from "../lib/points";
import type { MallConfig } from "../lib/mall";
import type { MallBanner, MallCategory, MallPayment, PriceChangeRequest, PurchaseOrder, SupplierStatement } from "../lib/mall-ops";
import { paymentStatusLabel, poStatusLabel, statementStatusLabel } from "../lib/mall-ops";

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
  priceChanges: PriceChangeRequest[];
  purchaseOrders: PurchaseOrder[];
  statements: SupplierStatement[];
  payments: MallPayment[];
  summary: { orders: number; pointsGmv: number; cashGmv: number; pendingPayments: number; daily: Array<{ date: string; count: number }> };
};

const orderStatusLabel: Record<string, string> = { created: "在途", arrived: "已到站", fulfilled: "已交付", cancelled: "已取消" };
const productStatusLabel: Record<string, string> = { active: "已上架", paused: "已下架", pending_pricing: "待定价" };
const payChipTone: Record<string, string> = { pending: "#b3540a", submitted: "#9a7400", paid: "#1d7a3e" };

const TABS = [
  { id: "overview", label: "总览", icon: BarChart3 },
  { id: "products", label: "商品与定价", icon: ShoppingBag },
  { id: "merch", label: "分类与Banner", icon: LayoutGrid },
  { id: "orders", label: "订单履约", icon: Package },
  { id: "payments", label: "收款核销", icon: Banknote },
  { id: "supply", label: "供应链", icon: Truck },
  { id: "settings", label: "设置", icon: Settings2 },
] as const;


function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel p-4">
      <div className="text-[11px] font-black uppercase text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] font-bold text-[var(--muted)]">{hint}</div>}
    </div>
  );
}

export default function MallAdminPage() {
  const headers = useMemo(() => ({ "Content-Type": "application/json" }), []);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("overview");
  const [mall, setMall] = useState<MallPayload | null>(null);
  const [ops, setOps] = useState<OpsPayload | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, { points: string; cash: string }>>({});
  const [editOpen, setEditOpen] = useState("");
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [categoryName, setCategoryName] = useState("");
  const [bannerDraft, setBannerDraft] = useState({ title: "", imageUrl: "", href: "" });
  const [orderFilter, setOrderFilter] = useState("");
  const [poSupplier, setPoSupplier] = useState("");
  const [poItems, setPoItems] = useState<Record<string, string>>({});
  const [statementMonth, setStatementMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  });
  const [configDraft, setConfigDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [mallRes, opsRes] = await Promise.all([
      fetch("/api/mall", { headers, cache: "no-store" }),
      fetch("/api/mall/ops", { headers, cache: "no-store" }),
    ]);
    if (mallRes.ok) setMall((await mallRes.json()).data);
    if (opsRes.ok) setOps((await opsRes.json()).data);
  }, [headers]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4500);
    return () => clearTimeout(timer);
  }, [message]);

  async function post(path: "/api/mall" | "/api/mall/ops", body: Record<string, unknown>, okText?: string) {
    const response = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? `请求失败 (${response.status})` });
      return null;
    }
    if (okText) setMessage({ tone: "ok", text: okText });
    void load();
    return payload.data;
  }

  const products = mall?.products ?? [];
  const orders = (mall?.orders ?? []).filter((order) => !orderFilter || order.status === orderFilter);
  const suppliers = useMemo(() => [...new Set(products.map((product) => product.supplierName).filter(Boolean))] as string[], [products]);
  const summary = ops?.summary;
  const pendingPricing = products.filter((product) => product.status === "pending_pricing").length;
  const lowStock = products.filter((product) => product.status === "active" && product.stock <= 3).length;
  const payablePending = (ops?.statements ?? []).filter((statement) => statement.status === "confirmed").reduce((sum, statement) => sum + statement.total, 0);
  const maxDaily = Math.max(1, ...(summary?.daily ?? []).map((day) => day.count));

  return (
    <AppShell>
      <PageTitle title="PontoMall 商城后台" eyebrow="PontoMall" />
      <p className="-mt-3 mb-5 text-sm font-bold text-[var(--muted)]">商品、运营、履约、收款与供应链——商城业务的独立工作台。</p>

      {message && (
        <div className="mb-4 rounded-[10px] border px-4 py-3 text-sm font-bold" style={message.tone === "ok" ? { borderColor: "rgba(29,122,62,.4)", background: "rgba(29,122,62,.08)", color: "#1d7a3e" } : { borderColor: "rgba(196,66,59,.4)", background: "rgba(196,66,59,.08)", color: "#c4423b" }}>
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
            className={`inline-flex h-10 items-center gap-2 rounded-[10px] border px-4 text-[13px] font-black transition-colors ${tab === id ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent)]"}`}
          >
            <Icon size={15} /> {label}
            {id === "payments" && (summary?.pendingPayments ?? 0) > 0 && <span className="rounded-full bg-[#e2554d] px-1.5 text-[10px] font-black text-white">{summary?.pendingPayments}</span>}
            {id === "supply" && (ops?.priceChanges ?? []).some((row) => row.status === "pending") && <span className="h-2 w-2 rounded-full bg-[#e2554d]" />}
          </button>
        ))}
        <button type="button" onClick={() => void load()} className="ml-auto inline-flex h-10 items-center gap-2 rounded-[10px] border border-[var(--line)] px-4 text-[13px] font-black text-[var(--muted)] hover:border-[var(--accent)]">
          <RefreshCcw size={14} /> 刷新
        </button>
      </div>

      {/* ================= 总览 ================= */}
      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="兑换单数" value={String(summary?.orders ?? 0)} hint="非取消的全部订单" />
            <Stat label="积分 GMV" value={`${(summary?.pointsGmv ?? 0).toLocaleString()} 分`} hint="累计消耗积分" />
            <Stat label="现金 GMV（已核销）" value={`R$ ${(summary?.cashGmv ?? 0).toFixed(2)}`} hint="PIX 补差实收" />
            <Stat label="待核销收款" value={String(summary?.pendingPayments ?? 0)} hint="骑手已提交凭证" />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="待定价商品" value={String(pendingPricing)} hint="供应商已报价待上架" />
            <Stat label="低库存商品" value={String(lowStock)} hint="在售且库存 ≤ 3" />
            <Stat label="待付对账单" value={`R$ ${payablePending.toFixed(2)}`} hint="供应商已确认待付款" />
            <Stat label="调价待审批" value={String((ops?.priceChanges ?? []).filter((row) => row.status === "pending").length)} hint="供应链 Tab 处理" />
          </div>

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
              <thead><tr className="text-left text-[11px] font-black uppercase text-[var(--muted)]"><th className="py-2">供应商</th><th>履约件数</th><th>应付金额</th></tr></thead>
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

      {/* ================= 商品与定价 ================= */}
      {tab === "products" && (
        <div className="space-y-3">
          {products.length === 0 && <div className="panel p-10 text-center text-sm font-bold text-[var(--muted)]">还没有商品——等供应商在供应链后台提报。</div>}
          {products.map((product) => {
            const draft = priceDrafts[product.id] ?? { points: String(product.pointsPrice || ""), cash: product.cashPriceBRL ? String(product.cashPriceBRL) : "" };
            const editing = editOpen === product.id;
            return (
              <div key={product.id} className="panel p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-xl">🎁</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black">{product.name}</span>
                      <Badge value={productStatusLabel[product.status] ?? product.status} />
                      {product.isVirtual && <Badge value="虚拟" />}
                      {product.category && <span className="tag">{product.category}</span>}
                    </div>
                    <div className="mt-0.5 text-xs font-bold text-[var(--muted)]">
                      {product.supplierName ?? "—"} · 供货价 R$ {(product.supplyPrice ?? 0).toFixed(2)} · 库存 {product.stock} · 周期 {product.deliveryCycleDays ?? 7} 天
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-[11px] font-black text-[var(--muted)]">积分价
                      <input value={draft.points} onChange={(e) => setPriceDrafts((prev) => ({ ...prev, [product.id]: { ...draft, points: e.target.value } }))} className="ml-1.5 h-9 w-20 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]" />
                    </label>
                    <label className="text-[11px] font-black text-[var(--muted)]">+R$ 现金
                      <input value={draft.cash} onChange={(e) => setPriceDrafts((prev) => ({ ...prev, [product.id]: { ...draft, cash: e.target.value } }))} placeholder="0" className="ml-1.5 h-9 w-20 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]" />
                    </label>
                    <button type="button" onClick={() => void post("/api/mall", { action: "priceProduct", productId: product.id, pointsPrice: Number(draft.points) || 0, cashPriceBRL: Number(draft.cash) || 0, status: "active" }, "已定价上架")} className="h-9 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black text-[var(--accent-ink)]">定价上架</button>
                    {product.status === "active" && (
                      <button type="button" onClick={() => void post("/api/mall", { action: "priceProduct", productId: product.id, pointsPrice: product.pointsPrice, cashPriceBRL: product.cashPriceBRL ?? 0, status: "paused" }, "已下架")} className="h-9 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black text-[var(--muted)]">下架</button>
                    )}
                    <button type="button" onClick={() => { setEditOpen(editing ? "" : product.id); setEditDraft({ name: product.name, description: product.description ?? "", imageUrl: product.imageUrl ?? "", category: product.category ?? "", stock: String(product.stock), purchaseLimit: String(product.purchaseLimit ?? 0) }); }} className="h-9 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black text-[var(--muted)]">{editing ? "收起" : "编辑"}</button>
                  </div>
                </div>
                {editing && (
                  <div className="mt-3 grid gap-2 border-t border-[var(--line)] pt-3 md:grid-cols-3">
                    {[
                      { key: "name", label: "名称" },
                      { key: "category", label: "分类" },
                      { key: "imageUrl", label: "图片 URL" },
                      { key: "description", label: "描述" },
                      { key: "stock", label: "库存" },
                      { key: "purchaseLimit", label: "每人每月限购（0=不限）" },
                    ].map((field) => (
                      <label key={field.key} className="text-[11px] font-black text-[var(--muted)]">{field.label}
                        <input value={editDraft[field.key] ?? ""} onChange={(e) => setEditDraft((prev) => ({ ...prev, [field.key]: e.target.value }))} className="mt-1 h-9 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]" />
                      </label>
                    ))}
                    <div className="flex items-end gap-2">
                      <button type="button" onClick={() => void post("/api/mall", { action: "updateProduct", productId: product.id, name: editDraft.name, description: editDraft.description, imageUrl: editDraft.imageUrl, category: editDraft.category, stock: Number(editDraft.stock) || 0, purchaseLimit: Number(editDraft.purchaseLimit) || 0 }, "商品已更新").then(() => setEditOpen(""))} className="h-9 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black text-[var(--accent-ink)]">保存</button>
                      <button type="button" onClick={() => { if (confirm(`删除商品「${product.name}」？`)) void post("/api/mall", { action: "deleteProduct", productId: product.id }, "已删除"); }} className="h-9 rounded-[8px] border border-[#c4423b]/40 px-4 text-xs font-black text-[#c4423b]">删除</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ================= 分类与 Banner ================= */}
      {tab === "merch" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="panel p-5">
            <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">商品分类</div>
            <div className="mb-3 flex gap-2">
              <input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="新分类名，如 Equipamento" className="h-10 flex-1 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
              <button type="button" disabled={!categoryName.trim()} onClick={() => void post("/api/mall/ops", { action: "addCategory", name: categoryName.trim() }, "分类已添加").then(() => setCategoryName(""))} className="h-10 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black text-[var(--accent-ink)] disabled:opacity-50">添加</button>
            </div>
            <div className="space-y-2">
              {(ops?.categories ?? []).map((category) => (
                <div key={category.id} className="flex items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2">
                  <span className="flex-1 text-sm font-black" style={{ opacity: category.active ? 1 : 0.45 }}>{category.name}</span>
                  <button type="button" onClick={() => void post("/api/mall/ops", { action: "updateCategory", categoryId: category.id, active: !category.active })} className="tag">{category.active ? "停用" : "启用"}</button>
                  <button type="button" onClick={() => void post("/api/mall/ops", { action: "deleteCategory", categoryId: category.id })} className="text-xs font-black text-[#c4423b]">删除</button>
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
                <button type="button" disabled={!bannerDraft.title.trim()} onClick={() => void post("/api/mall/ops", { action: "addBanner", ...bannerDraft }, "Banner 已添加").then(() => setBannerDraft({ title: "", imageUrl: "", href: "" }))} className="h-10 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black text-[var(--accent-ink)] disabled:opacity-50">添加</button>
              </div>
            </div>
            <div className="space-y-2">
              {(ops?.banners ?? []).map((banner) => (
                <div key={banner.id} className="flex items-center gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {banner.imageUrl ? <img src={banner.imageUrl} alt="" className="h-10 w-20 rounded object-cover" /> : <div className="grid h-10 w-20 place-items-center rounded bg-[var(--line)] text-[10px] font-black text-[var(--muted)]">文字</div>}
                  <span className="flex-1 truncate text-sm font-black" style={{ opacity: banner.active ? 1 : 0.45 }}>{banner.title}</span>
                  <button type="button" onClick={() => void post("/api/mall/ops", { action: "updateBanner", bannerId: banner.id, active: !banner.active })} className="tag">{banner.active ? "停用" : "启用"}</button>
                  <button type="button" onClick={() => void post("/api/mall/ops", { action: "deleteBanner", bannerId: banner.id })} className="text-xs font-black text-[#c4423b]">删除</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= 订单履约 ================= */}
      {tab === "orders" && (
        <div className="panel p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {["", "created", "arrived", "fulfilled", "cancelled"].map((status) => (
              <button key={status || "all"} type="button" onClick={() => setOrderFilter(status)} className={`rounded-full border px-3.5 py-1.5 text-xs font-black ${orderFilter === status ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]" : "border-[var(--line)] text-[var(--muted)]"}`}>
                {status === "" ? "全部" : orderStatusLabel[status]}
              </button>
            ))}
            <button type="button" onClick={() => downloadCsv("pontomall-orders.csv", ["订单", "商品", "骑手", "站点", "积分", "现金", "支付", "状态", "创建时间"], orders.map((order) => [order.id, order.productName ?? "", order.riderName ?? "", order.station ?? "", String(order.pointsSpent), order.cashDue ? order.cashDue.toFixed(2) : "", order.paymentStatus ?? "", orderStatusLabel[order.status] ?? order.status, order.createdAt]))} className="ml-auto h-9 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black text-[var(--muted)] hover:border-[var(--accent)]">导出 CSV</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="text-left text-[11px] font-black uppercase text-[var(--muted)]"><th className="py-2">商品</th><th>骑手</th><th>站点</th><th>金额</th><th>支付</th><th>状态</th><th>时间</th><th className="text-right">操作</th></tr></thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-t border-[var(--line)] font-bold">
                    <td className="py-2.5">{order.productName}</td>
                    <td>{order.riderName}</td>
                    <td>{order.station}</td>
                    <td>{order.pointsSpent} 分{order.cashDue ? ` + R$${order.cashDue.toFixed(2)}` : ""}</td>
                    <td>{order.paymentStatus ? <span style={{ color: payChipTone[order.paymentStatus] }}>{order.paymentStatus === "paid" ? "已收款" : order.paymentStatus === "submitted" ? "凭证待核" : "待付款"}</span> : "—"}</td>
                    <td><Badge value={orderStatusLabel[order.status] ?? order.status} /></td>
                    <td className="text-xs text-[var(--muted)]">{order.createdAt}</td>
                    <td className="text-right">
                      {order.status === "created" && !order.voucherCode && <button type="button" onClick={() => void post("/api/mall", { action: "markArrived", orderId: order.id }, "已标记到站并推送骑手")} className="h-8 rounded-[8px] border border-[var(--line)] px-2.5 text-xs font-black text-[var(--muted)] hover:border-[var(--accent)]">到站</button>}
                      {order.status === "arrived" && <button type="button" onClick={() => void post("/api/mall", { action: "markPickedUp", orderId: order.id }, "已交付")} className="ml-1.5 h-8 rounded-[8px] bg-[var(--accent)] px-2.5 text-xs font-black text-[var(--accent-ink)]">交付</button>}
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && <tr><td colSpan={8} className="py-8 text-center font-bold text-[var(--muted)]">暂无订单。</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= 收款核销 ================= */}
      {tab === "payments" && (
        <div className="panel p-5">
          <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">PIX 收款核销（积分+现金订单）</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="text-left text-[11px] font-black uppercase text-[var(--muted)]"><th className="py-2">骑手</th><th>商品</th><th>金额</th><th>凭证号</th><th>状态</th><th>时间</th><th className="text-right">操作</th></tr></thead>
              <tbody>
                {(ops?.payments ?? []).map((payment) => (
                  <tr key={payment.id} className="border-t border-[var(--line)] font-bold">
                    <td className="py-2.5">{payment.riderName}</td>
                    <td>{payment.productName}</td>
                    <td>R$ {payment.amountBRL.toFixed(2)}</td>
                    <td className="font-mono text-xs">{payment.reference ?? "—"}</td>
                    <td><Badge value={paymentStatusLabel[payment.status]} /></td>
                    <td className="text-xs text-[var(--muted)]">{payment.submittedAt ?? payment.createdAt}</td>
                    <td className="text-right">
                      {payment.status === "submitted" && (
                        <span className="inline-flex gap-1.5">
                          <button type="button" onClick={() => void post("/api/mall/ops", { action: "confirmPayment", paymentId: payment.id }, "已核销，订单可交付")} className="inline-flex h-8 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-2.5 text-xs font-black text-[var(--accent-ink)]"><CheckCircle2 size={13} /> 核销</button>
                          <button type="button" onClick={() => void post("/api/mall/ops", { action: "rejectPayment", paymentId: payment.id }, "已驳回，骑手可重新提交")} className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-[#c4423b]/40 px-2.5 text-xs font-black text-[#c4423b]"><XCircle size={13} /> 驳回</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {(ops?.payments ?? []).length === 0 && <tr><td colSpan={7} className="py-8 text-center font-bold text-[var(--muted)]">暂无混合支付订单。</td></tr>}
              </tbody>
            </table>
          </div>
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
                    <div className="text-xs font-bold text-[var(--muted)]">R$ {row.oldPrice.toFixed(2)} → <b style={{ color: row.newPrice > row.oldPrice ? "#c4423b" : "#1d7a3e" }}>R$ {row.newPrice.toFixed(2)}</b>{row.note ? ` · ${row.note}` : ""} · {row.createdAt}</div>
                  </div>
                  {row.status === "pending" ? (
                    <span className="flex gap-1.5">
                      <button type="button" onClick={() => void post("/api/mall/ops", { action: "decidePriceChange", requestId: row.id, approve: true }, "已批准，供货价已更新")} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black text-[var(--accent-ink)]">批准</button>
                      <button type="button" onClick={() => void post("/api/mall/ops", { action: "decidePriceChange", requestId: row.id, approve: false }, "已拒绝")} className="h-8 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black text-[var(--muted)]">拒绝</button>
                    </span>
                  ) : (
                    <Badge value={row.status === "approved" ? "已批准" : "已拒绝"} />
                  )}
                </div>
              ))}
              {(ops?.priceChanges ?? []).length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">暂无调价申请。</div>}
            </div>
          </div>

          <div className="panel p-5">
            <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">补货单（PO）</div>
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
                    className="h-10 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black text-[var(--accent-ink)]"
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
                    <Badge value={poStatusLabel[po.status]} />
                    <span className="text-xs font-bold text-[var(--muted)]">{po.items.reduce((sum, item) => sum + item.qty, 0)} 件 · R$ {po.totalCost.toFixed(2)} · {po.createdAt}</span>
                    <span className="ml-auto flex gap-1.5">
                      {po.status === "shipped" && <button type="button" onClick={() => void post("/api/mall/ops", { action: "receivePO", poId: po.id }, "已入库，库存已增加")} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black text-[var(--accent-ink)]">确认入库</button>}
                      {(po.status === "ordered" || po.status === "confirmed") && <button type="button" onClick={() => void post("/api/mall/ops", { action: "cancelPO", poId: po.id }, "已取消")} className="h-8 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black text-[var(--muted)]">取消</button>}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-bold text-[var(--muted)]">{po.items.map((item) => `${item.name}×${item.qty}`).join("、")}{po.shipNote ? ` · 物流：${po.shipNote}` : ""}</div>
                </div>
              ))}
              {(ops?.purchaseOrders ?? []).length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">暂无补货单。</div>}
            </div>
          </div>

          <div className="panel p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase text-[var(--muted)]">月度对账单</span>
              <input type="month" value={statementMonth} onChange={(e) => setStatementMonth(e.target.value)} className="ml-auto h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none" />
              <button type="button" onClick={() => void post("/api/mall/ops", { action: "generateStatement", month: statementMonth }, `已生成 ${statementMonth} 对账单`)} className="h-9 rounded-[8px] bg-[var(--accent)] px-3.5 text-xs font-black text-[var(--accent-ink)]">生成对账单</button>
            </div>
            <div className="space-y-2">
              {(ops?.statements ?? []).map((statement) => (
                <div key={statement.id} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <CircleDollarSign size={15} className="text-[var(--muted)]" />
                    <span className="text-sm font-black">{statement.supplierName} · {statement.month}</span>
                    <Badge value={statementStatusLabel[statement.status]} />
                    <span className="text-xs font-bold text-[var(--muted)]">{statement.lines.length} 笔 · <b>R$ {statement.total.toFixed(2)}</b>{statement.pixKey ? ` · PIX ${statement.pixKey}` : ""}</span>
                    <span className="ml-auto flex gap-1.5">
                      {statement.status === "confirmed" && (
                        <button type="button" onClick={() => { const note = prompt("付款凭证备注（转账ID等，可空）") ?? ""; void post("/api/mall/ops", { action: "payStatement", statementId: statement.id, receiptNote: note }, "已标记付款"); }} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black text-[var(--accent-ink)]">标记已付款</button>
                      )}
                      <button type="button" onClick={() => downloadCsv(`statement-${statement.supplierName}-${statement.month}.csv`, ["日期", "订单", "商品", "供货价"], statement.lines.map((line) => [line.date, line.orderId, line.productName, line.supplyPrice.toFixed(2)]))} className="h-8 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black text-[var(--muted)]">明细 CSV</button>
                    </span>
                  </div>
                  {statement.paidAt && <div className="mt-1 text-xs font-bold text-[var(--muted)]">付款于 {statement.paidAt}{statement.receiptNote ? ` · ${statement.receiptNote}` : ""}</div>}
                </div>
              ))}
              {(ops?.statements ?? []).length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">选择月份生成对账单：按「履约订单 × 供货价」自动汇总每个供应商。</div>}
            </div>
          </div>
        </div>
      )}

      {/* ================= 设置 ================= */}
      {tab === "settings" && (
        <div className="panel max-w-2xl p-5">
          <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">积分与收款配置</div>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              { key: "perOrderPoints", label: "每完成 1 单积分", value: mall?.config.perOrderPoints },
              { key: "referralPoints", label: "邀请注册积分", value: mall?.config.referralPoints },
              { key: "partnerServicePoints", label: "Partner 服务积分", value: mall?.config.partnerServicePoints },
              { key: "partnerServiceCount", label: "Partner 服务次数门槛", value: mall?.config.partnerServiceCount },
            ].map((field) => (
              <label key={field.key} className="text-[11px] font-black text-[var(--muted)]">{field.label}
                <input value={configDraft[field.key] ?? String(field.value ?? "")} onChange={(e) => setConfigDraft((prev) => ({ ...prev, [field.key]: e.target.value }))} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
              </label>
            ))}
            <label className="text-[11px] font-black text-[var(--muted)] md:col-span-2">公司 PIX 收款 Key（混合支付订单展示给骑手）
              <input value={configDraft.pixKey ?? mall?.pixKey ?? ""} onChange={(e) => setConfigDraft((prev) => ({ ...prev, pixKey: e.target.value }))} placeholder="CNPJ / e-mail / chave aleatória" className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 font-mono text-sm font-bold outline-none focus:border-[var(--accent)]" />
            </label>
          </div>
          <button
            type="button"
            onClick={() => void post("/api/mall", { action: "setConfig", perOrderPoints: Number(configDraft.perOrderPoints ?? mall?.config.perOrderPoints), referralPoints: Number(configDraft.referralPoints ?? mall?.config.referralPoints), partnerServicePoints: Number(configDraft.partnerServicePoints ?? mall?.config.partnerServicePoints), partnerServiceCount: Number(configDraft.partnerServiceCount ?? mall?.config.partnerServiceCount), pixKey: configDraft.pixKey ?? mall?.pixKey ?? "" }, "配置已保存")}
            className="mt-4 h-11 rounded-[8px] bg-[var(--accent)] px-6 text-sm font-black text-[var(--accent-ink)]"
          >保存配置</button>
          <p className="mt-3 text-xs font-bold text-[var(--muted)]">门面：mall.meponto.com · 后台：mall.meponto.com/admin · 供应链：supplier.meponto.com</p>
        </div>
      )}
    </AppShell>
  );
}
