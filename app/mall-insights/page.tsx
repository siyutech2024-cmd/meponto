"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCcw } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
import { DataTable, SectionCard, Stat, Toolbar, type DataColumn } from "../components/kit";
import type { MarketplaceProduct } from "../lib/points";
import type { MallPayment, SupplierStatement } from "../lib/mall-ops";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";

/**
 * HQ read-only mall insights: key numbers only — all operations live in the
 * independent mall back office (mall.meponto.com/admin).
 */

type OpsPayload = {
  statements: SupplierStatement[];
  payments: MallPayment[];
  summary: { orders: number; pointsGmv: number; cashGmv: number; gmvBRL?: number; pointsToBrlRate?: number; pendingPayments: number; reviewPending?: number; partnerOrders?: number; partnerPointsSpent?: number; topProducts?: Array<{ name: string; count: number }>; daily: Array<{ date: string; count: number }> };
};

type PointsLiability = {
  rate: number;
  riderOutstanding: number;
  partnerOutstanding: number;
  totalOutstanding: number;
  liabilityBRL: number;
  earnedThisMonth: number;
  spentThisMonth: number;
  expiredThisMonth: number;
  pendingPoints: number;
  supplierPayableBRL: number;
};

type SettlementRow = { supplier: string; qty: number; payable: number };

