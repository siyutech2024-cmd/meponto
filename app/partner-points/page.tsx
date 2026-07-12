"use client";

import { AppShell, PageTitle } from "../components/ui";
import PartnerPointsPanel from "./partner-points-panel";

/**
 * Pontos do parceiro — thin PontoSys page shell. The whole workbench lives in
 * PartnerPointsPanel (./partner-points-panel.tsx), which is ALSO rendered by
 * the PontoMall back-office 合作方积分 tab (app/mall/tabs/partner-points.tsx)
 * — one implementation, two homes (same pattern as MembersPanel).
 */
export default function PartnerPointsPage() {
  return (
    <AppShell>
      <PageTitle
        title="Pontos do parceiro"
        eyebrow="Registrar serviço ao entregador (escaneie o QR de membro) e creditar pontos ao parceiro"
      />
      <PartnerPointsPanel />
    </AppShell>
  );
}
