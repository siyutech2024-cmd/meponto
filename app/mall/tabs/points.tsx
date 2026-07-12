"use client";

import PointsEconomyPanel from "../../points-economy/points-economy-panel";

/**
 * 积分 — PontoMall back-office flat-management tab. Renders the SAME
 * PointsEconomyPanel as the PontoSys /points-economy page (zero logic copy):
 * points rules are a single global object, so editing here IS editing there.
 */
export default function PointsTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-[10px] border border-[var(--info)]/40 bg-[var(--info-bg)] px-4 py-3 text-sm font-bold text-[var(--info)]">
        积分规则全局唯一，此处修改即全网生效（PontoSys /points-economy 与商城前台同步读取同一份配置与账本）。
      </div>
      <PointsEconomyPanel />
    </div>
  );
}
