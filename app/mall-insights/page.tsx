"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCcw } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
import type { MarketplaceProduct } from "../lib/points";
import type { MallPayment, SupplierStatement } from "../lib/mall-ops";

/**
 * HQ read-only mall insights: key numbers only — all operations live in the
 * independent mall back office (mall.meponto.com/admin).
 */

type OpsPayload = {
  statements: SupplierStatement[];
  payments: MallPayment[];
  summary: { orders: number; pointsGmv: number; cashGmv: number; pendingPayments: number; daily: Array<{ date: string; count: number }> };
};


function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel p-4">
      <div className="text-[11px] font-black uppercase text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] font-bold text-[var(--muted)]">{hint}</div>}
    </div>
  );
}

export default function MallInsightsPage() {
  const headers = useMemo(() => ({ "Content-Type": "application/json" }), []);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [settlement, setSettlement] = useState<Array<{ supplier: string; qty: number; payable: number }>>([]);
  const [ops, setOps] = useState<OpsPayload | null>(null);

  const load = useCallback(async () => {
    const [mallRes, opsRes] = await Promise.all([
      fetch("/api/mall", { headers, cache: "no-store" }),
      fetch("/api/mall/ops", { headers, cache: "no-store" }),
    ]);
    if (mallRes.ok) {
      const payload = await mallRes.json();
      setProducts(payload.data?.products ?? []);
      setSettlement(payload.data?.supplierSettlement ?? []);
    }
    if (opsRes.ok) setOps((await opsRes.json()).data);
  }, [headers]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = ops?.summary;
  const payablePending = (ops?.statements ?? []).filter((statement) => statement.status === "confirmed").reduce((sum, statement) => sum + statement.total, 0);
  const maxDaily = Math.max(1, ...(summary?.daily ?? []).map((day) => day.count));

  return (
    <AppShell>
      <PageTitle title="商城关键数据" eyebrow="PontoMall" />
      <p className="-mt-3 mb-5 text-sm font-bold text-[var(--muted)]">只读视图 —— 商品、订单、收款与结算的全部操作在独立商城后台完成。</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <a href="https://mall.meponto.com/admin" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[var(--accent)] px-4 text-[13px] font-black text-[var(--accent-ink)]">
          <ExternalLink size={15} /> 打开商城后台
        </a>
        <a href="https://mall.meponto.com" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[var(--line)] px-4 text-[13px] font-black text-[var(--muted)] hover:border-[var(--accent)]">
          查看商城门面
        </a>
        <button type="button" onClick={() => void load()} className="ml-auto inline-flex h-10 items-center gap-2 rounded-[10px] border border-[var(--line)] px-4 text-[13px] font-black text-[var(--muted)] hover:border-[var(--accent)]">
          <RefreshCcw size={14} /> 刷新
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="兑换单数" value={String(summary?.orders ?? 0)} hint="非取消订单累计" />
        <Stat label="积分 GMV" value={`${(summary?.pointsGmv ?? 0).toLocaleString()} 分`} hint="累计消耗" />
        <Stat label="现金 GMV" value={`R$ ${(summary?.cashGmv ?? 0).toFixed(2)}`} hint="PIX 补差实收" />
        <Stat label="待核销收款" value={String(summary?.pendingPayments ?? 0)} hint="商城后台处理" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="在售商品" value={String(products.filter((product) => product.status === "active").length)} hint={`SKU 共 ${products.length}`} />
        <Stat label="待定价" value={String(products.filter((product) => product.status === "pending_pricing").length)} hint="供应商已提报" />
        <Stat label="待付供应商" value={`R$ ${payablePending.toFixed(2)}`} hint="已确认对账单" />
        <Stat label="供应商数" value={String(new Set(products.map((product) => product.supplierName).filter(Boolean)).size)} hint="有商品的供应商" />
      </div>

      <div className="panel mt-5 p-5">
        <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">近 30 天兑换量</div>
        <div className="flex h-24 items-end gap-[3px]">
          {(summary?.daily ?? []).map((day) => (
            <div key={day.date} title={`${day.date} · ${day.count}`} className="flex-1 rounded-t-[3px] bg-[var(--accent)]" style={{ height: `${Math.max(3, (day.count / maxDaily) * 100)}%`, opacity: day.count > 0 ? 0.9 : 0.18 }} />
          ))}
        </div>
      </div>

      <div className="panel mt-5 p-5">
        <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">供应商应付（履约口径）</div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] font-black uppercase text-[var(--muted)]"><th className="py-2">供应商</th><th>履约件数</th><th>应付金额</th></tr></thead>
          <tbody>
            {settlement.map((row) => (
              <tr key={row.supplier} className="border-t border-[var(--line)] font-bold"><td className="py-2.5">{row.supplier}</td><td>{row.qty}</td><td>R$ {row.payable.toFixed(2)}</td></tr>
            ))}
            {settlement.length === 0 && <tr><td colSpan={3} className="py-6 text-center font-bold text-[var(--muted)]">暂无履约订单。</td></tr>}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
