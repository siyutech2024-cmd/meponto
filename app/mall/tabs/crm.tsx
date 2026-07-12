"use client";

import CrmPanel from "../../crm/crm-panel";

/**
 * CRM(合作伙伴) — PontoMall back-office flat-management tab. Renders the SAME
 * CrmPanel as the PontoSys /crm page (zero logic copy): partner directory,
 * review actions, login-account provisioning and the category manager.
 */
export default function CrmTab() {
  return <CrmPanel />;
}
