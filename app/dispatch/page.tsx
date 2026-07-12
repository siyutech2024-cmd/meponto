"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ClipboardCopy, ClipboardList, Download, Plus, RefreshCcw, Send, Star, Upload, Users, X } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
import { Chip, DataTable, Drawer, SectionCard, Stat, StatusBadge, TodoCard, Toolbar, type BadgeTone, type DataColumn } from "../components/kit";
import type { DispatchShift, ShiftQuota, ShiftSignup } from "../lib/dispatch";
import { downloadCsv } from "../lib/csv";
import { useDialog } from "../components/dialog";
import type { Franchise } from "../lib/network";
import type { Ponto } from "../lib/data";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";

function useT() {
  const language = useVentoStore((s) => s.language);
  return (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
}

type Board = { shifts: DispatchShift[]; quotas: ShiftQuota[]; signups: ShiftSignup[] };

const headers = { "Content-Type": "application/json", "x-vento-role": "Super Admin" };

const statusKey: Record<string, TranslationKey> = {
  scheduling: "dpStScheduling",
  executing: "dpStExecuting",
  finished: "dpStFinished",
  submitted: "dpStSubmitted",
  approved: "dpStApproved",
  rejected: "dpStRejected",
  reported: "dpStReported",
  cancelled: "dpStCancelled",
};

// Badge semantics: green = running fine, amber = waiting on a human,
// red = broken, gray = terminal.
const SHIFT_TONE: Record<string, BadgeTone> = {
  scheduling: "warn",
  executing: "success",
  finished: "neutral",
  cancelled: "neutral",
};

const SIGNUP_TONE: Record<string, BadgeTone> = {
  submitted: "warn",
  approved: "success",
  reported: "success",
  rejected: "danger",
  cancelled: "neutral",
};

const WEEKDAY_KEYS: TranslationKey[] = ["pfWdMon", "pfWdTue", "pfWdWed", "pfWdThu", "pfWdFri", "pfWdSat", "pfWdSun"];

const tabs = [
  { id: "board", labelKey: "dpTabBoard", icon: CalendarDays },
  { id: "quota", labelKey: "dpTabQuota", icon: Users },
  { id: "review", labelKey: "dpTabReview", icon: ClipboardList },
  { id: "report", labelKey: "dpTabReport", icon: Send },
] as const;

const SLOT_RANGES = ["11:00~14:00", "14:00~18:00", "18:00~22:00"] as const;

/** Format a Date as yyyy-mm-dd in LOCAL time. Never use toISOString for
 *  calendar dates: it converts to UTC, which in Brazil (UTC-3) shifts the
 *  whole week by a day after 21:00 — that's how "Monday" became 07-07. */
function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mondayOf(offsetWeeks: number): string {
  const now = new Date();
  const day = now.getDay() === 0 ? 7 : now.getDay();
  now.setDate(now.getDate() - day + 1 + offsetWeeks * 7);
  return localDateString(now);
}

/** Snap ANY yyyy-mm-dd to the Monday of its week (date-only math, UTC-safe). */
function mondayOfDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayKeyOf(date: string): TranslationKey {
  return WEEKDAY_KEYS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7];
}

type TabId = (typeof tabs)[number]["id"];

export default function DispatchPage() {
  const t = useT();
  const [tab, setTab] = useState<TabId>("board");
  const [board, setBoard] = useState<Board>({ shifts: [], quotas: [], signups: [] });
  const [network, setNetwork] = useState<{ franchises: Franchise[]; stations: Ponto[] }>({ franchises: [], stations: [] });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/dispatch", { headers, cache: "no-store" });
      const payload = await response.json();
      if (response.ok) setBoard(payload.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetch("/api/network", { headers, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => payload && setNetwork({ franchises: payload.data.franchises, stations: payload.data.stations }))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/dispatch", { method: "POST", headers, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? t("dpReqFail", { status: response.status }) });
      return null;
    }
    void load();
    return payload.data as Record<string, unknown>;
  }

  const byShift = useMemo(() => {
    const quotaMap = new Map<string, ShiftQuota[]>();
    for (const quota of board.quotas) {
      quotaMap.set(quota.shiftId, [...(quotaMap.get(quota.shiftId) ?? []), quota]);
    }
    const signupMap = new Map<string, ShiftSignup[]>();
    for (const signup of board.signups) {
      signupMap.set(signup.shiftId, [...(signupMap.get(signup.shiftId) ?? []), signup]);
    }
    return { quotaMap, signupMap };
  }, [board]);

  // Todo-driven header: pending review is the call to action.
  const pendingCount = board.signups.filter((s) => s.status === "submitted").length;
  const approvedCount = board.signups.filter((s) => s.status === "approved" || s.status === "reported").length;
  const schedulingCount = board.shifts.filter((s) => s.status === "scheduling").length;
  const notReportedCount = board.shifts.filter((s) => s.status !== "finished" && !s.reportedAt).length;

  return (
    <AppShell>
      <PageTitle
        title={t("dpTitle")}
        eyebrow={t("dpEyebrow")}
        action={
          <button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1">
            <RefreshCcw size={13} /> {t("pfRefresh")}
          </button>
        }
      />

      <section className="mb-4 grid gap-3 md:grid-cols-4">
        <TodoCard label={t("dpPendingCnt")} value={pendingCount} tone={pendingCount > 0 ? "warn" : "neutral"} active={tab === "review"} onClick={() => setTab("review")} hint={t("dpTabReview")} />
        <TodoCard label={t("dpNotReported")} value={notReportedCount} tone={notReportedCount > 0 ? "warn" : "neutral"} active={tab === "report"} onClick={() => setTab("report")} hint={t("dpTabReport")} />
        <Stat label={t("dpStScheduling")} value={String(schedulingCount)} />
        <Stat label={t("dpApprovedCnt")} value={String(approvedCount)} />
      </section>

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id);
              setMessage(null);
            }}
            className={`inline-flex h-10 items-center gap-2 rounded-[8px] border px-4 text-xs font-black uppercase ${tab === item.id ? "border-[var(--accent)] bg-[var(--accent-glow)] text-[var(--accent)]" : "border-[var(--line)] text-[var(--muted-strong)] hover:border-[var(--muted)]"}`}
          >
            <item.icon size={15} /> {t(item.labelKey)}
          </button>
        ))}
      </div>

      {message && (
        <div
          className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : message.tone === "warn" ? "border-[var(--warning)] bg-[var(--warning-bg)] text-[var(--warning-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}
        >
          {message.text}
        </div>
      )}

      {tab === "board" && <BoardTab board={board} byShift={byShift} loading={loading} onAction={post} setMessage={setMessage} />}
      {tab === "quota" && <QuotaTab board={board} byShift={byShift} onSave={post} setMessage={setMessage} network={network} />}
      {tab === "review" && <ReviewTab board={board} onAction={post} setMessage={setMessage} network={network} />}
      {tab === "report" && <ReportTab board={board} byShift={byShift} onAction={post} setMessage={setMessage} />}
    </AppShell>
  );
}

