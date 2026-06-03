"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, CheckCheck, ClipboardCheck, FileBarChart2, ShieldCheck, Star, UserCheck } from "lucide-react";
import { AppShell, Badge, Button, DataTable, Field, PageTitle } from "../components/ui";
import { useVentoStore } from "../lib/store";
import type { Language } from "../lib/i18n";
import type { RiderSlot, SlotEnrollment, SlotWorkflowStep } from "../lib/slots";

type SlotPayload = {
  data: {
    featureFlag: string;
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
    slots: RiderSlot[];
    enrollments: SlotEnrollment[];
    workflow: SlotWorkflowStep[];
  };
};

const copy: Record<Language, {
  title: string;
  eyebrow: string;
  action: string;
  riderView: string;
  workflow: string;
  pontoQueue: string;
  franchiseQueue: string;
  hqSummary: string;
  boardTitle: string;
  boardHint: string;
}> = {
  zh: {
    title: "骑手排班报名",
    eyebrow: "Rider slot enrollment / Ponto review / Franchise confirmation",
    action: "模拟骑手报名",
    riderView: "骑手报名视图",
    workflow: "审批流程",
    pontoQueue: "站点审核队列",
    franchiseQueue: "加盟商确认队列",
    hqSummary: "总部汇总",
    boardTitle: "周排班容量表",
    boardHint: "骑手端看到可报名时段；站点审核容量和适配度；加盟商确认后进入总部汇总。",
  },
  en: {
    title: "Rider Slot Enrollment",
    eyebrow: "Rider slot enrollment / Ponto review / Franchise confirmation",
    action: "Simulate rider submit",
    riderView: "Rider view",
    workflow: "Approval workflow",
    pontoQueue: "Ponto review queue",
    franchiseQueue: "Franchise confirmation queue",
    hqSummary: "HQ summary",
    boardTitle: "Weekly slot capacity board",
    boardHint: "Riders see available slots; Pontos review capacity and fit; franchises confirm before HQ receives aggregate data.",
  },
  pt: {
    title: "Inscrição de Slots",
    eyebrow: "Inscrição do motoboy / revisão Ponto / confirmação da franquia",
    action: "Simular inscrição",
    riderView: "Visão do motoboy",
    workflow: "Fluxo de aprovação",
    pontoQueue: "Fila do Ponto",
    franchiseQueue: "Fila da franquia",
    hqSummary: "Resumo matriz",
    boardTitle: "Capacidade semanal",
    boardHint: "Motoboys veem slots disponíveis; Pontos revisam capacidade; franquias confirmam antes do resumo da matriz.",
  },
};

