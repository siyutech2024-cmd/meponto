"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Download,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Star,
  Users,
} from "lucide-react";
import { AppShell, Badge, DataTable } from "../components/ui";
import type { RiderSlot, SlotEnrollment, SlotWorkflowStep } from "../lib/slots";
import type { Role } from "../lib/rbac";

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
      hqReviewed: number;
      prioritySlots: number;
    };
    slots: RiderSlot[];
    enrollments: SlotEnrollment[];
    workflow: SlotWorkflowStep[];
    weeks: Array<{ id: string; weekStart: string; weekEnd: string; status: string }>;
    weekStatus: string;
    source: "supabase" | "memory";
    viewer: {
      role: Role;
      portal: string;
      tenantId: string;
      organization: string;
    };
  };
};

type ReviewAction = "ponto_approve" | "franchise_confirm" | "hq_review" | "reject";
type CapacityPayload = {
  data: {
    cycle: { id: string; weekStart: string; weekEnd: string; status: string; platformCapacity: number };
    franchiseQuotas: Array<{
      id: string;
      date: string;
      startTime: string;
      endTime: string;
      franchiseTenantId: string;
      franchiseId: string;
      franchiseName: string;
      quota: number;
      stationAllocated: number;
    }>;
    stationQuotas: Array<{
      id: string;
      franchiseSlotQuotaId: string;
      stationTenantId: string;
      pontoId: string;
      pontoName: string;
      riderSlotId: string;
      quota: number;
    }>;
    availableStations: Array<{
      id: string;
      name: string;
      pontoId: string;
    }>;
  };
};

