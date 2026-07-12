"use client";

import { AppShell, PageTitle } from "../components/ui";
import CrmPanel from "./crm-panel";

/**
 * Partner CRM — thin PontoSys page shell. The whole workbench lives in
 * CrmPanel (./crm-panel.tsx), which is ALSO rendered by the PontoMall
 * back-office CRM(合作伙伴) tab (app/mall/tabs/crm.tsx) — one implementation,
 * two homes (same pattern as MembersPanel / MallInsightsPanel).
 */
export default function CrmPage() {
  return (
    <AppShell>
      <PageTitle title="Partner CRM" eyebrow="Repair, fleet, supplier network" />
      <CrmPanel />
    </AppShell>
  );
}
