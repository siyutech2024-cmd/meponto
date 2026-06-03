"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, ClipboardCheck } from "lucide-react";
import { AppShell, Badge, DataTable, Field, MiniMap, PageTitle, StatCard } from "../components/ui";
import { getNetworkMetrics } from "../lib/analytics";
import { pontos } from "../lib/data";
import { translate, type TranslationKey } from "../lib/i18n";
import { useVentoStore } from "../lib/store";
import type { SlotEnrollment } from "../lib/slots";

type SlotSummaryPayload = {
  data: {
    summary: {
      week: string;
      slots: number;
      capacity: number;
      enrolled: number;
      fillRate: number;
      submitted: number;
      pontoApproved: number;
      franchiseConfirmed: number;
      prioritySlots: number;
    };
    enrollments: SlotEnrollment[];
    readModel: string;
  };
};

export default function DashboardPage() {
  const language = useVentoStore((state) => state.language);
  const riders = useVentoStore((state) => state.riders);
  const incidents = useVentoStore((state) => state.incidents);
  const activeRiders = riders.filter((rider) => rider.status === "Active" || rider.status === "Night Shift").length;
  const nightShift = riders.filter((rider) => rider.status === "Night Shift").length;
  const openIncidents = incidents.filter((incident) => incident.status !== "Closed").length;
  const metrics = getNetworkMetrics(riders, incidents);
  const t = (key: TranslationKey) => translate(language, key);
  const [slotPayload, setSlotPayload] = useState<SlotSummaryPayload["data"] | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/slots", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: SlotSummaryPayload) => {
        if (active) setSlotPayload(data.data);
      });
    return () => {
      active = false;
    };
  }, []);

  const slotSummary = slotPayload?.summary;
  const hqEnrollments = (slotPayload?.enrollments ?? []).slice(0, 5);

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
      <section className="mt-5 grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]">
                <CalendarDays size={16} />
                总部排班汇总
              </div>
              <h2 className="mt-1 text-xl font-black">Slot Weekly Summary</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--muted-strong)]">
                汇总站点审核、加盟商确认后的周排班数据，总部只读取汇总模型，不直接修改站点私有审核记录。
              </p>
            </div>
            <Link href="/slot-enrollment" className="tag">Open slots</Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Week" value={slotSummary?.week ?? "-"} />
            <Field label="Read model" value={slotPayload?.readModel ?? "slot_weekly_summary"} />
            <Field label="Total capacity" value={slotSummary?.capacity ?? 0} />
            <Field label="Enrolled" value={slotSummary?.enrolled ?? 0} />
            <Field label="Fill rate" value={`${slotSummary?.fillRate ?? 0}%`} />
            <Field label="Priority slots" value={slotSummary?.prioritySlots ?? 0} />
            <Field label="Ponto pending" value={slotSummary?.submitted ?? 0} />
            <Field label="Franchise confirmed" value={slotSummary?.franchiseConfirmed ?? 0} />
          </div>
        </div>
        <div>
          <div className="mb-3 flex items-center gap-2">
            <ClipboardCheck className="text-[var(--ok)]" size={18} />
            <h2 className="text-lg font-black">总部收到的报名状态</h2>
          </div>
          <DataTable
            headers={["Enrollment", "Rider", "Tier", "Status", "Submitted", "Ponto Review", "Franchise Confirm"]}
            rows={hqEnrollments.map((item) => [
              item.id,
              item.riderName,
              item.riderTier,
              <Badge key="status" value={item.status} />,
              item.submittedAt,
              item.pontoReviewedAt ?? "-",
              item.franchiseConfirmedAt ?? "-",
            ])}
          />
        </div>
      </section>
    </AppShell>
  );
}
