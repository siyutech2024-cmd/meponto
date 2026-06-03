"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CalendarDays, ClipboardCheck } from "lucide-react";
import { AppShell, Badge, DataTable, Field, MiniMap, PageTitle } from "../components/ui";
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
  const activeIncidents = incidents.filter((incident) => incident.status !== "Closed").slice(0, 5);

  return (
    <AppShell>
      <PageTitle
        title={t("dashboardTitle")}
        eyebrow={t("dashboardEyebrow")}
        action={<Link href="/incidents" className="tag">Open control queue</Link>}
      />
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Field label={t("activeRiders")} value={<span className="text-2xl">{activeRiders}</span>} />
        <Field label={t("nightShiftRiders")} value={<span className="text-2xl">{nightShift}</span>} />
        <Field label={t("activePontos")} value={<span className="text-2xl">{pontos.length}</span>} />
        <Field label={t("openIncidents")} value={<span className="text-2xl text-[var(--danger-ink)]">{openIncidents}</span>} />
        <Field label={t("networkRisk")} value={<span className="text-2xl">{metrics.networkRiskScore}/100</span>} />
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="panel p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--danger-ink)]">
                  <AlertTriangle size={16} />
                  Operations queue
                </div>
                <h2 className="mt-1 text-xl font-black">需要总部处理的风险</h2>
              </div>
              <Link href="/analytics" className="tag">Risk analytics</Link>
            </div>
            <DataTable
              headers={["Incident", "Rider", "Ponto", "Severity", "Status", "Responder", "Action"]}
              rows={activeIncidents.map((incident) => [
                incident.id,
                incident.rider,
                incident.ponto,
                <Badge key="severity" value={incident.severity} />,
                <Badge key="status" value={incident.status} />,
                incident.responder,
                <Link key="action" href={`/incidents/${incident.id}`} className="tag">Handle</Link>,
              ])}
            />
          </div>

          <div className="panel p-4">
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
        </div>

        <aside className="space-y-4">
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
          <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-1">
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
          <MiniMap />
        </aside>
      </section>
    </AppShell>
  );
}
