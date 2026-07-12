"use client";

import { SectionCard, Skeleton, Stat, TodoCard } from "../kit";
import { useMallAdmin } from "./context";

/**
 * 总览 — "今天要处理什么" driven (wave-1 redesign):
 * 1) todo cards, each deep-links to its tab with a pre-filter;
 * 2) one row of key numbers (points GMV / cash GMV / orders / 30d trend);
 * 3) supplier payables + top-5 products, two columns.
 * Aging (>48h) queues are folded into the matching todo card's hint.
 * First load: card values show "…" and tables show Skeleton bars — never
 * the fake-broken "all zeros + empty table" state.
 */
export default function OverviewTab() {
  const { loading, mall, ops, procure, t, navigate, pendingPricing, lowStock, priceChangePending, payablePending, consentPendingIds } = useMallAdmin();
  const booting = loading && !mall && !ops;
  const n = (value: string | number) => (booting ? "…" : value);
  const summary = ops?.summary;
  const aging = summary?.aging;
  const reviewPending = summary?.reviewPending ?? 0;
  const pendingTopUps = summary?.pendingPayments ?? 0;
  const fpoSubmitted = (procure?.fpos ?? []).filter((fpo) => fpo.status === "submitted").length;
  const daily = summary?.daily ?? [];
  const maxDaily = Math.max(1, ...daily.map((day) => day.count));
  const last30 = daily.reduce((sum, day) => sum + day.count, 0);

  const withAging = (base: string, over48h?: number) => (over48h && over48h > 0 ? `${base} · 超48h ${over48h} 件` : base);

  return (
    <div className="space-y-5">
      {/* ---- 待办区（平面视角一屏看全）：点击直达对应 Tab 并预筛 ---- */}
      <div>
        <div className="mb-2 text-xs font-black uppercase text-[var(--muted)]">今天要处理什么</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TodoCard size="sm" label="待定价" value={n(pendingPricing)} tone={pendingPricing > 0 ? "warn" : "neutral"} hint={withAging("供应商已报价待上架", aging?.pricingOver48h)} onClick={() => navigate("products", "pending_pricing")} />
          <TodoCard size="sm" label="待审分销同意" value={n(consentPendingIds.size)} tone={consentPendingIds.size > 0 ? "warn" : "neutral"} hint="供应商申请开放直采待批" onClick={() => navigate("procurement")} />
          <TodoCard size="sm" label="调价待批" value={n(priceChangePending)} tone={priceChangePending > 0 ? "warn" : "neutral"} hint={withAging("供货价调整审批", aging?.priceChangesOver48h)} onClick={() => navigate("supply")} />
          <TodoCard size="sm" label="低库存" value={n(lowStock)} tone={lowStock > 0 ? "danger" : "neutral"} hint="在售且库存 ≤ 补货阈值" onClick={() => navigate("products", "lowstock")} />
          <TodoCard size="sm" label="待核销凭证" value={n(pendingTopUps)} tone={pendingTopUps > 0 ? "warn" : "neutral"} hint={withAging("骑手已提交充值凭证", aging?.topUpsOver48h)} onClick={() => navigate("payments")} />
          <TodoCard size="sm" label="待付对账单" value={n(`R$ ${payablePending.toFixed(2)}`)} tone={payablePending > 0 ? "info" : "neutral"} hint="供应商已确认待付款" onClick={() => navigate("supply")} />
          <TodoCard size="sm" label="直采待审批" value={n(fpoSubmitted)} tone={fpoSubmitted > 0 ? "warn" : "neutral"} hint="加盟商直采订单等审批" onClick={() => navigate("procurement")} />
          <TodoCard size="sm" label="高价值待审" value={n(reviewPending)} tone={reviewPending > 0 ? "danger" : "neutral"} hint="订单资格审核放行" onClick={() => navigate("orders", "review")} />
        </div>
      </div>

      {/* ---- 关键数字一行 ---- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="积分 GMV" value={booting ? "…" : `${(summary?.pointsGmv ?? 0).toLocaleString()} ${t("dynPts")}`} hint="累计消耗积分" />
        <Stat label="现金 GMV（已核销）" value={booting ? "…" : `R$ ${(summary?.cashGmv ?? 0).toFixed(2)}`} hint="PIX 补差实收" />
        <Stat label="兑换单数" value={booting ? "…" : String(summary?.orders ?? 0)} hint="非取消的全部订单" />
        <div className="panel p-4">
          <div className="text-[11px] font-bold uppercase text-[var(--muted)]">近 30 天兑换</div>
          <div className="mt-1 text-2xl font-black">{n(last30)}</div>
          <div className="mt-2 flex h-10 items-end gap-[2px]">
            {daily.map((day) => (
              <div key={day.date} className="group relative flex-1 rounded-t-[2px] bg-[var(--accent)]" style={{ height: `${Math.max(6, (day.count / maxDaily) * 100)}%`, opacity: day.count > 0 ? 0.9 : 0.18 }}>
                <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-white group-hover:block">{day.date.slice(5)} · {day.count}</span>
              </div>
            ))}
            {daily.length === 0 && (booting ? <div className="h-4 w-full animate-pulse rounded-[6px] bg-[var(--line)]" /> : <div className="text-[11px] font-bold text-[var(--muted)]">暂无数据</div>)}
          </div>
        </div>
      </div>

      {/* ---- 供应商应付 + 热销 Top5 ---- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="供应商应付汇总（履约口径）">
          {booting ? <Skeleton rows={4} className="" /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] font-bold uppercase text-[var(--muted)]"><th className="py-2">供应商</th><th>履约件数</th><th>应付金额</th></tr></thead>
            <tbody>
              {(mall?.supplierSettlement ?? []).map((row) => (
                <tr key={row.supplier} className="border-t border-[var(--line)] font-bold"><td className="py-2.5">{row.supplier}</td><td>{row.qty}</td><td>R$ {row.payable.toFixed(2)}</td></tr>
              ))}
              {(mall?.supplierSettlement ?? []).length === 0 && <tr><td colSpan={3} className="py-6 text-center text-[var(--muted)]">暂无履约订单。</td></tr>}
            </tbody>
          </table>
          )}
        </SectionCard>

        <SectionCard title="热销商品 Top 5（兑换次数）">
          {booting ? <Skeleton rows={4} className="" /> : (
          <div className="space-y-2">
            {(summary?.topProducts ?? []).map((row, i) => (
              <div key={row.name} className="flex items-center gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--accent)]/15 text-xs font-bold text-[var(--accent)]">{i + 1}</span>
                <span className="flex-1 truncate text-sm font-bold">{row.name}</span>
                <span className="text-sm font-bold">{row.count}</span>
              </div>
            ))}
            {(summary?.topProducts ?? []).length === 0 && <div className="py-6 text-center text-sm font-bold text-[var(--muted)]">暂无兑换数据。</div>}
          </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
