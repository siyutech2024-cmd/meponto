"use client";

import PartnerPointsPanel from "../../partner-points/partner-points-panel";

/**
 * 合作方积分 — PontoMall back-office flat-management tab. Renders the SAME
 * PartnerPointsPanel as the PontoSys /partner-points page (zero logic copy);
 * hideAdminLinks because CRM is a sibling tab inside this back office.
 */
export default function PartnerPointsTab() {
  return <PartnerPointsPanel hideAdminLinks />;
}
