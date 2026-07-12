"use client";

import { AppShell, PageTitle } from "../components/ui";
import MallInsightsPanel from "./insights-panel";

/**
 * 商城关键数据 — thin PontoSys page shell. The whole read-only dashboard lives
 * in MallInsightsPanel (./insights-panel.tsx), which is ALSO rendered by the
 * PontoMall back-office 数据洞察 tab (app/mall/tabs/insights.tsx) — one
 * implementation, two homes.
 */
export default function MallInsightsPage() {
  return (
    <AppShell>
      <PageTitle title="商城关键数据" eyebrow="PontoMall" />
      <p className="-mt-3 mb-5 text-sm font-bold text-[var(--muted)]">只读视图 —— 商品、订单、收款与结算的全部操作在独立商城后台完成。</p>
      <MallInsightsPanel />
    </AppShell>
  );
}