const dayOrder = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export default function SlotEnrollmentPage() {
  const [payload, setPayload] = useState<SlotPayload["data"] | null>(null);
  const [message, setMessage] = useState("正在加载当前账户的数据范围...");
  const [busyId, setBusyId] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [workspaceView, setWorkspaceView] = useState<"pending" | "roster">("pending");
  const [weekStart, setWeekStart] = useState("");
  const [capacityData, setCapacityData] = useState<CapacityPayload["data"] | null>(null);
  const [quotaInput, setQuotaInput] = useState("");
  const [capacityBusy, setCapacityBusy] = useState(false);

  async function refreshSlots(requestedWeekStart = weekStart) {
    const query = requestedWeekStart ? `?weekStart=${encodeURIComponent(requestedWeekStart)}` : "";
    const response = await fetch(`/api/slots${query}`, { cache: "no-store" });
    const result = (await response.json()) as SlotPayload & { error?: string };
    if (!response.ok || !result.data) {
      setMessage(result.error ?? "排班数据加载失败");
      return;
    }
    setPayload(result.data);
    const loadedWeekStart = result.data.summary.week.split(" / ")[0];
    setWeekStart(loadedWeekStart);
    setSelectedSlotId((current) => result.data.slots.some((slot) => slot.id === current) ? current : result.data.slots[0]?.id || "");
    await refreshCapacity(loadedWeekStart);
    setMessage(`已同步 ${result.data.viewer.organization} 的最新排班`);
  }

  async function refreshCapacity(targetWeekStart: string) {
    const response = await fetch(`/api/slots/capacity?weekStart=${encodeURIComponent(targetWeekStart)}`, { cache: "no-store" });
    const result = (await response.json()) as CapacityPayload & { error?: string };
    if (!response.ok || !result.data) {
      setCapacityData(null);
      if (response.status !== 404) setMessage(result.error ?? "名额数据加载失败");
      return;
    }
    setCapacityData(result.data);
  }

  useEffect(() => {
    void refreshSlots();
    // The first request determines the latest available business week.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!payload) return;
    const slot = payload.slots.find((item) => item.id === selectedSlotId);
    if (!slot) {
      setQuotaInput("");
      return;
    }
    const franchiseQuota = capacityData?.franchiseQuotas.find((quota) =>
      quota.date === slot.date &&
      quota.startTime === slot.startTime &&
      quota.endTime === slot.endTime &&
      quota.franchiseId === slot.franchiseId);
    const value = payload.viewer.role === "Super Admin" ? franchiseQuota?.quota : undefined;
    setQuotaInput(value == null ? "" : String(value));
  }, [capacityData, payload, selectedSlotId]);

  const days = useMemo(() => {
    const slots = payload?.slots ?? [];
    const startDate = payload?.summary.week.split(" / ")[0];
    return dayOrder.map((day, index) => {
      const daySlots = slots.filter((slot) => slot.dayKey === day);
      return {
        day,
        date: daySlots[0]?.date ?? addDays(startDate, index),
        weekday: daySlots[0]?.weekday ?? weekdayLabel(day),
        slots: daySlots,
      };
    });
  }, [payload?.slots, payload?.summary.week]);

  async function reviewEnrollment(enrollmentId: string, action: ReviewAction) {
    setBusyId(enrollmentId);
    const response = await fetch("/api/slots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollmentId, action }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error ?? "审核失败");
      setBusyId("");
      return;
    }
    await refreshSlots();
    setMessage(`${result.data.riderName} 已更新为${statusLabel(result.data.status)}`);
    setBusyId("");
  }

  async function saveQuota(quotaId: string) {
    const quota = Number(quotaInput);
    if (!Number.isInteger(quota) || quota < 0) {
      setMessage("名额必须是非负整数。");
      return;
    }
    setCapacityBusy(true);
    const response = await fetch("/api/slots/capacity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_franchise_quota", quotaId, quota }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error ?? "名额更新失败");
      setCapacityBusy(false);
      return;
    }
    await refreshSlots(weekStart);
    setMessage(`名额已更新为 ${quota} 人。`);
    setCapacityBusy(false);
  }

  async function saveStationQuota(franchiseQuotaId: string, stationTenantId: string, quota: number) {
    if (!Number.isInteger(quota) || quota < 0) {
      setMessage("站点名额必须是非负整数。");
      return;
    }
    setCapacityBusy(true);
    const response = await fetch("/api/slots/capacity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "upsert_station_quota",
        franchiseQuotaId,
        stationTenantId,
        quota,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error ?? "站点名额更新失败");
      setCapacityBusy(false);
      return;
    }
    await refreshSlots(weekStart);
    setMessage("站点名额已保存，对应骑手 slot 已同步。");
    setCapacityBusy(false);
  }

  async function setCycleStatus(status: "open" | "closed") {
    if (!capacityData) return;
    setCapacityBusy(true);
    const response = await fetch("/api/slots/capacity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_cycle_status", cycleId: capacityData.cycle.id, status }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error ?? "排班周期状态更新失败");
      setCapacityBusy(false);
      return;
    }
    await refreshSlots(weekStart);
    setMessage(status === "open" ? "本周排班已发布，骑手现在可以报名。" : "本周报名已关闭。");
    setCapacityBusy(false);
  }

  async function createNextWeek() {
    setCapacityBusy(true);
    const response = await fetch("/api/slots/capacity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clone_next_week", sourceWeekStart: weekStart }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error ?? "下一周创建失败");
      setCapacityBusy(false);
      return;
    }
    const targetWeek = String(result.data.weekStart);
    await refreshSlots(targetWeek);
    setMessage(`已创建 ${targetWeek} 开始的下一周排班，可继续调整名额。`);
    setCapacityBusy(false);
  }

  if (!payload) {
    return (
      <AppShell>
        <div className="grid min-h-[420px] place-items-center border border-[var(--line)] bg-[var(--surface)]">
          <div className="text-center">
            <RefreshCw className="mx-auto animate-spin text-[var(--accent)]" size={24} />
            <div className="mt-3 text-sm font-black text-[var(--muted)]">正在加载排班...</div>
          </div>
        </div>
      </AppShell>
    );
  }

  const { summary, viewer, slots, enrollments } = payload;
  const isHQ = viewer.role === "Super Admin";
  const isFranchise = viewer.role === "Franchise Admin";
  const isStation = viewer.role === "Ponto Manager";
  const submitted = enrollments.filter((item) => item.status === "submitted");
  const pontoApproved = enrollments.filter((item) => item.status === "ponto_approved");
  const franchiseConfirmed = enrollments.filter((item) => item.status === "franchise_confirmed");
  const hqReviewed = enrollments.filter((item) => item.status === "hq_reviewed");
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) ?? slots[0];
  const selectedEnrollments = enrollments.filter((item) => item.slotId === selectedSlot?.id);
  const pendingItems = isStation ? submitted : isFranchise ? pontoApproved : franchiseConfirmed;
  const pendingLabel = isStation ? "站点待审核" : isFranchise ? "加盟商待确认" : "总部待终审";
  const monthLabel = monthYearLabel(slots[0]?.date);
  const chronologicalWeeks = [...payload.weeks].sort((left, right) => left.weekStart.localeCompare(right.weekStart));
  const weekIndex = chronologicalWeeks.findIndex((item) => item.weekStart === weekStart);
  const previousWeek = weekIndex > 0 ? chronologicalWeeks[weekIndex - 1] : undefined;
  const nextWeek = weekIndex >= 0 ? chronologicalWeeks[weekIndex + 1] : undefined;
  const selectedFranchiseQuota = selectedSlot
    ? capacityData?.franchiseQuotas.find((quota) =>
        quota.date === selectedSlot.date &&
        quota.startTime === selectedSlot.startTime &&
        quota.endTime === selectedSlot.endTime &&
        quota.franchiseId === selectedSlot.franchiseId)
    : undefined;
  return (
    <AppShell>
      <section className="overflow-hidden border border-[var(--line)] bg-[var(--surface)]">
        <header className="flex min-h-24 flex-wrap items-center justify-between gap-5 border-b border-[var(--line)] px-5 py-4 lg:px-7">
          <div className="flex min-w-0 flex-wrap items-center gap-x-7 gap-y-3">
            <div>
              <div className="text-3xl font-black text-[var(--text)] lg:text-4xl">{monthLabel}</div>
              <div className="mt-1 text-xs font-bold text-[var(--muted)]">{viewer.organization}</div>
            </div>
            <div className="hidden h-10 w-px bg-[var(--line)] sm:block" />
            <LegendItem tone="muted" label="已报名骑手 / 排班名额" />
            <LegendItem tone="priority" label="重点班次" icon={<Star size={16} fill="currentColor" />} />
            <div className="flex items-center gap-2 text-xs font-black text-[#2dd4bf]">
              <span className="h-2 w-2 rounded-full bg-[#2dd4bf]" />
              {payload.source === "supabase" ? "Supabase 已连接" : "本地数据"}
            </div>
            <button type="button" title="班次状态说明" aria-label="班次状态说明" className="text-[var(--muted)]">
              <CircleHelp size={18} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {isHQ && capacityData ? (
              <button
                type="button"
                disabled={capacityBusy}
                onClick={() => void setCycleStatus(capacityData.cycle.status === "open" ? "closed" : "open")}
                className={`h-11 rounded-[8px] border px-4 text-sm font-black disabled:opacity-50 ${
                  capacityData.cycle.status === "open"
                    ? "border-[#f43f5e] text-[#fb7185]"
                    : "border-[#2dd4bf] text-[#2dd4bf]"
                }`}
              >
                {capacityData.cycle.status === "open" ? "关闭本周报名" : "发布本周报名"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={capacityBusy}
              onClick={() => nextWeek ? void refreshSlots(nextWeek.weekStart) : isHQ ? void createNextWeek() : setMessage("总部尚未创建下一周排班。")}
              className="h-11 rounded-[8px] bg-[var(--text)] px-4 text-sm font-black text-[var(--background)] disabled:opacity-50"
            >
              {nextWeek ? "查看下周排班" : isHQ ? "创建下一周排班" : "等待下周排班"}
            </button>
            <div className="flex overflow-hidden rounded-[8px] border border-[var(--line)]">
              <IconControl label="上一周" disabled={!previousWeek} onClick={() => previousWeek && void refreshSlots(previousWeek.weekStart)}><ChevronLeft size={19} /></IconControl>
              <IconControl label="下一周" disabled={!nextWeek} onClick={() => nextWeek && void refreshSlots(nextWeek.weekStart)}><ChevronRight size={19} /></IconControl>
            </div>
          </div>
        </header>

        <div className="overflow-x-auto">
          <div className="min-w-[1050px]">
            <div className="grid grid-cols-7 bg-[var(--surface-raised)]">
              {days.map(({ day, weekday }) => (
                <div key={day} className="border-r border-[var(--line)] px-4 py-5 text-center text-xl font-black last:border-r-0">
                  {weekday}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map(({ day, date, slots: daySlots }) => (
                <DayColumn
                  key={day}
                  date={date}
                  slots={daySlots}
                  selectedSlotId={selectedSlot?.id}
                  onSelect={setSelectedSlotId}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="border border-[var(--line)] bg-[var(--surface)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
            <div className="flex items-center gap-3">
              <CalendarDays className="text-[var(--accent)]" size={20} />
              <div>
                <div className="font-black">{selectedSlot ? `${selectedSlot.weekday} ${formatMonthDay(selectedSlot.date)} ${selectedSlot.startTime}-${selectedSlot.endTime}` : "请选择班次"}</div>
                <div className="mt-0.5 text-xs font-bold text-[var(--muted)]">{selectedSlot?.pontoName ?? "-"} · {selectedSlot?.franchiseName ?? "-"}</div>
              </div>
            </div>
            {selectedSlot ? <SlotStatusBadge slot={selectedSlot} /> : null}
          </div>
          <div className="grid gap-px bg-[var(--line)] sm:grid-cols-4">
            <DetailCell icon={<Users size={17} />} label="报名 / 名额" value={selectedSlot ? `${selectedSlot.enrolled} / ${selectedSlot.capacity}` : "-"} />
            <DetailCell icon={<MapPin size={17} />} label="所属站点" value={selectedSlot?.pontoName ?? "-"} />
            <DetailCell icon={<Building2 size={17} />} label="所属加盟商" value={selectedSlot?.franchiseName ?? "-"} />
            <DetailCell icon={<ClipboardCheck size={17} />} label="报名记录" value={`${selectedEnrollments.length} 条`} />
          </div>
          <div className="px-4 py-3 text-xs font-bold leading-5 text-[var(--muted)]">
            {selectedSlot?.quotaNote ?? "选择日历中的班次查看分配说明。"}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="text-xs font-black uppercase text-[var(--muted)]">本周期概览</div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Metric value={summary.capacity} label="总名额" />
              <Metric value={summary.enrolled} label="已报名" />
              <Metric value={`${summary.fillRate}%`} label="填充率" />
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface-raised)]">
              <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.min(100, summary.fillRate)}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs font-bold text-[var(--muted)]">
              <span>{summary.slots} 个班次</span>
              <span>{summary.prioritySlots} 个重点班次</span>
            </div>
          </div>
          {isHQ && selectedFranchiseQuota ? (
            <QuotaEditor
              title="总部 → 加盟商名额"
              detail={`${selectedFranchiseQuota.franchiseName} · 站点已分配 ${selectedFranchiseQuota.stationAllocated}`}
              value={quotaInput}
              onChange={setQuotaInput}
              disabled={capacityBusy}
              onSave={() => void saveQuota(selectedFranchiseQuota.id)}
            />
          ) : null}
          {isFranchise && selectedFranchiseQuota && capacityData ? (
            <StationQuotaAllocator
              franchiseQuota={selectedFranchiseQuota}
              stations={capacityData.availableStations}
              stationQuotas={capacityData.stationQuotas.filter((quota) => quota.franchiseSlotQuotaId === selectedFranchiseQuota.id)}
              disabled={capacityBusy}
              onSave={(stationTenantId, quota) => void saveStationQuota(selectedFranchiseQuota.id, stationTenantId, quota)}
            />
          ) : null}
        </div>
      </section>

      <section className="mt-4 border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <div>
            <h2 className="font-black">当前班次人员</h2>
            <div className="mt-1 text-xs font-bold text-[var(--muted)]">{selectedSlot ? `${selectedSlot.pontoName} · ${selectedSlot.startTime}-${selectedSlot.endTime}` : "请选择班次"}</div>
          </div>
          <Badge value={`${selectedEnrollments.length} 人`} />
        </div>
        <div className="p-4">
          <SlotPeople enrollments={selectedEnrollments} />
        </div>
      </section>

      <section className="mt-4 border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              {isStation ? <ClipboardCheck size={19} className="text-[#fb923c]" /> : isFranchise ? <Building2 size={19} className="text-[#2dd4bf]" /> : <ShieldCheck size={19} className="text-[var(--accent)]" />}
              <h2 className="text-lg font-black">{pendingLabel}</h2>
              <span className="grid min-w-6 place-items-center rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-xs font-black">{pendingItems.length}</span>
            </div>
            <div className="mt-1 text-xs font-bold text-[var(--muted)]">{message}</div>
          </div>

          <div className="flex items-center gap-2">
            {isHQ ? (
              <div className="flex rounded-[8px] border border-[var(--line)] p-1">
                <ViewButton active={workspaceView === "pending"} onClick={() => setWorkspaceView("pending")}>待终审</ViewButton>
                <ViewButton active={workspaceView === "roster"} onClick={() => setWorkspaceView("roster")}>最终清单</ViewButton>
              </div>
            ) : null}
            <button type="button" onClick={() => void refreshSlots()} title="刷新排班" aria-label="刷新排班" className="grid h-10 w-10 place-items-center rounded-[8px] border border-[var(--line)]">
              <RefreshCw size={17} />
            </button>
            {isHQ ? (
              <a href={`/api/slots?format=csv&weekStart=${encodeURIComponent(weekStart)}`} className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-3 text-sm font-black text-[var(--accent-ink)]">
                <Download size={16} />
                导出排班
              </a>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 p-4">
          {isHQ && workspaceView === "roster" ? (
            <FinalRoster enrollments={hqReviewed} slots={slots} />
          ) : (
            <ReviewQueue
              role={viewer.role}
              enrollments={pendingItems}
              slots={slots}
              busyId={busyId}
              onReview={reviewEnrollment}
            />
          )}
        </div>
      </section>
    </AppShell>
  );
}

function DayColumn({
  date,
  slots,
  selectedSlotId,
  onSelect,
}: {
  date: string;
  slots: RiderSlot[];
  selectedSlotId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="min-w-0 border-r border-[var(--line)] p-3 last:border-r-0">
      <div className="px-1 pb-4 pt-2 text-2xl font-black">{formatDayMonth(date)}</div>
      <div className="grid gap-3">
        {slots.map((slot) => (
          <ScheduleCard
            key={slot.id}
            slot={slot}
            selected={slot.id === selectedSlotId}
            onClick={() => onSelect(slot.id)}
          />
        ))}
        {!slots.length ? (
          <div className="grid min-h-48 place-items-center rounded-[8px] border border-dashed border-[var(--line)] bg-[var(--surface-raised)] px-3 text-center text-xs font-bold text-[var(--muted)]">
            本日暂无本站点班次
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ScheduleCard({ slot, selected, onClick }: { slot: RiderSlot; selected: boolean; onClick: () => void }) {
  const full = slot.enrolled >= slot.capacity;
  const ended = slot.status === "ended";
  const status = ended ? "已结束" : full ? "已满员" : "排班中";
  const statusTone = ended ? "bg-[#a8adb7] text-[#111827]" : full ? "bg-[#4f67ff] text-white" : "bg-[#fff09a] text-[#181400]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative min-h-48 w-full overflow-hidden rounded-[8px] border text-left transition-colors ${selected ? "border-[var(--accent)] bg-[var(--surface-hover)]" : "border-transparent bg-[var(--surface-raised)] hover:border-[var(--muted)]"}`}
    >
      <span className={`inline-flex h-9 items-center gap-1 rounded-br-[8px] px-3 text-sm font-black ${statusTone}`}>
        {slot.priority ? <Star size={15} fill="currentColor" /> : null}
        {status}
        {full && ended ? <Check size={15} /> : null}
      </span>
      <div className="grid min-h-36 place-content-center px-3 pb-4 pt-2 text-center">
        <div className="text-lg font-black">{slot.startTime}-{slot.endTime}</div>
        <div className="mt-3 text-2xl font-black">{slot.enrolled} / {slot.capacity}</div>
        <div className="mt-3 line-clamp-2 text-[11px] font-bold leading-4 text-[var(--muted)]">{slot.pontoName}</div>
      </div>
    </button>
  );
}

function ReviewQueue({
  role,
  enrollments,
  slots,
  busyId,
  onReview,
}: {
  role: Role;
  enrollments: SlotEnrollment[];
  slots: RiderSlot[];
  busyId: string;
  onReview: (id: string, action: ReviewAction) => void;
}) {
  const isStation = role === "Ponto Manager";
  const isFranchise = role === "Franchise Admin";
  return (
    <DataTable
      headers={isStation
        ? ["骑手", "等级", "班次", "站点", "提交时间", "操作"]
        : isFranchise
          ? ["骑手", "班次", "站点", "站点审核人", "操作"]
          : ["骑手", "班次", "站点", "加盟商", "确认人", "操作"]}
      rows={enrollments.map((item) => {
        const slot = findSlot(item.slotId, slots);
        const base = isStation
          ? [item.riderName, `Tier ${item.riderTier}`, describeSlot(item.slotId, slots), slot?.pontoName ?? "-", item.submittedAt]
          : isFranchise
            ? [item.riderName, describeSlot(item.slotId, slots), slot?.pontoName ?? "-", item.pontoReviewedBy ?? "-"]
            : [item.riderName, describeSlot(item.slotId, slots), slot?.pontoName ?? "-", slot?.franchiseName ?? "-", item.franchiseConfirmedBy ?? "-"];
        return [
          ...base,
          isStation ? (
            <div key={item.id} className="flex gap-2">
              <ActionButton disabled={busyId === item.id} onClick={() => onReview(item.id, "ponto_approve")} label="通过" />
              <ActionButton danger disabled={busyId === item.id} onClick={() => onReview(item.id, "reject")} label="拒绝" />
            </div>
          ) : (
            <ActionButton
              key={item.id}
              disabled={busyId === item.id}
              onClick={() => onReview(item.id, isFranchise ? "franchise_confirm" : "hq_review")}
              label={isFranchise ? "确认" : "终审"}
            />
          ),
        ];
      })}
    />
  );
}

function FinalRoster({ enrollments, slots }: { enrollments: SlotEnrollment[]; slots: RiderSlot[] }) {
  return (
    <DataTable
      headers={["报名编号", "骑手", "班次", "站点", "加盟商", "总部审核人", "审核时间"]}
      rows={enrollments.map((item) => {
        const slot = findSlot(item.slotId, slots);
        return [
          item.id,
          item.riderName,
          describeSlot(item.slotId, slots),
          slot?.pontoName ?? "-",
          slot?.franchiseName ?? "-",
          item.hqReviewedBy ?? "-",
          item.hqReviewedAt ?? "-",
        ];
      })}
    />
  );
}

function LegendItem({ label, icon, tone }: { label: string; icon?: React.ReactNode; tone: "muted" | "priority" }) {
  return (
    <div className={`flex items-center gap-2 text-sm font-black ${tone === "muted" ? "text-[var(--muted)]" : "text-[var(--text)]"}`}>
      {icon}
      {label}
    </div>
  );
}

function IconControl({ label, onClick, children, disabled = false }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className="grid h-11 w-12 place-items-center border-r border-[var(--line)] text-[var(--muted)] last:border-r-0 hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-30">
      {children}
    </button>
  );
}

function DetailCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 bg-[var(--surface)] p-4">
      <div className="flex items-center gap-2 text-[var(--muted)]">
        {icon}
        <span className="text-[10px] font-black uppercase">{label}</span>
      </div>
      <div className="mt-2 truncate text-sm font-black">{value}</div>
    </div>
  );
}

function Metric({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div>
      <div className="text-xl font-black">{value}</div>
      <div className="mt-1 text-[10px] font-black uppercase text-[var(--muted)]">{label}</div>
    </div>
  );
}

function QuotaEditor({
  title,
  detail,
  value,
  onChange,
  onSave,
  disabled,
}: {
  title: string;
  detail: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  disabled: boolean;
}) {
  return (
    <div className="border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="text-sm font-black">{title}</div>
      <div className="mt-1 text-xs font-bold text-[var(--muted)]">{detail}</div>
      <div className="mt-3 flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Slot 名额</span>
          <input
            type="number"
            min="0"
            step="1"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-black outline-none focus:border-[var(--accent)]"
          />
        </label>
        <button type="button" disabled={disabled} onClick={onSave} className="h-10 rounded-[8px] bg-[var(--accent)] px-3 text-sm font-black text-[var(--accent-ink)] disabled:opacity-50">
          保存名额
        </button>
      </div>
    </div>
  );
}

function StationQuotaAllocator({
  franchiseQuota,
  stations,
  stationQuotas,
  disabled,
  onSave,
}: {
  franchiseQuota: CapacityPayload["data"]["franchiseQuotas"][number];
  stations: CapacityPayload["data"]["availableStations"];
  stationQuotas: CapacityPayload["data"]["stationQuotas"];
  disabled: boolean;
  onSave: (stationTenantId: string, quota: number) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setValues(Object.fromEntries(stations.map((station) => {
      const existing = stationQuotas.find((quota) => quota.stationTenantId === station.id);
      return [station.id, String(existing?.quota ?? 0)];
    })));
  }, [stationQuotas, stations]);

  const allocated = stationQuotas.reduce((sum, quota) => sum + quota.quota, 0);
  return (
    <div className="border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black">加盟商 → 站点名额</div>
          <div className="mt-1 text-xs font-bold text-[var(--muted)]">
            已分配 {allocated} / {franchiseQuota.quota} · 剩余 {Math.max(0, franchiseQuota.quota - allocated)}
          </div>
        </div>
        <Badge value={`${stations.length} 个站点`} />
      </div>
      <div className="mt-3 grid gap-2">
        {stations.map((station) => (
          <div key={station.id} className="grid grid-cols-[minmax(0,1fr)_76px_64px] items-center gap-2 border-t border-[var(--line)] pt-2 first:border-t-0 first:pt-0">
            <div className="min-w-0">
              <div className="truncate text-xs font-black">{station.name}</div>
              <div className="truncate text-[10px] font-bold text-[var(--muted)]">{station.pontoId}</div>
            </div>
            <input
              aria-label={`${station.name} 名额`}
              type="number"
              min="0"
              step="1"
              value={values[station.id] ?? "0"}
              onChange={(event) => setValues((current) => ({ ...current, [station.id]: event.target.value }))}
              className="h-9 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-black outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSave(station.id, Number(values[station.id] ?? 0))}
              className="h-9 rounded-[8px] bg-[var(--accent)] px-2 text-xs font-black text-[var(--accent-ink)] disabled:opacity-50"
            >
              保存
            </button>
          </div>
        ))}
        {!stations.length ? (
          <div className="text-xs font-bold text-[#fb7185]">当前加盟商没有已建档站点，需先配置 tenants 关系。</div>
        ) : null}
      </div>
    </div>
  );
}

function SlotPeople({ enrollments }: { enrollments: SlotEnrollment[] }) {
  if (!enrollments.length) {
    return (
      <div className="grid min-h-24 place-items-center rounded-[8px] border border-dashed border-[var(--line)] text-sm font-bold text-[var(--muted)]">
        当前 slot 暂无报名人员
      </div>
    );
  }
  return (
    <DataTable
      headers={["骑手编号", "骑手姓名", "等级", "报名状态", "提交时间", "备注"]}
      rows={enrollments.map((item) => [
        item.riderId,
        item.riderName,
        `Tier ${item.riderTier}`,
        <Badge key={`${item.id}-status`} value={statusLabel(item.status)} />,
        item.submittedAt,
        item.note || "-",
      ])}
    />
  );
}

function SlotStatusBadge({ slot }: { slot: RiderSlot }) {
  const label = slot.status === "ended" ? "已结束" : slot.enrolled >= slot.capacity ? "已满员" : "开放报名";
  return <Badge value={label} />;
}

function ViewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`h-8 rounded-[6px] px-3 text-xs font-black ${active ? "bg-[var(--text)] text-[var(--background)]" : "text-[var(--muted)]"}`}>
      {children}
    </button>
  );
}

function ActionButton({ label, onClick, disabled, danger = false }: { label: string; onClick: () => void; disabled: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-[6px] border px-3 py-1.5 text-xs font-black disabled:opacity-50 ${danger ? "border-[#f43f5e] text-[#fb7185]" : "border-[var(--accent)] text-[var(--accent)]"}`}
    >
      {label}
    </button>
  );
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    submitted: "待站点审核",
    ponto_approved: "待加盟商确认",
    franchise_confirmed: "待总部终审",
    hq_reviewed: "已进入白名单",
    rejected: "已拒绝",
  };
  return labels[status] ?? status;
}

function monthYearLabel(date?: string) {
  if (!date) return "排班";
  const [year, month] = date.split("-");
  return `${Number(month)}月 ${year}`;
}

function addDays(date: string | undefined, days: number) {
  if (!date) return "";
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function weekdayLabel(day: typeof dayOrder[number]) {
  const labels: Record<typeof dayOrder[number], string> = {
    mon: "周一",
    tue: "周二",
    wed: "周三",
    thu: "周四",
    fri: "周五",
    sat: "周六",
    sun: "周日",
  };
  return labels[day];
}

function formatDayMonth(date?: string) {
  if (!date) return "-";
  const [, month, day] = date.split("-");
  return `${day} ${Number(month)}月`;
}

function formatMonthDay(date?: string) {
  if (!date) return "-";
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function describeSlot(slotId: string, slots: RiderSlot[]) {
  const slot = findSlot(slotId, slots);
  return slot ? `${slot.weekday} ${formatMonthDay(slot.date)} ${slot.startTime}-${slot.endTime}` : slotId;
}

function findSlot(slotId: string, slots: RiderSlot[]) {
  return slots.find((item) => item.id === slotId);
}
