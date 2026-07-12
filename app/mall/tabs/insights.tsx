"use client";

import MallInsightsPanel from "../../mall-insights/insights-panel";

/**
 * 数据洞察 — PontoMall back-office flat-management tab. Renders the SAME
 * MallInsightsPanel as the PontoSys /mall-insights page (zero logic copy);
 * hideAdminLinks because we are already inside the mall back office.
 */
export default function InsightsTab() {
  return <MallInsightsPanel hideAdminLinks />;
}
