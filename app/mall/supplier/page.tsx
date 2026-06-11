"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PackagePlus, RefreshCcw } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../../components/ui";
import { readSession } from "../../lib/session";
import type { MarketplaceProduct } from "../../lib/points";

const statusLabel: Record<string, string> = { active: "已上架", paused: "已下架", pending_pricing: "待总部定价" };

export default function MallSupplierPage() {
  const session = useMemo(() => readSession(), []);
  const supplierName = session?.organization || session?.name || "Supplier";
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Supplier Admin" }), [session]);

  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [form, setForm] = useState({ name: "", supplyPrice: "", deliveryCycleDays: "7", stock: "", description: "" });
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/mall", { headers, cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setProducts((payload.data.products as MarketplaceProduct[]).filter((item) => item.supplierName === supplierName));
  }, [headers, supplierName]);

  useEffect(() => {
    void load();
  }, [load]);

  const input = "h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";

  return (
    <AppShell>
      <PageTitle
        title="商品供货"
        eyebrow={`供应商工作台 · ${supplierName}`}
        action={<button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> 刷新</button>}
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="panel space-y-3 p-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><PackagePlus size={14} /> 上传商品（报供应价）</div>
          <input className={input} placeholder="商品名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <input className={input} inputMode="decimal" placeholder="供应价 R$" value={form.supplyPrice} onChange={(e) => setForm({ ...form, supplyPrice: e.target.value.replace(/[^\d.]/g, "") })} />
            <input className={input} inputMode="numeric" placeholder="周期(天)" value={form.deliveryCycleDays} onChange={(e) => setForm({ ...form, deliveryCycleDays: e.target.value.replace(/\D/g, "") })} />
            <input className={input} inputMode="numeric" placeholder="库存" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value.replace(/\D/g, "") })} />
          </div>
          <textarea className="w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3 text-sm font-bold outline-none focus:border-[var(--accent)]" rows={3} placeholder="商品说明（选填）" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <button
            type="button"
            disabled={busy || !form.name.trim() || !form.supplyPrice}
            onClick={async () => {
              setBusy(true);
              setMessage(null);
              const response = await fetch("/api/mall", {
                method: "POST",
                headers,
                body: JSON.stringify({ action: "supplierAddProduct", name: form.name, supplierName, supplyPrice: Number(form.supplyPrice), deliveryCycleDays: Number(form.deliveryCycleDays || 7), stock: Number(form.stock || 0), description: form.description }),
              });
              const payload = await response.json().catch(() => ({}));
              setBusy(false);
              if (!response.ok) {
                setMessage({ tone: "err", text: payload.error ?? `提交失败 (${response.status})` });
                return;
              }
              setForm({ name: "", supplyPrice: "", deliveryCycleDays: "7", stock: "", description: "" });
              setMessage({ tone: "ok", text: "商品已提交，等待总部定价上架。" });
              void load();
            }}
            className="h-11 w-full rounded-[8px] bg-[var(--accent)] text-sm font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"
          >
            {busy ? "提交中..." : "提交商品"}
          </button>
        </div>

        <div className="panel p-4">
          <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">我的商品（{products.length}）</div>
          {products.length === 0 ? (
            <div className="text-sm font-bold text-[var(--muted)]">还没有上传商品。</div>
          ) : (
            <div className="space-y-2">
              {products.map((product) => (
                <div key={product.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-black">{product.name} <Badge value={statusLabel[product.status] ?? product.status} /></div>
                    <div className="text-[11px] font-bold text-[var(--muted)]">
                      供应价 R${product.supplyPrice} ｜ 周期 {product.deliveryCycleDays} 天 ｜ 库存 {product.stock}
                      {product.status === "active" && ` ｜ 积分价 ${product.pointsPrice} 分${product.marginPct !== undefined ? ` ｜ 分成 ${product.marginPct}%` : ""}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
