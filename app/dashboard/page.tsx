"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Bike, Building2, CalendarDays, Gift, Headset, RefreshCcw, Store, TrendingUp, Users } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
import { SectionCard, Stat, TodoCard } from "../components/kit";
import { readSession } from "../lib/session";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";

type Overview = {
  generatedAt: string;
  network: { franchises: number; stations: number; riders: number; accounts: number };
  dispatch: { upcomingShifts: number; planned: number; pendingSignups: number; approvedSignups: number };
  kpi: { date: string | null; riders: number; completedOrders: number; settleTotal: number; lowAr: number };
  finance: { pendingWithdrawals: number; pendingAmount: number; paidTotal: number };
  support: { openTickets: number };
  mall: { inTransit: number; awaitingPickup: number };
};

/** Kit `Stat` wrapped in a Link so every metric card jumps to its module. */
function StatLink({ href, label, value, hint }: { href: string; label: string; value: string; hint?: string }) {
  return (
    <Link href={href} className="block h-full transition-transform hover:-translate-y-0.5">
      <Stat label={label} value={value} hint={hint} />
    </Link>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
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
        eyebrow={d ? t("dynLiveUpdated", { x: d.generatedAt }) : t("dpLoading")}
        action={<button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> 刷新</button>}
      />

      {!d ? (
        <div className="panel p-6 text-sm font-bold text-[var(--muted)]">加载中...</div>
      ) : (
        <div className="space-y-4">
          {/* ---- 今天要处理什么：待处理数字置顶，点击直达模块 ---- */}
          <div>
            <div className="mb-2 text-xs font-black uppercase text-[var(--muted)]">今天要处理什么</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <TodoCard size="sm" label="待审核报名" value={d.dispatch.pendingSignups} tone={d.dispatch.pendingSignups > 0 ? "warn" : "neutral"} hint="排班报名等待审核" onClick={() => router.push("/dispatch")} />
              <TodoCard size="sm" label="待付提现" value={d.finance.pendingWithdrawals} tone={d.finance.pendingWithdrawals > 0 ? "danger" : "neutral"} hint={t("dynPendingWithdraw", { x: d.finance.pendingAmount.toFixed(2) })} onClick={() => router.push("/wallet")} />
              <TodoCard size="sm" label="待处理工单" value={d.support.openTickets} tone={d.support.openTickets > 0 ? "warn" : "neutral"} hint="客服工单等待回复" onClick={() => router.push("/support")} />
              <TodoCard size="sm" label="商城待取" value={d.mall.awaitingPickup} tone={d.mall.awaitingPickup > 0 ? "info" : "neutral"} hint={`在途 ${d.mall.inTransit} 件`} onClick={() => router.push("/mall")} />
              <TodoCard size="sm" label="AR<95% 骑手" value={d.kpi.lowAr} tone={d.kpi.lowAr > 0 ? "danger" : "neutral"} hint="达成率低于考核线" onClick={() => router.push("/performance")} />
            </div>
          </div>

          {/* ---- 关键指标分组 ---- */}
          <SectionCard title={<span className="inline-flex items-center gap-2"><Building2 size={14} /> 网络规模</span>}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatLink href="/pontos" label="加盟商" value={String(d.network.franchises)} />
              <StatLink href="/pontos" label="站点" value={String(d.network.stations)} />
              <StatLink href="/riders" label="注册骑手" value={String(d.network.riders)} />
              <StatLink href="/users" label="系统账号" value={String(d.network.accounts)} />
            </div>
          </SectionCard>

          <SectionCard title={<span className="inline-flex items-center gap-2"><CalendarDays size={14} /> 排班调度</span>}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatLink href="/dispatch" label="未来班次" value={String(d.dispatch.upcomingShifts)} />
              <StatLink href="/dispatch" label="计划名额" value={String(d.dispatch.planned)} />
              <StatLink href="/dispatch" label="待审核报名" value={String(d.dispatch.pendingSignups)} />
              <StatLink href="/dispatch" label="已通过报名" value={String(d.dispatch.approvedSignups)} />
            </div>
          </SectionCard>

          <SectionCard title={<span className="inline-flex items-center gap-2"><TrendingUp size={14} /> 最近 T+1（{d.kpi.date ?? "—"}）</span>}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatLink href="/performance" label="活跃骑手" value={String(d.kpi.riders)} />
              <StatLink href="/performance" label="完单总数" value={String(d.kpi.completedOrders)} />
              <StatLink href="/performance" label="结算总额" value={`R$ ${d.kpi.settleTotal.toFixed(2)}`} />
              <StatLink href="/performance" label="AR<95% 骑手" value={String(d.kpi.lowAr)} />
            </div>
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard title={<span className="inline-flex items-center gap-2"><Banknote size={14} /> 财务</span>}>
              <div className="grid grid-cols-2 gap-3">
                <StatLink href="/wallet" label={t("dynPendingWithdraw", { x: d.finance.pendingAmount.toFixed(2) })} value={String(d.finance.pendingWithdrawals)} />
                <StatLink href="/wallet" label="累计已付提现" value={`R$ ${d.finance.paidTotal.toFixed(2)}`} />
              </div>
            </SectionCard>

            <SectionCard title={<span className="inline-flex items-center gap-2"><Headset size={14} /> 客服工单</span>}>
              <div className="grid gap-3">
                <StatLink href="/support" label="待处理工单" value={String(d.support.openTickets)} hint="工单中心" />
              </div>
            </SectionCard>

            <SectionCard title={<span className="inline-flex items-center gap-2"><Gift size={14} /> 商城</span>}>
              <div className="grid grid-cols-2 gap-3">
                <StatLink href="/mall" label="在途" value={String(d.mall.inTransit)} />
                <StatLink href="/mall" label="待取" value={String(d.mall.awaitingPickup)} />
              </div>
            </SectionCard>
          </div>

          {/* ---- 快捷入口 ---- */}
          <SectionCard title="快捷入口">
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
          </SectionCard>
        </div>
      )}
    </AppShell>
  );
}
