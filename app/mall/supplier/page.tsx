"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Boxes, CircleDollarSign, PackagePlus, RefreshCcw, Tags, Truck } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../../components/ui";
import type { MarketplaceProduct } from "../../lib/points";
import type { PriceChangeRequest, PurchaseOrder, SupplierStatement } from "../../lib/mall-ops";
import { poStatusLabel, statementStatusLabel } from "../../lib/mall-ops";

/**
 * Supplier supply-chain workspace (supplier.meponto.com): catalog + quotes,
 * price-change requests, purchase orders, monthly statements and a
 * performance dashboard — scoped to the logged-in supplier organization.
 */

const statusLabel: Record<string, string> = { active: "已上架", paused: "已下架", pending_pricing: "待商城定价" };

type OpsPayload = {
  priceChanges: PriceChangeRequest[];
  purchaseOrders: PurchaseOrder[];
  statements: SupplierStatement[];
  summary: { orders: number; pointsGmv: number; cashGmv: number; daily: Array<{ date: string; count: number }> };
};

const TABS = [
  { id: "catalog", label: "商品与报价", icon: Tags },
  { id: "prices", label: "调价申请", icon: CircleDollarSign },
  { id: "pos", label: "补货单", icon: Boxes },
  { id: "statements", label: "对账单", icon: Truck },
  { id: "board", label: "数据看板", icon: BarChart3 },
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

export default function SupplierWorkspacePage() {
  const headers = useMemo(() => ({ "Content-Type": "application/json" }), []);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("catalog");
  const [supplierName, setSupplierName] = useState("");
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [ops, setOps] = useState<OpsPayload | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState({ name: "", supplyPrice: "", deliveryCycleDays: "7", stock: "", description: "", imageUrl: "", category: "", isVirtual: false });
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
  const [pixDraft, setPixDraft] = useState("");

  const load = useCallback(async () => {
    const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
    const sessionPayload = await sessionRes.json().catch(() => ({}));
    const organization = (sessionPayload?.user?.organization as string) || "";
    setSupplierName(organization);
    const [mallRes, opsRes] = await Promise.all([
      fetch("/api/mall", { headers, cache: "no-store" }),
      fetch("/api/mall/ops", { headers, cache: "no-store" }),
    ]);
    if (mallRes.ok) {
      const payload = await mallRes.json();
      const rows = (payload.data?.products ?? []) as MarketplaceProduct[];
      setProducts(organization ? rows.filter((product) => product.supplierName === organization) : rows);
    }
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

  const payableTotal = (ops?.statements ?? []).filter((statement) => statement.status !== "paid").reduce((sum, statement) => sum + statement.total, 0);
  const paidTotal = (ops?.statements ?? []).filter((statement) => statement.status === "paid").reduce((sum, statement) => sum + statement.total, 0);
  const maxDaily = Math.max(1, ...(ops?.summary.daily ?? []).map((day) => day.count));

  return (
    <AppShell>
      <PageTitle title={`供应链工作台${supplierName ? ` · ${supplierName}` : ""}`} eyebrow="Supply Chain" />
      <p className="-mt-3 mb-5 text-sm font-bold text-[var(--muted)]">商品报价、调价、补货与月度对账——与 PontoMall 商城后台直连。</p>

      {message && (
        <div className="mb-4 rounded-[10px] border px-4 py-3 text-sm font-bold" style={message.tone === "ok" ? { borderColor: "rgba(29,122,62,.4)", background: "rgba(29,122,62,.08)", color: "#1d7a3e" } : { borderColor: "rgba(196,66,59,.4)", background: "rgba(196,66,59,.08)", color: "#c4423b" }}>
          {message.text}
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex h-10 items-center gap-2 rounded-[10px] border px-4 text-[13px] font-black transition-colors ${tab === id ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent)]"}`}>
            <Icon size={15} /> {label}
            {id === "pos" && (ops?.purchaseOrders ?? []).some((po) => po.status === "ordered") && <span className="h-2 w-2 rounded-full bg-[#e2554d]" />}
            {id === "statements" && (ops?.statements ?? []).some((s) => s.status === "draft") && <span className="h-2 w-2 rounded-full bg-[#e2554d]" />}
          </button>
        ))}
        <button type="button" onClick={() => void load()} className="ml-auto inline-flex h-10 items-center gap-2 rounded-[10px] border border-[var(--line)] px-4 text-[13px] font-black text-[var(--muted)] hover:border-[var(--accent)]">
          <RefreshCcw size={14} /> 刷新
        </button>
      </div>

      {/* ============ 商品与报价 ============ */}
      {tab === "catalog" && (
        <div className="space-y-5">
          <div className="panel p-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--muted)]"><PackagePlus size={14} /> 提报新商品（商城定价后上架）</div>
            <div className="grid gap-2 md:grid-cols-3">
              {[
                { key: "name", label: "商品名称 *" },
                { key: "supplyPrice", label: "供货价 R$ *" },
                { key: "deliveryCycleDays", label: "供货周期（天）" },
                { key: "stock", label: "首批库存" },
                { key: "category", label: "分类（如 Equipamento）" },
                { key: "imageUrl", label: "图片 URL" },
              ].map((field) => (
                <label key={field.key} className="text-[11px] font-black text-[var(--muted)]">{field.label}
                  <input value={(form as Record<string, unknown>)[field.key] as string} onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
                </label>
              ))}
              <label className="text-[11px] font-black text-[var(--muted)] md:col-span-2">描述
                <input value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
              </label>
              <div className="flex items-end gap-3">
                <label className="flex h-10 cursor-pointer items-center gap-2 text-xs font-black text-[var(--muted)]">
                  <input type="checkbox" checked={form.isVirtual} onChange={(e) => setForm((prev) => ({ ...prev, isVirtual: e.target.checked }))} className="h-4 w-4 accent-[var(--accent)]" /> 虚拟商品（即时发码）
                </label>
                <button
                  type="button"
                  disabled={!form.name.trim() || !(Number(form.supplyPrice) > 0)}
                  onClick={() => void post("/api/mall", { action: "supplierAddProduct", name: form.name.trim(), supplierName, supplyPrice: Number(form.supplyPrice), deliveryCycleDays: Number(form.deliveryCycleDays) || 7, stock: Number(form.stock) || 0, description: form.description, imageUrl: form.imageUrl, category: form.category, isVirtual: form.isVirtual }, "已提报，等待商城定价上架").then(() => setForm({ name: "", supplyPrice: "", deliveryCycleDays: "7", stock: "", description: "", imageUrl: "", category: "", isVirtual: false }))}
                  className="h-10 rounded-[8px] bg-[var(--accent)] px-5 text-xs font-black text-[var(--accent-ink)] disabled:opacity-50"
                >提报商品</button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {products.map((product) => (
              <div key={product.id} className="panel flex flex-wrap items-center gap-3 p-4">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-lg">🎁</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black">{product.name}</span>
                    <Badge value={statusLabel[product.status] ?? product.status} />
                  </div>
                  <div className="text-xs font-bold text-[var(--muted)]">供货价 R$ {(product.supplyPrice ?? 0).toFixed(2)} · 库存 {product.stock} · 周期 {product.deliveryCycleDays ?? 7} 天{product.pointsPrice ? ` · 商城售价 ${product.pointsPrice} 分${product.cashPriceBRL ? ` + R$${product.cashPriceBRL.toFixed(2)}` : ""}` : ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  <input value={priceDraft[product.id] ?? ""} onChange={(e) => setPriceDraft((prev) => ({ ...prev, [product.id]: e.target.value }))} placeholder="新供货价" className="h-9 w-24 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]" />
                  <button type="button" disabled={!(Number(priceDraft[product.id]) > 0)} onClick={() => void post("/api/mall/ops", { action: "requestPriceChange", productId: product.id, newPrice: Number(priceDraft[product.id]) }, "调价申请已提交，等待商城审批").then(() => setPriceDraft((prev) => ({ ...prev, [product.id]: "" })))} className="h-9 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black text-[var(--muted)] hover:border-[var(--accent)] disabled:opacity-50">申请调价</button>
                </div>
              </div>
            ))}
            {products.length === 0 && <div className="panel p-10 text-center text-sm font-bold text-[var(--muted)]">还没有商品，先在上方提报。</div>}
          </div>
        </div>
      )}

      {/* ============ 调价申请 ============ */}
      {tab === "prices" && (
        <div className="panel p-5">
          <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">调价申请与价格历史</div>
          <div className="space-y-2">
            {(ops?.priceChanges ?? []).map((row) => (
              <div key={row.id} className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black">{row.productName}</div>
                  <div className="text-xs font-bold text-[var(--muted)]">R$ {row.oldPrice.toFixed(2)} → R$ {row.newPrice.toFixed(2)} · 提交于 {row.createdAt}{row.decidedAt ? ` · 处理于 ${row.decidedAt}` : ""}</div>
                </div>
                <Badge value={row.status === "pending" ? "待审批" : row.status === "approved" ? "已批准" : "已拒绝"} />
              </div>
            ))}
            {(ops?.priceChanges ?? []).length === 0 && <div className="py-6 text-center text-xs font-bold text-[var(--muted)]">暂无调价记录——在「商品与报价」里对单个商品发起调价。</div>}
          </div>
        </div>
      )}

      {/* ============ 补货单 ============ */}
      {tab === "pos" && (
        <div className="panel p-5">
          <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">商城下达的补货单 · 确认 → 发货 → 商城入库</div>
          <div className="space-y-2">
            {(ops?.purchaseOrders ?? []).map((po) => (
              <div key={po.id} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Boxes size={15} className="text-[var(--muted)]" />
                  <span className="text-sm font-black">{po.id}</span>
                  <Badge value={poStatusLabel[po.status]} />
                  <span className="text-xs font-bold text-[var(--muted)]">{po.items.reduce((sum, item) => sum + item.qty, 0)} 件 · R$ {po.totalCost.toFixed(2)} · {po.createdAt}</span>
                  <span className="ml-auto flex gap-1.5">
                    {po.status === "ordered" && <button type="button" onClick={() => void post("/api/mall/ops", { action: "confirmPO", poId: po.id }, "已确认，请按周期发货")} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black text-[var(--accent-ink)]">确认接单</button>}
                    {po.status === "confirmed" && <button type="button" onClick={() => { const note = prompt("物流/送货备注（可空）") ?? ""; void post("/api/mall/ops", { action: "shipPO", poId: po.id, shipNote: note }, "已标记发货"); }} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black text-[var(--accent-ink)]">标记发货</button>}
                  </span>
                </div>
                <div className="mt-1 text-xs font-bold text-[var(--muted)]">{po.items.map((item) => `${item.name}×${item.qty}`).join("、")}{po.note ? ` · 备注：${po.note}` : ""}{po.shipNote ? ` · 物流：${po.shipNote}` : ""}</div>
              </div>
            ))}
            {(ops?.purchaseOrders ?? []).length === 0 && <div className="py-6 text-center text-xs font-bold text-[var(--muted)]">暂无补货单。</div>}
          </div>
        </div>
      )}

      {/* ============ 对账单 ============ */}
      {tab === "statements" && (
        <div className="panel p-5">
          <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">月度对账单 · 确认后商城付款</div>
          <div className="space-y-2">
            {(ops?.statements ?? []).map((statement) => (
              <div key={statement.id} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <CircleDollarSign size={15} className="text-[var(--muted)]" />
                  <span className="text-sm font-black">{statement.month}</span>
                  <Badge value={statementStatusLabel[statement.status]} />
                  <span className="text-xs font-bold text-[var(--muted)]">{statement.lines.length} 笔 · <b className="text-[var(--text)]">R$ {statement.total.toFixed(2)}</b></span>
                  <span className="ml-auto flex items-center gap-1.5">
                    {statement.status === "draft" && (
                      <>
                        <input value={pixDraft} onChange={(e) => setPixDraft(e.target.value)} placeholder="收款 PIX Key" className="h-8 w-44 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-2 font-mono text-xs font-bold outline-none focus:border-[var(--accent)]" />
                        <button type="button" onClick={() => void post("/api/mall/ops", { action: "confirmStatement", statementId: statement.id, pixKey: pixDraft }, "已确认对账单，等待商城付款")} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black text-[var(--accent-ink)]">确认无误</button>
                      </>
                    )}
                  </span>
                </div>
                {statement.paidAt && <div className="mt-1 text-xs font-bold" style={{ color: "#1d7a3e" }}>已付款 · {statement.paidAt}{statement.receiptNote ? ` · ${statement.receiptNote}` : ""}</div>}
              </div>
            ))}
            {(ops?.statements ?? []).length === 0 && <div className="py-6 text-center text-xs font-bold text-[var(--muted)]">商城生成对账单后会出现在这里（自然月：履约订单 × 供货价）。</div>}
          </div>
        </div>
      )}

      {/* ============ 数据看板 ============ */}
      {tab === "board" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="累计售出（件）" value={String(ops?.summary.orders ?? 0)} hint="兑换订单数" />
            <Stat label="在售商品" value={String(products.filter((product) => product.status === "active").length)} hint={`共 ${products.length} 个 SKU`} />
            <Stat label="待收货款" value={`R$ ${payableTotal.toFixed(2)}`} hint="未付对账单合计" />
            <Stat label="已结货款" value={`R$ ${paidTotal.toFixed(2)}`} hint="历史已付合计" />
          </div>
          <div className="panel p-5">
            <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">近 30 天售出趋势</div>
            <div className="flex h-28 items-end gap-[3px]">
              {(ops?.summary.daily ?? []).map((day) => (
                <div key={day.date} className="group relative flex-1 rounded-t-[3px] bg-[var(--accent)]" style={{ height: `${Math.max(3, (day.count / maxDaily) * 100)}%`, opacity: day.count > 0 ? 0.9 : 0.18 }}>
                  <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-white group-hover:block">{day.date.slice(5)} · {day.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