const dayOrder = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export default function SlotEnrollmentPage() {
  const language = useVentoStore((state) => state.language);
  const t = copy[language];
  const [payload, setPayload] = useState<SlotPayload["data"] | null>(null);
  const [message, setMessage] = useState("Beta preview");

  useEffect(() => {
    let active = true;
    fetch("/api/slots", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: SlotPayload) => {
        if (active) setPayload(data.data);
      });
    return () => {
      active = false;
    };
  }, []);

  const slotsByDay = useMemo(() => {
    const slots = payload?.slots ?? [];
    return dayOrder.map((day) => ({
      day,
      slots: slots.filter((slot) => slot.dayKey === day),
    }));
  }, [payload]);

  async function simulateEnrollment() {
    const nextSlot = payload?.slots.find((slot) => slot.status === "open" && slot.enrolled < slot.capacity && !payload.enrollments.some((item) => item.slotId === slot.id && item.riderId === "r-1002"));
    if (!nextSlot) {
      setMessage("No available demo slot.");
      return;
    }

    const response = await fetch("/api/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotId: nextSlot.id,
        riderId: "r-1002",
        riderName: "Andre Santos",
        riderTier: 5,
        note: "Demo rider submitted from MePonto app.",
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error ?? "Submit failed.");
      return;
    }
    const fresh = await fetch("/api/slots", { cache: "no-store" }).then((item) => item.json() as Promise<SlotPayload>);
    setPayload(fresh.data);
    setMessage(`${result.data.id} submitted for Ponto review.`);
  }

  const summary = payload?.summary;
  const submitted = (payload?.enrollments ?? []).filter((item) => item.status === "submitted");
  const pontoApproved = (payload?.enrollments ?? []).filter((item) => item.status === "ponto_approved");

  return (
    <AppShell>
      <PageTitle
        title={t.title}
        eyebrow={t.eyebrow}
        action={
          <Button type="button" onClick={simulateEnrollment}>
            <UserCheck size={17} />
            {t.action}
          </Button>
        }
      />

      <section className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Field label="Week" value={summary?.week ?? "-"} />
        <Field label="Slots" value={summary?.slots ?? 0} />
        <Field label="Capacity" value={summary?.capacity ?? 0} />
        <Field label="Enrolled" value={summary?.enrolled ?? 0} />
        <Field label="Fill rate" value={`${summary?.fillRate ?? 0}%`} />
        <Field label="Ponto pending" value={summary?.submitted ?? 0} />
        <Field label="Franchise pending" value={summary?.pontoApproved ?? 0} />
        <Field label="Confirmed" value={summary?.franchiseConfirmed ?? 0} />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase text-[#8b5cf6]">{payload?.featureFlag ?? "slot_enrollment_beta"}</div>
              <h2 className="mt-1 text-xl font-black">{t.boardTitle}</h2>
              <p className="mt-1 text-sm leading-6 text-[#8b8ba3]">{t.boardHint}</p>
            </div>
            <Badge value={message} />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-7">
            {slotsByDay.map(({ day, slots }) => (
              <div key={day} className="min-w-0 rounded border border-[#2a2a4a] bg-[#0d0d1a] p-3">
                <div className="text-center text-lg font-black">{slots[0]?.weekday ?? day}</div>
                <div className="mt-1 text-center text-sm font-bold text-[#8b8ba3]">{formatMonthDay(slots[0]?.date)}</div>
                <div className="mt-3 grid gap-2">
                  {slots.map((slot) => (
                    <SlotCard key={slot.id} slot={slot} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="panel p-4">
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="text-[#06d6a0]" size={18} />
              <h2 className="text-lg font-black">{t.workflow}</h2>
            </div>
            <div className="grid gap-2">
              {(payload?.workflow ?? []).map((step) => (
                <div key={step.key} className="rounded border border-[#2a2a4a] bg-[#0d0d1a] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-black text-white">{step.label}</div>
                    <Badge value={step.owner} />
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[#8b8ba3]">{step.guardrail}</div>
                  <div className="mt-2 font-mono text-[11px] text-[#a5a5bd]">{step.output}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="panel p-4">
            <div className="mb-3 flex items-center gap-2">
              <FileBarChart2 className="text-[#8b5cf6]" size={18} />
              <h2 className="text-lg font-black">{t.hqSummary}</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Priority slots" value={summary?.prioritySlots ?? 0} />
              <Field label="Read model" value="slot_weekly_summary" />
            </div>
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <ClipboardCheck className="text-[#fb923c]" size={18} />
            <h2 className="text-lg font-black">{t.pontoQueue}</h2>
          </div>
          <DataTable
            headers={["Enrollment", "Rider", "Tier", "Slot", "Status", "Note"]}
            rows={submitted.map((item) => [item.id, item.riderName, item.riderTier, describeSlot(item.slotId, payload?.slots ?? []), <Badge key="status" value={item.status} />, item.note])}
          />
        </div>
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Building2 className="text-[#06d6a0]" size={18} />
            <h2 className="text-lg font-black">{t.franchiseQueue}</h2>
          </div>
          <DataTable
            headers={["Enrollment", "Rider", "Slot", "Ponto reviewer", "Status", "Note"]}
            rows={pontoApproved.map((item) => [item.id, item.riderName, describeSlot(item.slotId, payload?.slots ?? []), item.pontoReviewedBy ?? "-", <Badge key="status" value={item.status} />, item.note])}
          />
        </div>
      </section>
    </AppShell>
  );
}

function SlotCard({ slot }: { slot: RiderSlot }) {
  const ratio = Math.min(100, Math.round((slot.enrolled / slot.capacity) * 100));
  const tone = slot.status === "ended" ? "bg-[#a5a5bd]" : slot.priority ? "bg-[#fef08a]" : "bg-[#fff3a8]";

  return (
    <div className="overflow-hidden rounded-xl bg-[#ededf1] text-[#070707]">
      <div className={`inline-flex max-w-full items-center gap-1 rounded-br-xl px-2.5 py-1 text-xs font-black ${tone}`}>
        {slot.priority ? <Star size={13} fill="currentColor" /> : null}
        {slot.status === "ended" ? "已结束" : "排班中"}
        {slot.status !== "ended" && ratio >= 100 ? <CheckCheck size={14} /> : null}
      </div>
      <div className="px-3 pb-4 pt-5 text-center">
        <div className="text-lg font-black">{slot.startTime}-{slot.endTime}</div>
        <div className="mt-2 text-lg font-black">{slot.enrolled} / {slot.capacity}</div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10">
          <div className="h-full rounded-full bg-[#ff7a00]" style={{ width: `${ratio}%` }} />
        </div>
      </div>
    </div>
  );
}

function formatMonthDay(date?: string) {
  if (!date) return "-";
  const [, month, day] = date.split("-");
  return `${day} ${Number(month)}月`;
}

function describeSlot(slotId: string, slots: RiderSlot[]) {
  const slot = slots.find((item) => item.id === slotId);
  if (!slot) return slotId;
  return `${slot.weekday} ${formatMonthDay(slot.date)} ${slot.startTime}-${slot.endTime}`;
}