export default function MallInsightsPage() {
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
  const headers = useMemo(() => ({ "Content-Type": "application/json" }), []);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [settlement, setSettlement] = useState<SettlementRow[]>([]);
  const [liability, setLiability] = useState<PointsLiability | null>(null);
  const [events, setEvents] = useState<Array<{ id: string; type: string; occurredAt: string; payload: Record<string, unknown> }>>([]);
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
      setLiability(payload.data?.pointsLiability ?? null);
      setEvents(payload.data?.events ?? []);
    }
    if (opsRes.ok) setOps((await opsRes.json()).data);
  }, [headers]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = ops?.summary;
  const payablePending = (ops?.statements ?? []).filter((statement) => statement.status === "confirmed").reduce((sum, statement) => sum + statement.total, 0);
  const maxDaily = Math.max(1, ...(summary?.daily ?? []).map((day) => day.count));

  const settlementCols: Array<DataColumn<SettlementRow>> = [
    { key: "supplier", label: "供应商", render: (row) => row.supplier },
    { key: "qty", label: "履约件数", align: "right", render: (row) => row.qty },
    { key: "payable", label: "应付金额", align: "right", render: (row) => `R$ ${row.payable.toFixed(2)}` },
  ];

  return (
    <AppShell>
      <PageTitle title="商城关键数据" eyebrow="PontoMall" />
      <p className="-mt-3 mb-5 text-sm font-bold text-[var(--muted)]">只读视图 —— 商品、订单、收款与结算的全部操作在独立商城后台完成。</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="GMV 折算（R$）" value={`R$ ${(summary?.gmvBRL ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} hint={t("dynUnifiedBasis", { r: summary?.pointsToBrlRate ?? 10 })} />
        <Stat label="积分 GMV" value={`${(summary?.pointsGmv ?? 0).toLocaleString()} ${t("dynPts")}`} hint="骑手累计消耗" />
        <Stat label="现金 GMV" value={`R$ ${(summary?.cashGmv ?? 0).toFixed(2)}`} hint="PIX 补差实收" />
        <Stat label="待核销收款" value={String(summary?.pendingPayments ?? 0)} hint="商城后台处理" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="在售商品" value={String(products.filter((product) => product.status === "active").length)} hint={t("dynSkuCount2", { n: products.length })} />
        <Stat label="待定价" value={String(products.filter((product) => product.status === "pending_pricing").length)} hint="供应商已提报" />
        <Stat label="待付供应商" value={`R$ ${payablePending.toFixed(2)}`} hint="已确认对账单" />
        <Stat label="供应商数" value={String(new Set(products.map((product) => product.supplierName).filter(Boolean)).size)} hint="有商品的供应商" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="高价值待审核" value={String(summary?.reviewPending ?? 0)} hint="商城后台处理" />
        <Stat label="合作方兑换" value={String(summary?.partnerOrders ?? 0)} hint="Partner 兑换单数" />
        <Stat label="合作方积分消耗" value={`${(summary?.partnerPointsSpent ?? 0).toLocaleString()} ${t("dynPts")}`} hint="Partner 独立积分口径" />
        <Stat label="近 30 天兑换" value={String((summary?.daily ?? []).reduce((sum, day) => sum + day.count, 0))} hint="最近 30 天合计" />
      </div>

      <div className="mt-5">
        <Toolbar
          right={
            <button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[var(--line)] px-4 text-[13px] font-black text-[var(--muted)] hover:border-[var(--accent)]">
              <RefreshCcw size={14} /> 刷新
            </button>
          }
        >
          <a href="https://mall.meponto.com/admin" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[var(--accent)] px-4 text-[13px] font-black text-[var(--accent-ink)]">
            <ExternalLink size={15} /> 打开商城后台
          </a>
          <a href="https://mall.meponto.com" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[var(--line)] px-4 text-[13px] font-black text-[var(--muted)] hover:border-[var(--accent)]">
            查看商城门面
          </a>
        </Toolbar>
      </div>

      {(summary?.topProducts ?? []).length > 0 && (
        <SectionCard title="热销商品 Top 5（兑换次数）" className="mt-5">
          <div className="space-y-2">
            {(summary?.topProducts ?? []).map((row, i) => (
              <div key={row.name} className="flex items-center gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--accent)]/15 text-xs font-black text-[var(--accent)]">{i + 1}</span>
                <span className="flex-1 truncate text-sm font-bold">{row.name}</span>
                <span className="text-sm font-black">{row.count}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="近 30 天兑换量" className="mt-5">
        <div className="flex h-24 items-end gap-[3px]">
          {(summary?.daily ?? []).map((day) => (
            <div key={day.date} title={`${day.date} · ${day.count}`} className="flex-1 rounded-t-[3px] bg-[var(--accent)]" style={{ height: `${Math.max(3, (day.count / maxDaily) * 100)}%`, opacity: day.count > 0 ? 0.9 : 0.18 }} />
          ))}
        </div>
      </SectionCard>

      {liability && (
        <SectionCard
          title="积分负债与兑付对账"
          desc={`积分为营销成本型负债;${liability.rate} 分 ≈ R$ 1(定价参考,非现金承诺)。过期回收与兑付现金共同收敛负债。`}
          className="mt-5"
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="未兑付积分负债" value={`R$ ${liability.liabilityBRL.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} hint={t("dynLiabilityBreakdown", { total: liability.totalOutstanding.toLocaleString(), r: liability.riderOutstanding.toLocaleString(), p: liability.partnerOutstanding.toLocaleString() })} />
            <Stat label="本月新增赚取" value={`${liability.earnedThisMonth.toLocaleString()} ${t("dynPts")}`} hint="负债增加项" />
            <Stat label="本月消耗 / 过期" value={`${liability.spentThisMonth.toLocaleString()} / ${liability.expiredThisMonth.toLocaleString()} ${t("dynPts")}`} hint="兑换消耗 · 过期回收(均减负债)" />
            <Stat label="待释放积分" value={`${liability.pendingPoints.toLocaleString()} ${t("dynPts")}`} hint="未计入可用负债" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] font-bold text-[var(--muted)]">
            <span>兑付现金支出(供应商应付):<b className="text-[var(--text)]">R$ {liability.supplierPayableBRL.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</b></span>
            <span>口径:负债(分/{liability.rate})↔ 过期回收 ↔ 现金兑付,需 Finance 月度复核。</span>
          </div>
        </SectionCard>
      )}

      {events.length > 0 && (
        <SectionCard
          title="商城事件流（版本化事件 outbox）"
          desc="每次兑换/到货/取货/取消/驳回都追加版本化领域事件,供下游(对账、风控、通知)消费。"
          className="mt-5"
        >
          <div className="max-h-60 space-y-1.5 overflow-y-auto">
            {events.slice(0, 30).map((event) => (
              <div key={event.id} className="flex items-center gap-3 text-xs font-bold">
                <span className="text-[var(--muted)]">{event.occurredAt.slice(5, 16)}</span>
                <span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 font-mono text-[10px] font-black text-[var(--accent)]">{event.type}</span>
                <span className="truncate text-[var(--muted)]">{String(event.payload.productName ?? event.payload.orderId ?? "")}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <div className="mt-5">
        <div className="mb-2 text-xs font-black uppercase text-[var(--muted)]">供应商应付（履约口径）</div>
        <DataTable columns={settlementCols} rows={settlement} rowKey={(row) => row.supplier} minWidth={480} empty="暂无履约订单。" />
      </div>
    </AppShell>
  );
}
