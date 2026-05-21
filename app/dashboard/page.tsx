"use client";

import { AppShell, MiniMap, PageTitle, StatCard } from "../components/ui";
import { getNetworkMetrics } from "../lib/analytics";
import { pontos } from "../lib/data";
import { translate, type TranslationKey } from "../lib/i18n";
import { useVentoStore } from "../lib/store";

export default function DashboardPage() {
  const language = useVentoStore((state) => state.language);
  const riders = useVentoStore((state) => state.riders);
  const incidents = useVentoStore((state) => state.incidents);
  const activeRiders = riders.filter((rider) => rider.status === "Active" || rider.status === "Night Shift").length;
  const nightShift = riders.filter((rider) => rider.status === "Night Shift").length;
  const openIncidents = incidents.filter((incident) => incident.status !== "Closed").length;
  const metrics = getNetworkMetrics(riders, incidents);
  const t = (key: TranslationKey) => translate(language, key);

  return (
    <AppShell>
      <PageTitle title={t("dashboardTitle")} eyebrow={t("dashboardEyebrow")} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title={t("activeRiders")} value={String(activeRiders)} delta={t("todayDelta")} href="/riders" />
        <StatCard title={t("nightShiftRiders")} value={String(nightShift)} href="/night-shift" />
        <StatCard title={t("activePontos")} value={String(pontos.length)} href="/pontos" />
        <StatCard title={t("openIncidents")} value={String(openIncidents)} href="/incidents" />
        <StatCard title={t("networkRisk")} value={`${metrics.networkRiskScore}/100`} href="/analytics" />
      </section>
      <section className="mt-5">
        <MiniMap />
      </section>
    </AppShell>
  );
}
