"use client";

import { AppShell, PageTitle } from "../components/ui";
import PointsEconomyPanel from "./points-economy-panel";

/**
 * /points-economy — PontoSys console page. The whole workbench lives in
 * PointsEconomyPanel (./points-economy-panel.tsx), which the PontoMall back
 * office reuses as its 积分 tab; this file only supplies the console chrome.
 */
export default function PointsEconomyPage() {
  return (
    <AppShell>
      <PageTitle title="积分经济" eyebrow="积分规则 · 金钱等价 · 用户余额 · 账本" />
      <PointsEconomyPanel />
    </AppShell>
  );
}