function statBadge(value: number, target: number) {
  if (target === 0) return "text-[var(--muted)]";
  if (value >= target) return "text-[var(--ok-ink)]";
  if (value >= target * 0.7) return "text-[var(--warning-ink)]";
  return "text-[var(--danger-ink)]";
}

function ShiftStatusBadge({ shift, label }: { shift: DispatchShift; label: string }) {
  return <StatusBadge tone={SHIFT_TONE[shift.status] ?? "info"} label={label} />;
}

function BoardTab({ board, byShift, loading, onAction, setMessage }: { board: Board; byShift: { quotaMap: Map<string, ShiftQuota[]>; signupMap: Map<string, ShiftSignup[]> }; loading: boolean; onAction: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; setMessage: (m: { tone: "ok" | "warn" | "err"; text: string } | null) => void }) {
  const t = useT();
  const dialog = useDialog();
  const [weekStart, setWeekStart] = useState(() => mondayOf(0));
  const [setupOpen, setSetupOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  const weekShifts = board.shifts
    .filter((shift) => days.includes(shift.date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.timeRange.localeCompare(b.timeRange));

  // Day × slot cells with no shift yet — one-click scheduling entry points.
  const emptySlots = days.flatMap((date) =>
    SLOT_RANGES.filter((range) => !board.shifts.some((shift) => shift.date === date && shift.timeRange === range)).map((range) => ({ date, range })),
  );

  async function quickAdd(date: string, timeRange: string) {
    const value = await dialog.prompt(t("dpQaTitle"), { message: t("dpQaMsg", { date, range: timeRange }), placeholder: t("dpQaPlaceholder") });
    if (!value) return;
    const plannedCount = Number(value.replace(/\D/g, ""));
    if (!Number.isFinite(plannedCount) || plannedCount <= 0) {
      setMessage({ tone: "warn", text: t("dpQaWarn") });
      return;
    }
    const result = await onAction({ action: "setWeek", entries: [{ date, timeRange, plannedCount }] });
    if (result) setMessage({ tone: "ok", text: t("dpQaOk", { date, range: timeRange, n: plannedCount }) });
  }

  async function removeShift(shift: DispatchShift) {
    if (!(await dialog.confirm(t("dpDelTitle"), { message: t("dpDelMsg", { date: shift.date, range: shift.timeRange, zone: shift.hotzone, n: shift.plannedCount }), tone: "danger", confirmText: t("dpDelConfirm") }))) return;
    const result = await onAction({ action: "deleteShift", shiftId: shift.id });
    if (result) setMessage({ tone: "ok", text: t("dpDelOk") });
  }

  // Week board: 7 day columns, each stacking that day's slot blocks — the
  // calendar-like view operators asked for (a flat 21-row table was unreadable).
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const shiftsByDate = new Map<string, DispatchShift[]>();
  for (const shift of weekShifts) {
    const list = shiftsByDate.get(shift.date) ?? [];
    list.push(shift);
    shiftsByDate.set(shift.date, list);
  }
  for (const list of shiftsByDate.values()) list.sort((a, b) => a.timeRange.localeCompare(b.timeRange));

  function SlotBlock({ shift }: { shift: DispatchShift }) {
    const franchiseQuota = (byShift.quotaMap.get(shift.id) ?? []).filter((quota) => quota.level === "franchise").reduce((sum, quota) => sum + quota.quota, 0);
    const approved = (byShift.signupMap.get(shift.id) ?? []).filter((signup) => signup.status === "approved" || signup.status === "reported").length;
    const pending = (byShift.signupMap.get(shift.id) ?? []).filter((signup) => signup.status === "submitted").length;
    return (
      <div className="group rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-2.5 transition-colors hover:border-[var(--accent)]">
        <div className="flex items-center justify-between gap-1">
          <span className="inline-flex items-center gap-1 text-[13px] font-black" translate="no">
            {shift.isCritical && <Star size={11} className="text-[var(--accent)]" />}
            {shift.timeRange}
          </span>
          <button
            type="button"
            onClick={() => void removeShift(shift)}
            className="rounded p-0.5 text-[var(--muted)] opacity-0 transition-opacity hover:text-[var(--danger-ink)] group-hover:opacity-100"
            aria-label={t("dpDelTitle")}
          >
            <X size={13} />
          </button>
        </div>
        <div className="mt-0.5 truncate text-[10px] font-bold text-[var(--muted)]">{shift.hotzone}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <ShiftStatusBadge shift={shift} label={statusKey[shift.status] ? t(statusKey[shift.status]) : shift.status} />
          {shift.reportedAt && <StatusBadge tone="success" label={t("dpStReported")} />}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1 text-center" translate="no">
          <div>
            <div className="text-[9px] font-black uppercase text-[var(--muted)]">{t("dpQuota99")}</div>
            <div className="text-sm font-black">{shift.plannedCount}</div>
          </div>
          <div>
            <div className="text-[9px] font-black uppercase text-[var(--muted)]">{t("dpAllocated")}</div>
            <div className={`text-sm font-black ${statBadge(franchiseQuota, shift.plannedCount)}`}>{franchiseQuota}</div>
          </div>
          <div>
            <div className="text-[9px] font-black uppercase text-[var(--muted)]">{t("dpApprovedCnt")}</div>
            <div className={`text-sm font-black ${statBadge(approved, shift.plannedCount)}`}>{approved}</div>
          </div>
          <div>
            <div className="text-[9px] font-black uppercase text-[var(--muted)]">{t("dpPendingCnt")}</div>
            <div className={`text-sm font-black ${pending > 0 ? "text-[var(--warning-ink)]" : "text-[var(--muted)]"}`}>{pending}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Toolbar
        right={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setImportOpen(true)} className="tag inline-flex items-center gap-1">
              <Upload size={13} /> {t("dpTabImport")}
            </button>
            <button type="button" onClick={() => setSetupOpen(true)} className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]">
              <Plus size={14} /> {t("dpTabSetup")}
            </button>
          </div>
        }
      >
        <button type="button" className="tag" onClick={() => setWeekStart(addDays(weekStart, -7))}>{t("dpPrevWeek")}</button>
        <div key={weekStart} translate="no" className="text-sm font-black">
          {weekStart} ~ {addDays(weekStart, 6)}
          <span className="ml-2 text-[10px] font-black uppercase text-[var(--muted)]">{t("dpWeekShifts", { n: weekShifts.length })}</span>
        </div>
        <button type="button" className="tag" onClick={() => setWeekStart(addDays(weekStart, 7))}>{t("dpNextWeek")}</button>
        <button type="button" className="tag" onClick={() => setWeekStart(mondayOf(0))}>{t("dpThisWeek")}</button>
        <button type="button" className="tag" onClick={() => setWeekStart(mondayOf(1))}>{t("dpNextWk")}</button>
      </Toolbar>

      {loading && board.shifts.length === 0 ? (
        <div className="panel p-6 text-sm font-bold text-[var(--muted)]">{t("dpLoading")}</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {weekDates.map((date) => {
            const dayShifts = shiftsByDate.get(date) ?? [];
            return (
              <div key={date} className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-2">
                <div className="mb-2 flex items-baseline justify-between px-1" translate="no">
                  <span className="text-sm font-black">{date.slice(5)}</span>
                  <span className="text-[10px] font-bold text-[var(--muted)]">{t(weekdayKeyOf(date))}{dayShifts.length > 0 ? ` · ${dayShifts.length}` : ""}</span>
                </div>
                <div className="space-y-2">
                  {dayShifts.map((shift) => (
                    <SlotBlock key={shift.id} shift={shift} />
                  ))}
                  {dayShifts.length === 0 && (
                    <div className="grid h-16 place-items-center rounded-[10px] border border-dashed border-[var(--line)] text-[10px] font-bold text-[var(--muted)]">—</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {emptySlots.length > 0 && (
        <SectionCard title={t("dpAddShift")} desc={t("dpQaTitle")}>
          <div className="flex flex-wrap gap-2">
            {emptySlots.map(({ date, range }) => (
              <button
                key={`${date}|${range}`}
                type="button"
                onClick={() => void quickAdd(date, range)}
                className="rounded-[8px] border border-dashed border-[var(--line)] px-3 py-2 text-[11px] font-black text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                {t(weekdayKeyOf(date))} {date.slice(5)} · {range}
              </button>
            ))}
          </div>
        </SectionCard>
      )}

      <Drawer open={setupOpen} onClose={() => setSetupOpen(false)} width={860} ariaLabel={t("dpTabSetup")} title={<div className="text-sm font-black uppercase">{t("dpTabSetup")}</div>}>
        <WeekSetupForm board={board} onSave={onAction} setMessage={setMessage} />
      </Drawer>

      <Drawer open={importOpen} onClose={() => setImportOpen(false)} width={560} ariaLabel={t("dpTabImport")} title={<div className="text-sm font-black uppercase">{t("dpTabImport")}</div>}>
        <ImportForm onImport={onAction} setMessage={setMessage} />
      </Drawer>
    </div>
  );
}

function WeekSetupForm({ board, onSave, setMessage }: { board: Board; onSave: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; setMessage: (m: { tone: "ok" | "warn" | "err"; text: string } | null) => void }) {
  const t = useT();
  const [weekStart, setWeekStart] = useState(() => mondayOf(1));
  const [hotzone, setHotzone] = useState("Santo Amaro");
  const [grid, setGrid] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  // Prefill from existing shifts whenever week/hotzone/board changes.
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const date of days) {
      for (const range of SLOT_RANGES) {
        const existing = board.shifts.find((shift) => shift.date === date && shift.timeRange === range && shift.hotzone === hotzone);
        if (existing) next[`${date}|${range}`] = String(existing.plannedCount);
      }
    }
    setGrid(next);
  }, [days, hotzone, board.shifts]);

  const input = "h-11 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";

  return (
    <div className="space-y-5">
      <div className="text-sm font-bold leading-6 text-[var(--muted-strong)]">
        {t("dpSetupDesc")}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-xs font-black uppercase text-[var(--muted)]">
          {t("dpMondayDate")}
          {/* Any picked date snaps to its week's Monday — operators shouldn't
              need to know which day the week starts on. */}
          <input type="date" className={`${input} mt-1.5 w-full`} value={weekStart} onChange={(e) => e.target.value && setWeekStart(mondayOfDate(e.target.value))} />
        </label>
        <label className="text-xs font-black uppercase text-[var(--muted)]">
          {t("dpHotzone")}
          <input className={`${input} mt-1.5 w-full`} value={hotzone} onChange={(e) => setHotzone(e.target.value)} />
        </label>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => setWeekStart(mondayOf(0))} className="tag">{t("dpThisWeek")}</button>
        <button type="button" onClick={() => setWeekStart(mondayOf(1))} className="tag">{t("dpNextWk")}</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-center text-sm">
          <thead>
            <tr className="text-[10px] font-black uppercase text-[var(--muted)]">
              <th className="pb-2 text-left">{t("dpSlot")}</th>
              {days.map((date) => (
                <th key={date} className="pb-2">
                  <div>{t(weekdayKeyOf(date))}</div>
                  <div className="font-bold text-[var(--muted-strong)]">{date.slice(5)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOT_RANGES.map((range) => (
              <tr key={range} className="border-t border-[var(--line)]">
                <td className="py-2.5 text-left font-black">{range}</td>
                {days.map((date) => {
                  const key = `${date}|${range}`;
                  return (
                    <td key={key} className="px-1 py-2.5">
                      <input
                        inputMode="numeric"
                        className="h-10 w-16 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] text-center text-sm font-black outline-none focus:border-[var(--accent)]"
                        value={grid[key] ?? ""}
                        onChange={(e) => setGrid({ ...grid, [key]: e.target.value.replace(/\D/g, "") })}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          const entries = Object.entries(grid)
            .filter(([, value]) => value !== "")
            .map(([key, value]) => {
              const [date, timeRange] = key.split("|");
              return { date, timeRange, plannedCount: Number(value) };
            });
          if (entries.length === 0) {
            setMessage({ tone: "warn", text: t("dpSetupWarn") });
            setBusy(false);
            return;
          }
          const result = await onSave({ action: "setWeek", hotzone: hotzone.trim() || "Santo Amaro", entries });
          setBusy(false);
          if (result) setMessage({ tone: "ok", text: t("dpSetupOk", { created: String(result.created), updated: String(result.updated) }) });
        }}
        className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-6 text-sm font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
      >
        {busy ? t("dpSaving") : t("dpSaveWeek")}
      </button>
    </div>
  );
}

function ImportForm({ onImport, setMessage }: { onImport: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; setMessage: (m: { tone: "ok" | "warn" | "err"; text: string } | null) => void }) {
  const t = useT();
  const [planId, setPlanId] = useState("");
  const [planName, setPlanName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const input = "h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";

  return (
    <div className="space-y-5">
      <div className="text-sm font-bold leading-6 text-[var(--muted-strong)]">
        {t("dpImpDesc")}
      </div>
      <input className={input} placeholder={t("dpImpPlanId")} value={planId} onChange={(e) => setPlanId(e.target.value)} />
      <input className={input} placeholder={t("dpImpPlanName")} value={planName} onChange={(e) => setPlanName(e.target.value)} />
      <textarea
        className="min-h-64 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-4 font-mono text-xs leading-5 outline-none focus:border-[var(--accent)]"
        placeholder={t("dpImpPlaceholder")}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        type="button"
        disabled={busy || !text.trim()}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          const result = await onImport({ action: "import", planId: planId.trim(), planName: planName.trim(), text });
          setBusy(false);
          if (result) {
            setMessage({ tone: "ok", text: t("dpImpOk", { created: String(result.created), updated: String(result.updated) }) });
            setText("");
          }
        }}
        className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-6 text-sm font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
      >
        <Upload size={16} /> {busy ? t("pfImpImporting") : t("pfImpParseImport")}
      </button>
    </div>
  );
}

function ShiftSelect({ shifts, value, onChange }: { shifts: DispatchShift[]; value: string; onChange: (id: string) => void }) {
  const t = useT();
  // Newest first; stale shifts (older than 7 days) are hidden so the list stays
  // short and current. If nothing is recent, fall back to the latest 15 so the
  // picker is never empty. The currently selected shift always stays visible.
  const byNewest = (a: DispatchShift, b: DispatchShift) =>
    b.date.localeCompare(a.date) || a.timeRange.localeCompare(b.timeRange);
  const cutoffDate = new Date(Date.now() - 7 * 86400000);
  const cutoff = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, "0")}-${String(cutoffDate.getDate()).padStart(2, "0")}`;
  let visible = shifts.filter((shift) => shift.date >= cutoff).sort(byNewest);
  if (visible.length === 0) visible = [...shifts].sort(byNewest).slice(0, 15);
  const selected = shifts.find((shift) => shift.id === value);
  if (selected && !visible.some((shift) => shift.id === selected.id)) visible = [selected, ...visible];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]">
      <option value="">{t("dpSelectShift")}</option>
      {visible.map((shift) => (
        <option key={shift.id} value={shift.id}>
          {shift.date} {shift.timeRange} · {shift.hotzone} · {t("dpQuotaLabel")}{shift.plannedCount}{shift.isCritical ? " ★" : ""}
        </option>
      ))}
    </select>
  );
}

function QuotaTab({ board, byShift, onSave, setMessage, network }: { board: Board; byShift: { quotaMap: Map<string, ShiftQuota[]> }; onSave: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; setMessage: (m: { tone: "ok" | "warn" | "err"; text: string } | null) => void; network: { franchises: Franchise[]; stations: Ponto[] } }) {
  const t = useT();
  // Week-grid shift picker (replaces the 21-option dropdown) + per-franchise
  // batch matrix (replaces the one-row-at-a-time form).
  const [weekStart, setWeekStart] = useState(() => mondayOf(0));
  const [shiftId, setShiftId] = useState("");
  const [matrix, setMatrix] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [stationSplitOpen, setStationSplitOpen] = useState(false);
  const [franchise, setFranchise] = useState("");
  const [station, setStation] = useState("");
  const [quota, setQuota] = useState("");

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const shift = board.shifts.find((item) => item.id === shiftId);
  const quotas = (shiftId ? byShift.quotaMap.get(shiftId) ?? [] : []).sort((a, b) => a.level.localeCompare(b.level));
  const franchiseQuotaOf = (id: string, name: string) => (byShift.quotaMap.get(id) ?? []).find((q) => q.level === "franchise" && q.franchise === name)?.quota ?? 0;
  const allocatedOf = (id: string) => (byShift.quotaMap.get(id) ?? []).filter((q) => q.level === "franchise").reduce((sum, q) => sum + q.quota, 0);

  // Prefill the matrix from existing quotas whenever the selected shift changes.
  useEffect(() => {
    if (!shiftId) return;
    const next: Record<string, string> = {};
    for (const item of network.franchises) {
      const existing = franchiseQuotaOf(shiftId, item.name);
      if (existing > 0) next[item.name] = String(existing);
    }
    setMatrix(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftId, board.quotas]);

  const matrixTotal = network.franchises.reduce((sum, item) => sum + (Number(matrix[item.name]) || 0), 0);
  const dirtyRows = network.franchises.filter((item) => {
    const val = Number(matrix[item.name]) || 0;
    return shiftId !== "" && val !== franchiseQuotaOf(shiftId, item.name);
  });

  async function saveMatrix() {
    if (!shiftId || dirtyRows.length === 0) return;
    setBusy(true);
    setMessage(null);
    let ok = 0;
    for (const item of dirtyRows) {
      const result = await onSave({ action: "quota", shiftId, level: "franchise", franchise: item.name, quota: Number(matrix[item.name]) || 0 });
      if (result) ok += 1;
    }
    setBusy(false);
    setMessage({ tone: "ok", text: `${t("dpQuotaOk")} ×${ok}` });
  }

  const cellTone = (s: DispatchShift) => {
    const allocated = allocatedOf(s.id);
    if (allocated === 0) return "border-[var(--line)] text-[var(--muted)]";
    if (allocated < s.plannedCount) return "border-[var(--warn)] text-[var(--warn-ink,var(--warning-ink))]";
    if (allocated === s.plannedCount) return "border-[var(--success)] text-[var(--success-ink)]";
    return "border-[var(--danger)] text-[var(--danger-ink)]";
  };

  const input = "h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";

  const quotaColumns: Array<DataColumn<ShiftQuota>> = [
    { key: "level", label: t("dpLevel"), render: (item) => <span className="font-black">{item.level === "franchise" ? t("pfFranchise") : t("pfStation")}</span> },
    { key: "franchise", label: t("pfFranchise"), render: (item) => item.franchise },
    { key: "station", label: t("pfStation"), render: (item) => item.station ?? "--" },
    { key: "quota", label: t("dpQuotaLabel"), align: "right", render: (item) => <span className="font-black">{item.quota}</span> },
    { key: "updatedAt", label: t("dpUpdatedAt"), align: "right", render: (item) => <span className="text-xs text-[var(--muted)]">{item.updatedAt}</span> },
  ];

  return (
    <div className="space-y-4">
      {/* ---- Week grid: click a slot to select it ---- */}
      <SectionCard
        title={t("dpAssignQuota")}
        right={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="tag" onClick={() => setWeekStart(addDays(weekStart, -7))}>{t("dpPrevWeek")}</button>
            <span className="self-center text-xs font-black" translate="no">{weekStart} ~ {addDays(weekStart, 6)}</span>
            <button type="button" className="tag" onClick={() => setWeekStart(addDays(weekStart, 7))}>{t("dpNextWeek")}</button>
            <button type="button" className="tag" onClick={() => setWeekStart(mondayOf(0))}>{t("dpThisWeek")}</button>
            <button type="button" className="tag" onClick={() => setWeekStart(mondayOf(1))}>{t("dpNextWk")}</button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-center text-xs">
            <thead>
              <tr className="text-[10px] font-black uppercase text-[var(--muted)]">
                <th className="pb-1.5 text-left">{t("dpSlot")}</th>
                {weekDates.map((date) => (
                  <th key={date} className="pb-1.5" translate="no">
                    <div>{t(weekdayKeyOf(date))}</div>
                    <div className="font-bold text-[var(--muted-strong)]">{date.slice(5)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SLOT_RANGES.map((range) => (
                <tr key={range} className="border-t border-[var(--line)]">
                  <td className="py-1.5 text-left font-black" translate="no">{range}</td>
                  {weekDates.map((date) => {
                    const cellShifts = board.shifts.filter((s) => s.date === date && s.timeRange === range && s.status !== "finished");
                    return (
                      <td key={`${date}|${range}`} className="px-1 py-1.5">
                        {cellShifts.length === 0 ? (
                          <span className="text-[var(--muted)]">—</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {cellShifts.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => setShiftId(s.id === shiftId ? "" : s.id)}
                                translate="no"
                                className={`rounded-[8px] border px-1.5 py-1 font-black transition-colors ${s.id === shiftId ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]" : `bg-[var(--surface-raised)] hover:border-[var(--accent)] ${cellTone(s)}`}`}
                                title={`${s.hotzone}${s.isCritical ? " ★" : ""}`}
                              >
                                {allocatedOf(s.id)}/{s.plannedCount}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[11px] font-bold text-[var(--muted)]">{t("dpSelectShift")} · {t("dpAllocated")}/{t("dpQuota99")}</div>
      </SectionCard>

      {shift && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* ---- Batch matrix: HQ → all franchises in one save ---- */}
          <SectionCard
            title={<span translate="no">{shift.date} {shift.timeRange} · {shift.hotzone}</span>}
            desc={t("dpQuotaSummary", { planned: shift.plannedCount, allocated: matrixTotal })}
            right={
              <button
                type="button"
                disabled={busy || dirtyRows.length === 0}
                onClick={() => void saveMatrix()}
                className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
              >
                {t("dpSaveQuota")}{dirtyRows.length > 0 ? ` ×${dirtyRows.length}` : ""}
              </button>
            }
          >
            <div className="space-y-1.5">
              {network.franchises.map((item) => {
                const val = matrix[item.name] ?? "";
                const changed = (Number(val) || 0) !== franchiseQuotaOf(shift.id, item.name);
                return (
                  <label key={item.id} className={`flex items-center gap-3 rounded-[8px] border px-3 py-1.5 ${changed ? "border-[var(--accent)]" : "border-[var(--line)]"}`}>
                    <span className="flex-1 truncate text-sm font-black">{item.name}</span>
                    <input
                      inputMode="numeric"
                      className="h-9 w-20 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] text-center text-sm font-black outline-none focus:border-[var(--accent)]"
                      value={val}
                      onChange={(e) => setMatrix({ ...matrix, [item.name]: e.target.value.replace(/\D/g, "") })}
                    />
                  </label>
                );
              })}
            </div>
            {matrixTotal > shift.plannedCount && (
              <div className="mt-2 text-xs font-black text-[var(--danger-ink)]">{t("dpOverQuota")}</div>
            )}
          </SectionCard>

          {/* ---- Current quota records + optional station-level split ---- */}
          <SectionCard
            title={t("dpCurrentQuota")}
            right={
              <button type="button" className="tag" onClick={() => setStationSplitOpen((v) => !v)}>
                {t("dpFranchiseToStation")}
              </button>
            }
          >
            {stationSplitOpen && (
              <div className="mb-3 grid gap-2 rounded-[10px] border border-dashed border-[var(--line)] p-3 sm:grid-cols-[1fr_1fr_96px_auto]">
                <select className={input} value={franchise} onChange={(e) => { setFranchise(e.target.value); setStation(""); }}>
                  <option value="">{t("dpSelectFranchise")}</option>
                  {network.franchises.map((item) => (
                    <option key={item.id} value={item.name}>{item.name}</option>
                  ))}
                </select>
                <select className={input} value={station} onChange={(e) => setStation(e.target.value)}>
                  <option value="">{t("dpSelectStation")}</option>
                  {network.stations.filter((item) => !franchise || item.franchise === franchise).map((item) => (
                    <option key={item.id} value={item.name}>{item.name}</option>
                  ))}
                </select>
                <input className={input} placeholder={t("dpQuotaCount")} inputMode="numeric" value={quota} onChange={(e) => setQuota(e.target.value.replace(/\D/g, ""))} />
                <button
                  type="button"
                  disabled={!franchise.trim() || !station.trim() || quota === ""}
                  onClick={async () => {
                    setMessage(null);
                    const result = await onSave({ action: "quota", shiftId, level: "station", franchise: franchise.trim(), station: station.trim(), quota: Number(quota) });
                    if (result) setMessage({ tone: "ok", text: t("dpQuotaOk") });
                  }}
                  className="tag h-11 disabled:opacity-50"
                >
                  {t("dpSaveQuota")}
                </button>
              </div>
            )}
            <DataTable<ShiftQuota> columns={quotaColumns} rows={quotas} rowKey={(item) => item.id} minWidth={480} empty={t("dpNoQuota")} />
          </SectionCard>
        </div>
      )}
    </div>
  );
}

function ReviewTab({ board, onAction, setMessage, network }: { board: Board; onAction: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; setMessage: (m: { tone: "ok" | "warn" | "err"; text: string } | null) => void; network: { franchises: Franchise[]; stations: Ponto[] } }) {
  const t = useT();
  const [shiftId, setShiftId] = useState("");
  const [franchise, setFranchise] = useState("");
  const [station, setStation] = useState("");
  const [ridersText, setRidersText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const pending = board.signups.filter((signup) => signup.status === "submitted");
  const input = "h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function review(status: "approved" | "rejected") {
    if (selected.size === 0) return;
    setMessage(null);
    const result = await onAction({ action: "review", signupIds: [...selected], status });
    if (result) {
      setMessage({ tone: "ok", text: t("dpReviewOk", { verb: status === "approved" ? t("dpStApproved") : t("dpStRejected"), n: String(result.changed) }) });
      setSelected(new Set());
    }
  }

  // Review progress grouped by franchise (HQ view follows the franchise list).
  const franchiseNames = new Set(network.franchises.map((f) => f.name));
  const progress = network.franchises.map((item) => {
    const mine = board.signups.filter((signup) => signup.franchise === item.name);
    return { name: item.name, pending: mine.filter((x) => x.status === "submitted").length, approved: mine.filter((x) => x.status === "approved").length, total: mine.length, unbound: false };
  });
  // Signups whose franchise isn't in the network → one "unbound" bucket.
  const orphan = board.signups.filter((s) => !s.franchise || !franchiseNames.has(s.franchise));
  if (orphan.length > 0) {
    progress.push({ name: t("dpUnbound"), pending: orphan.filter((x) => x.status === "submitted").length, approved: orphan.filter((x) => x.status === "approved").length, total: orphan.length, unbound: true });
  }
  const allPendingSelected = pending.length > 0 && pending.every((s) => selected.has(s.id));

  const pendingColumns: Array<DataColumn<ShiftSignup>> = [
    {
      key: "sel",
      label: "",
      className: "w-8",
      render: (signup) => <input type="checkbox" readOnly checked={selected.has(signup.id)} className="pointer-events-none h-4 w-4 accent-[var(--accent)]" />,
    },
    {
      key: "rider",
      label: t("pfRider"),
      render: (signup) => (
        <div>
          <div className="font-black">{signup.riderName || signup.rider99Id}</div>
          <div className="font-mono text-[10px] font-bold text-[var(--muted)]">{signup.rider99Id}</div>
        </div>
      ),
    },
    {
      key: "shift",
      label: t("dpShift"),
      render: (signup) => {
        const shift = board.shifts.find((item) => item.id === signup.shiftId);
        return <span className="text-xs">{shift ? `${shift.date} ${shift.timeRange} · ${shift.hotzone}` : signup.shiftId}</span>;
      },
    },
    { key: "org", label: `${t("pfFranchise")} / ${t("pfStation")}`, render: (signup) => <span className="text-xs">{signup.franchise} / {signup.station}</span> },
    {
      key: "status",
      label: t("dpStatus"),
      align: "right",
      render: (signup) => <StatusBadge tone={SIGNUP_TONE[signup.status] ?? "neutral"} label={statusKey[signup.status] ? t(statusKey[signup.status]) : signup.status} />,
    },
  ];

  return (
    <div className="space-y-4">
      <SectionCard
        title={t("dpReviewProgress")}
        right={
          <button
            type="button"
            className="tag inline-flex items-center gap-1"
            onClick={() => {
              downloadCsv(
                `signups-${new Date().toISOString().slice(0, 10)}`,
                [t("pfRider"), "99ID", t("pfFranchise"), t("pfStation"), t("dpShift"), t("dpStatus"), t("dpSubmittedAt")],
                board.signups.map((x) => [x.riderName, x.rider99Id, x.franchise, x.station, x.shiftId, x.status, x.createdAt]),
              );
            }}
          >
            <Download size={13} /> {t("dpExportSignups")}
          </button>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {progress.map((row) => (
            <div key={row.name} className={`rounded-[8px] border p-3 ${row.unbound ? "border-[var(--danger)] bg-[var(--danger-bg)]" : row.pending > 0 ? "border-[var(--warning)] bg-[var(--warning-bg)]" : "border-[var(--line)] bg-[var(--surface-raised)]"}`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-black ${row.unbound ? "text-[var(--danger-ink)]" : ""}`}>{row.name}</span>
                {row.pending > 0 && !row.unbound && (
                  <button
                    type="button"
                    className="tag border-[var(--accent)] text-[var(--accent)]"
                    onClick={async () => {
                      const result = await onAction({ action: "nudge", scope: "franchise", name: row.name });
                      if (result) setMessage({ tone: "ok", text: t("dpNudgeOk", { name: row.name, n: row.pending }) });
                    }}
                  >
                    {t("dpNudge")}
                  </button>
                )}
              </div>
              <div className="mt-1 text-[11px] font-bold text-[var(--muted-strong)]">
                {t("dpProgressLine", { pending: row.pending, approved: row.approved, total: row.total })}
              </div>
            </div>
          ))}
          {progress.length === 0 && <div className="text-sm font-bold text-[var(--muted)]">{t("dpNoFranchise")}</div>}
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <SectionCard title={t("dpProxySignup")}>
          <div className="space-y-4">
            <ShiftSelect shifts={board.shifts.filter((item) => item.status === "scheduling")} value={shiftId} onChange={setShiftId} />
            <select className={input} value={franchise} onChange={(e) => { setFranchise(e.target.value); setStation(""); }}>
              <option value="">{t("dpSelectFranchise")}</option>
              {network.franchises.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
            </select>
            <select className={input} value={station} onChange={(e) => setStation(e.target.value)}>
              <option value="">{t("dpSelectStation")}</option>
              {network.stations.filter((st) => !franchise || st.franchise === franchise).map((st) => <option key={st.id} value={st.name}>{st.name}</option>)}
            </select>
            <textarea
              className="min-h-40 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-xs leading-5 outline-none focus:border-[var(--accent)]"
              placeholder={t("dpRidersPlaceholder")}
              value={ridersText}
              onChange={(e) => setRidersText(e.target.value)}
            />
            <button
              type="button"
              disabled={!shiftId || !franchise.trim() || !station.trim() || !ridersText.trim()}
              onClick={async () => {
                setMessage(null);
                const riders = ridersText
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line) => {
                    const [riderName = "", rider99Id = "", riderCpf = ""] = line.split(/[,，;\t]/).map((part) => part.trim());
                    return { riderName, rider99Id, riderCpf };
                  });
                const result = await onAction({ action: "signup", shiftId, franchise: franchise.trim(), station: station.trim(), riders });
                if (result) {
                  const skipped = (result.skipped as string[]) ?? [];
                  setMessage({
                    tone: skipped.length > 0 ? "warn" : "ok",
                    text: skipped.length > 0 ? t("dpSignupOkSkip", { created: String(result.created), n: skipped.length, list: skipped.slice(0, 5).join("、") }) : t("dpSignupOk", { created: String(result.created) }),
                  });
                  setRidersText("");
                }
              }}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] border border-[var(--accent)] text-sm font-black uppercase text-[var(--accent)] hover:bg-[var(--accent-glow)] disabled:opacity-50"
            >
              <Users size={16} /> {t("dpSubmitSignup")}
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title={
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--accent)]"
                checked={allPendingSelected}
                onChange={(e) => setSelected(e.target.checked ? new Set(pending.map((s) => s.id)) : new Set())}
              />
              {t("dpPendingQueue", { n: pending.length })}
            </label>
          }
          right={
            <div className="flex gap-2">
              <button type="button" onClick={() => void review("approved")} disabled={selected.size === 0} className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-40">
                <CheckCircle2 size={14} /> {t("dpApproveN", { n: selected.size })}
              </button>
              <button type="button" onClick={() => void review("rejected")} disabled={selected.size === 0} className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-[var(--danger)] px-4 text-xs font-black uppercase text-[var(--danger-ink)] disabled:opacity-40">
                {t("dpReject")}
              </button>
            </div>
          }
        >
          <DataTable<ShiftSignup>
            columns={pendingColumns}
            rows={pending}
            rowKey={(signup) => signup.id}
            onRowClick={(signup) => toggle(signup.id)}
            minWidth={640}
            empty={t("dpNoPending")}
          />
        </SectionCard>
      </div>
    </div>
  );
}

function ReportTab({ board, byShift, onAction, setMessage }: { board: Board; byShift: { signupMap: Map<string, ShiftSignup[]> }; onAction: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; setMessage: (m: { tone: "ok" | "warn" | "err"; text: string } | null) => void }) {
  const t = useT();
  // Week-scoped + day-grouped + whole-day batch actions. The old flat list
  // mixed every week since June into one strip with per-row buttons only.
  const [weekStart, setWeekStart] = useState(() => mondayOf(0));
  const [filter, setFilter] = useState<"pending" | "reported" | "all">("pending");
  const [busyDay, setBusyDay] = useState("");
  const weekEnd = addDays(weekStart, 6);
  const approvedOf = (shift: DispatchShift) => (byShift.signupMap.get(shift.id) ?? []).filter((signup) => signup.status === "approved" || signup.status === "reported").length;
  const candidates = board.shifts
    .filter((shift) => shift.status !== "finished" && shift.date >= weekStart && shift.date <= weekEnd)
    .filter((shift) => (filter === "all" ? true : filter === "pending" ? !shift.reportedAt : Boolean(shift.reportedAt)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.timeRange.localeCompare(b.timeRange));
  const dayGroups = new Map<string, DispatchShift[]>();
  for (const shift of candidates) {
    const list = dayGroups.get(shift.date) ?? [];
    list.push(shift);
    dayGroups.set(shift.date, list);
  }
  const pendingInWeek = board.shifts.filter((shift) => shift.status !== "finished" && shift.date >= weekStart && shift.date <= weekEnd && !shift.reportedAt).length;

  async function copyRoster(shiftId: string) {
    setMessage(null);
    const result = await onAction({ action: "report", shiftId, confirm: false });
    if (!result) return;
    const text = String(result.rosterText ?? "");
    if (!text) {
      setMessage({ tone: "warn", text: t("dpNoApproved") });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ tone: "ok", text: t("dpCopyOk", { n: String(result.count) }) });
    } catch {
      setMessage({ tone: "warn", text: t("dpCopyFail", { text: text.slice(0, 200) }) });
    }
  }

  async function markReported(shiftId: string) {
    const result = await onAction({ action: "report", shiftId, confirm: true });
    if (result) setMessage({ tone: "ok", text: t("dpMarkReportedOk", { n: String(result.count) }) });
  }

  /** Copy the WHOLE day's rosters in one clipboard write. */
  async function copyDay(date: string, shifts: DispatchShift[]) {
    setBusyDay(date);
    setMessage(null);
    const parts: string[] = [];
    let total = 0;
    for (const shift of shifts) {
      const result = await onAction({ action: "report", shiftId: shift.id, confirm: false });
      const text = String(result?.rosterText ?? "");
      if (text) {
        parts.push(`【${shift.date} ${shift.timeRange} · ${shift.hotzone}】\n${text}`);
        total += Number(result?.count ?? 0);
      }
    }
    setBusyDay("");
    if (parts.length === 0) {
      setMessage({ tone: "warn", text: t("dpNoApproved") });
      return;
    }
    try {
      await navigator.clipboard.writeText(parts.join("\n\n"));
      setMessage({ tone: "ok", text: t("dpCopyOk", { n: String(total) }) });
    } catch {
      setMessage({ tone: "warn", text: t("dpCopyFail", { text: parts.join("\n\n").slice(0, 200) }) });
    }
  }

  /** Mark every unreported shift of the day as reported. */
  async function markDay(date: string, shifts: DispatchShift[]) {
    const targets = shifts.filter((shift) => !shift.reportedAt);
    if (targets.length === 0) return;
    setBusyDay(date);
    setMessage(null);
    let n = 0;
    for (const shift of targets) {
      const result = await onAction({ action: "report", shiftId: shift.id, confirm: true });
      if (result) n += Number(result.count ?? 0);
    }
    setBusyDay("");
    setMessage({ tone: "ok", text: t("dpMarkReportedOk", { n: String(n) }) });
  }

  const columns: Array<DataColumn<DispatchShift>> = [
    {
      key: "shift",
      label: t("dpShift"),
      render: (shift) => (
        <div>
          <div className="flex items-center gap-1 font-black">
            {shift.isCritical && <Star size={13} className="text-[var(--accent)]" />}
            {shift.date} {shift.timeRange}
          </div>
          <div className="text-[11px] font-bold text-[var(--muted)]">{shift.hotzone} · {shift.id}</div>
        </div>
      ),
    },
    { key: "planned", label: t("dpQuota99"), align: "right", render: (shift) => <span className="font-black">{shift.plannedCount}</span> },
    {
      key: "approved",
      label: t("dpStApproved"),
      align: "right",
      render: (shift) => {
        const approved = (byShift.signupMap.get(shift.id) ?? []).filter((signup) => signup.status === "approved" || signup.status === "reported").length;
        return <span className={`font-black ${statBadge(approved, shift.plannedCount)}`}>{approved}</span>;
      },
    },
    {
      key: "gap",
      label: t("dpGap"),
      align: "right",
      render: (shift) => {
        const approved = (byShift.signupMap.get(shift.id) ?? []).filter((signup) => signup.status === "approved" || signup.status === "reported").length;
        const gap = shift.plannedCount - approved;
        return <span className={`font-black ${gap > 0 ? "text-[var(--danger-ink)]" : "text-[var(--ok-ink)]"}`}>{gap > 0 ? gap : 0}</span>;
      },
    },
    {
      key: "status",
      label: t("dpStatus"),
      render: (shift) => (shift.reportedAt ? <StatusBadge tone="success" label={t("dpReportedAt", { x: shift.reportedAt })} /> : <StatusBadge tone="warn" label={t("dpNotReported")} />),
    },
    {
      key: "action",
      label: t("dpAction"),
      align: "right",
      render: (shift) => (
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => void copyRoster(shift.id)} className="tag inline-flex items-center gap-1">
            <ClipboardCopy size={13} /> {t("dpCopyRoster")}
          </button>
          <button type="button" onClick={() => void markReported(shift.id)} className="tag inline-flex items-center gap-1">
            <Download size={13} /> {t("dpMarkReported")}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Toolbar
        right={
          <div className="flex flex-wrap gap-2">
            {([["pending", t("dpNotReported")], ["reported", t("dpStReported")], ["all", t("fmChipAll")]] as const).map(([key, label]) => (
              <Chip key={key} active={filter === key} onClick={() => setFilter(key)}>{label}</Chip>
            ))}
          </div>
        }
      >
        <button type="button" className="tag" onClick={() => setWeekStart(addDays(weekStart, -7))}>{t("dpPrevWeek")}</button>
        <span className="self-center text-sm font-black" translate="no">
          {weekStart} ~ {weekEnd}
          {pendingInWeek > 0 && <span className="ml-2 text-[10px] font-black uppercase text-[var(--warning-ink)]">{t("dpNotReported")} {pendingInWeek}</span>}
        </span>
        <button type="button" className="tag" onClick={() => setWeekStart(addDays(weekStart, 7))}>{t("dpNextWeek")}</button>
        <button type="button" className="tag" onClick={() => setWeekStart(mondayOf(0))}>{t("dpThisWeek")}</button>
        <button type="button" className="tag" onClick={() => setWeekStart(mondayOf(1))}>{t("dpNextWk")}</button>
      </Toolbar>

      {[...dayGroups.entries()].map(([date, shifts]) => {
        const dayPlanned = shifts.reduce((sum, shift) => sum + shift.plannedCount, 0);
        const dayApproved = shifts.reduce((sum, shift) => sum + approvedOf(shift), 0);
        const dayGap = Math.max(0, dayPlanned - dayApproved);
        const dayPending = shifts.filter((shift) => !shift.reportedAt).length;
        return (
          <SectionCard
            key={date}
            title={<span translate="no">{date.slice(5)} {t(weekdayKeyOf(date))}</span>}
            desc={`${t("dpQuota99")} ${dayPlanned} · ${t("dpStApproved")} ${dayApproved} · ${t("dpGap")} ${dayGap}`}
            right={
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busyDay === date} onClick={() => void copyDay(date, shifts)} className="tag inline-flex items-center gap-1 disabled:opacity-50">
                  <ClipboardCopy size={13} /> {t("dpCopyRoster")}
                </button>
                {dayPending > 0 && (
                  <button type="button" disabled={busyDay === date} onClick={() => void markDay(date, shifts)} className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-3.5 text-xs font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50">
                    <Download size={13} /> {t("dpMarkReported")} ×{dayPending}
                  </button>
                )}
              </div>
            }
          >
            <DataTable<DispatchShift> columns={columns} rows={shifts} rowKey={(shift) => shift.id} minWidth={720} />
          </SectionCard>
        );
      })}
      {dayGroups.size === 0 && <div className="panel p-8 text-center text-sm font-bold text-[var(--muted)]">{t("dpNoReportable")}</div>}
    </div>
  );
}
