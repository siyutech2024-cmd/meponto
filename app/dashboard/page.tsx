"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Bike, MapPinned, MessageCircle, ShieldAlert } from "lucide-react";
import { AppShell, Badge, PageTitle, StatCard } from "../components/ui";
import { getNetworkMetrics } from "../lib/analytics";
import { pontos } from "../lib/data";
import { translate, type TranslationKey } from "../lib/i18n";
import { useVentoStore } from "../lib/store";

export default function DashboardPage() {
  const language = useVentoStore((state) => state.language);
  const riders = useVentoStore((state) => state.riders);
  const incidents = useVentoStore((state) => state.incidents);
  const activeRiders = riders.filter((rider) => rider.status === "Active" || rider.status === "Night Shift").length;
  const openIncidents = incidents.filter((incident) => incident.status !== "Closed").length;
  const metrics = getNetworkMetrics(riders, incidents);
  const t = (key: TranslationKey) => translate(language, key);

  return (
    <AppShell>
      <PageTitle title={t("dashboardTitle")} eyebrow={t("dashboardEyebrow")} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title={t("activeRiders")} value={String(activeRiders)} delta={t("todayDelta")} href="/riders" />
        <StatCard title={t("activePontos")} value={String(pontos.length)} href="/pontos" />
        <StatCard title={t("openIncidents")} value={String(openIncidents)} href="/incidents" />
        <StatCard title={t("networkRisk")} value={`${metrics.networkRiskScore}/100`} href="/analytics" />
      </section>
      <section className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <div className="panel p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#2563eb]">Priority queue</div>
              <h2 className="mt-1 text-xl font-extrabold text-[#0f172a]">Needs attention</h2>
            </div>
            <Link href="/incidents" className="flex items-center gap-1 text-xs font-bold text-[#2563eb]">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="mt-4 space-y-2">
            {incidents
              .filter((incident) => incident.status !== "Closed")
              .slice(0, 3)
              .map((incident) => (
                <Link key={incident.id} href={`/incidents/${incident.id}`} className="flex items-center gap-3 rounded-lg border border-[#edf1f7] p-3 transition-colors hover:bg-[#fbfcfc]">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#fff4f5] text-[#b42333]">
                    <AlertTriangle size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-[#26332f]">{incident.rider}</div>
                    <div className="truncate text-xs text-[#536176]">{incident.ponto}</div>
                  </div>
                  <Badge value={incident.severity} />
                </Link>
              ))}
          </div>
        </div>
        <div className="panel p-5">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#2563eb]">Shortcuts</div>
          <h2 className="mt-1 text-xl font-extrabold text-[#0f172a]">Quick access</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {[
              { href: "/riders", label: "Rider management", icon: Bike },
              { href: "/pontos", label: "Ponto network", icon: MapPinned },
              { href: "/incidents", label: "Incident queue", icon: ShieldAlert },
              { href: "/whatsapp", label: "WhatsApp operations", icon: MessageCircle },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-lg border border-[#edf1f7] px-3 py-2.5 text-sm font-bold text-[#475569] transition-colors hover:border-[#dbeafe] hover:bg-[#eff6ff] hover:text-[#2563eb]">
                  <Icon size={17} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
