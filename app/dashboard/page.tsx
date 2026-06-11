"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, Bike, Building2, CalendarDays, Gift, Headset, RefreshCcw, Store, TrendingUp, Users } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
import { readSession } from "../lib/session";

type Overview = {
  generatedAt: string;
  network: { franchises: number; stations: number; riders: number; accounts: number };
  dispatch: { upcomingShifts: number; planned: number; pendingSignups: number; approvedSignups: number };
  kpi: { date: string | null; riders: number; completedOrders: number; settleTotal: number; lowAr: number };
  finance: { pendingWithdrawals: number; pendingAmount: number; paidTotal: number };
  support: { openTickets: number };
  mall: { inTransit: number; awaitingPickup: number };
};

function Stat({ label, value, accent, href, alert }: { label: string; value: string | number; accent?: boolean; href?: string; alert?: boolean }) {
  const card = (
    <div className={`panel h-full p-4 transition-transform hover:-translate-y-0.5 ${alert ? "border-[var(--warning)] bg-[var(--warning-bg)]" : ""}`}>
      <div className={`text-2xl font-black ${alert ? "text-[var(--warning-ink)]" : accent ? "text-[var(--accent)]" : ""}`}>{value}</div>
      <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

export default function DashboardPage() {
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(() => ({ "x-vento-role": session?.role ?? "Super Admin" }), [session]);
  const [data, setData] = useState<Overview | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/overview", { headers, cache: "no-store" });
    if (response.ok) setData((await response.json()).data);
  }, [headers]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const d = data;

  return (
    <AppShell>
      <PageTitle
        title="总部仪表盘"
        eyebrow={d ? `实时数据 · 更新于 ${d.generatedAt}` : "加载中..."}
        action={<button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> 刷新</button>}
      />

      {!d ? (
        <div className="panel p-6 text-sm font-bold text-[var(--muted)]">加载中...</div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Building2 size={14} /> 网络规模</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="加盟商" value={d.network.franchises} href="/pontos" />
              <Stat label="站点" value={d.network.stations} href="/pontos" />
              <Stat label="注册骑手" value={d.network.riders} accent href="/riders" />
              <Stat label="系统账号" value={d.network.accounts} href="/users" />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><CalendarDays size={14} /> 排班调度</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="未来班次" value={d.dispatch.upcomingShifts} href="/dispatch" />
              <Stat label="计划名额" value={d.dispatch.planned} href="/dispatch" />
              <Stat label="待审核报名" value={d.dispatch.pendingSignups} alert={d.dispatch.pendingSignups > 0} href="/dispatch" />
              <Stat label="已通过报名" value={d.dispatch.approvedSignups} accent href="/dispatch" />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><TrendingUp size={14} /> 最近 T+1（{d.kpi.date ?? "—"}）</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="活跃骑手" value={d.kpi.riders} href="/performance" />
              <Stat label="完单总数" value={d.kpi.completedOrders} accent href="/performance" />
              <Stat label="结算总额" value={`R$ ${d.kpi.settleTotal.toFixed(2)}`} accent href="/performance" />
              <Stat label="AR<95% 骑手" value={d.kpi.lowAr} alert={d.kpi.lowAr > 0} href="/performance" />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Banknote size={14} /> 财务 · 客服 · 商城</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label={`待付提现（R$ ${d.finance.pendingAmount.toFixed(2)}）`} value={d.finance.pendingWithdrawals} alert={d.finance.pendingWithdrawals > 0} href="/wallet" />
              <Stat label="累计已付提现 R$" value={d.finance.paidTotal.toFixed(2)} href="/wallet" />
              <Stat label="待处理工单" value={d.support.openTickets} alert={d.support.openTickets > 0} href="/support" />
              <Stat label="商城在途 / 待取" value={`${d.mall.inTransit} / ${d.mall.awaitingPickup}`} href="/mall" />
            </div>
          </div>

          <div className="panel p-4">
            <div className="mb-2 text-xs font-black uppercase text-[var(--muted)]">快捷入口</div>
            <div className="flex flex-wrap gap-2">
              <Link href="/dispatch" className="tag inline-flex items-center gap-1"><CalendarDays size={13} /> 运力调度</Link>
              <Link href="/performance" className="tag inline-flex items-center gap-1"><TrendingUp size={13} /> KPI 考核</Link>
              <Link href="/wallet" className="tag inline-flex items-center gap-1"><Banknote size={13} /> 结算提现</Link>
              <Link href="/pontos" className="tag inline-flex items-center gap-1"><Store size={13} /> 网络架构</Link>
              <Link href="/riders" className="tag inline-flex items-center gap-1"><Bike size={13} /> 骑手档案</Link>
              <Link href="/mall" className="tag inline-flex items-center gap-1"><Gift size={13} /> 商城管理</Link>
              <Link href="/support" className="tag inline-flex items-center gap-1"><Headset size={13} /> 工单中心</Link>
              <Link href="/users" className="tag inline-flex items-center gap-1"><Users size={13} /> 用户权限</Link>
            </div>
          </div>

          {(d.dispatch.pendingSignups > 0 || d.finance.pendingWithdrawals > 0 || d.support.openTickets > 0 || d.kpi.lowAr > 0) && (
            <div className="panel border-[var(--warning)] bg-[var(--warning-bg)] p-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--warning-ink)]"><AlertTriangle size={14} /> 今日待办</div>
              <ul className="mt-2 space-y-1 text-sm font-bold text-[var(--warning-ink)]">
                {d.dispatch.pendingSignups > 0 && <li>· {d.dispatch.pendingSignups} 条排班报名待审核 → <Link href="/dispatch" className="underline">去处理</Link></li>}
                {d.finance.pendingWithdrawals > 0 && <li>· {d.finance.pendingWithdrawals} 笔提现待付款（R$ {d.finance.pendingAmount.toFixed(2)}）→ <Link href="/wallet" className="underline">去处理</Link></li>}
                {d.support.openTickets > 0 && <li>· {d.support.openTickets} 条工单待回复 → <Link href="/support" className="underline">去处理</Link></li>}
                {d.kpi.lowAr > 0 && <li>· {d.kpi.lowAr} 名骑手 AR 低于 95% → <Link href="/performance" className="underline">查看</Link></li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
