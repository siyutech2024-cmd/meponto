"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ClipboardCopy, ClipboardList, Download, RefreshCcw, Send, Star, Upload, Users, X } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
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

const WEEKDAY_KEYS: TranslationKey[] = ["pfWdMon", "pfWdTue", "pfWdWed", "pfWdThu", "pfWdFri", "pfWdSat", "pfWdSun"];

const tabs = [
  { id: "board", labelKey: "dpTabBoard", icon: CalendarDays },
  { id: "setup", labelKey: "dpTabSetup", icon: ClipboardList },
  { id: "import", labelKey: "dpTabImport", icon: Upload },
  { id: "quota", labelKey: "dpTabQuota", icon: Users },
  { id: "review", labelKey: "dpTabReview", icon: ClipboardList },
  { id: "report", labelKey: "dpTabReport", icon: Send },
] as const;

const SLOT_RANGES = ["11:00~14:00", "14:00~18:00", "18:00~22:00"] as const;

function mondayOf(offsetWeeks: number): string {
  const now = new Date();
  const day = now.getDay() === 0 ? 7 : now.getDay();
  now.setDate(now.getDate() - day + 1 + offsetWeeks * 7);
  return now.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
      {tab === "setup" && <WeekSetupTab board={board} onSave={post} setMessage={setMessage} />}
      {tab === "import" && <ImportTab onImport={post} setMessage={setMessage} />}
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

function BoardTab({ board, byShift, loading, onAction, setMessage }: { board: Board; byShift: { quotaMap: Map<string, ShiftQuota[]>; signupMap: Map<string, ShiftSignup[]> }; loading: boolean; onAction: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; setMessage: (m: { tone: "ok" | "warn" | "err"; text: string } | null) => void }) {
  const t = useT();
  const dialog = useDialog();
  const [weekStart, setWeekStart] = useState(() => mondayOf(0));
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const weekShiftCount = board.shifts.filter((shift) => days.includes(shift.date)).length;

  if (loading && board.shifts.length === 0) {
    return <div className="panel p-6 text-sm font-bold text-[var(--muted)]">{t("dpLoading")}</div>;
  }

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

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center gap-3 p-3">
        <button type="button" className="tag" onClick={() => setWeekStart(addDays(weekStart, -7))}>{t("dpPrevWeek")}</button>
        <div key={weekStart} translate="no" className="text-sm font-black">
          {weekStart} ~ {addDays(weekStart, 6)}
          <span className="ml-2 text-[10px] font-black uppercase text-[var(--muted)]">{t("dpWeekShifts", { n: weekShiftCount })}</span>
        </div>
        <button type="button" className="tag" onClick={() => setWeekStart(addDays(weekStart, 7))}>{t("dpNextWeek")}</button>
        <button type="button" className="tag" onClick={() => setWeekStart(mondayOf(0))}>{t("dpThisWeek")}</button>
        <button type="button" className="tag" onClick={() => setWeekStart(mondayOf(1))}>{t("dpNextWk")}</button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        {days.map((date, dayIndex) => {
          const dayShifts = board.shifts
            .filter((shift) => shift.date === date)
            .sort((a, b) => a.timeRange.localeCompare(b.timeRange));
          return (
            <div key={date} className="panel p-3">
              <div className="mb-2 text-center">
                <div className="text-[10px] font-black uppercase text-[var(--muted)]">{t(WEEKDAY_KEYS[dayIndex])}</div>
                <div className="text-sm font-black">{date.slice(5)}</div>
              </div>
              <div className="space-y-2">
                {SLOT_RANGES.map((range) => {
                  const slotShifts = dayShifts.filter((shift) => shift.timeRange === range);
                  if (slotShifts.length === 0) {
                    return (
                      <button
                        key={range}
                        type="button"
                        onClick={() => void quickAdd(date, range)}
                        className="block w-full rounded-[8px] border border-dashed border-[var(--line)] px-2 py-3 text-center text-[11px] font-black text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        {range}
                        <span className="block">{t("dpAddShift")}</span>
                      </button>
                    );
                  }
                  return slotShifts.map((shift) => {
                    const quotas = byShift.quotaMap.get(shift.id) ?? [];
                    const signups = byShift.signupMap.get(shift.id) ?? [];
                    const franchiseQuota = quotas.filter((quota) => quota.level === "franchise").reduce((sum, quota) => sum + quota.quota, 0);
                    const approved = signups.filter((signup) => signup.status === "approved" || signup.status === "reported").length;
                    const pending = signups.filter((signup) => signup.status === "submitted").length;
                    return (
                      <div key={shift.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-2">
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1 text-[12px] font-black">
                            {shift.isCritical && <Star size={12} className="text-[var(--accent)]" />}
                            {shift.timeRange}
                          </div>
                          <button
                            type="button"
                            onClick={() => void removeShift(shift)}
                            className="text-[var(--muted)] hover:text-[var(--danger-ink)]"
                            aria-label={t("dpDelTitle")}
                          >
                            <X size={13} />
                          </button>
                        </div>
                        <div className="text-[10px] font-bold text-[var(--muted)]">{shift.hotzone}</div>
                        <div className="mt-1 flex items-center gap-1">
                          {shift.reportedAt && <Badge value={t("dpStReported")} />}
                          <Badge value={statusKey[shift.status] ? t(statusKey[shift.status]) : shift.status} />
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-1 text-center text-[10px] font-black">
                          <div>
                            <div className="text-[var(--muted)]">{t("dpQuota99")}</div>
                            <div>{shift.plannedCount}</div>
                          </div>
                          <div>
                            <div className="text-[var(--muted)]">{t("dpAllocated")}</div>
                            <div className={statBadge(franchiseQuota, shift.plannedCount)}>{franchiseQuota}</div>
                          </div>
                          <div>
                            <div className="text-[var(--muted)]">{t("dpApprovedCnt")}</div>
                            <div className={statBadge(approved, shift.plannedCount)}>{approved}</div>
                          </div>
                          <div>
                            <div className="text-[var(--muted)]">{t("dpPendingCnt")}</div>
                            <div>{pending}</div>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekSetupTab({ board, onSave, setMessage }: { board: Board; onSave: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; setMessage: (m: { tone: "ok" | "warn" | "err"; text: string } | null) => void }) {
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
    <div className="panel space-y-4 p-5">
      <div className="text-sm font-bold leading-6 text-[var(--muted-strong)]">
        {t("dpSetupDesc")}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-xs font-black uppercase text-[var(--muted)]">
          {t("dpMondayDate")}
          <input type="date" className={`${input} mt-1 w-full`} value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
        </label>
        <label className="text-xs font-black uppercase text-[var(--muted)]">
          {t("dpHotzone")}
          <input className={`${input} mt-1 w-full`} value={hotzone} onChange={(e) => setHotzone(e.target.value)} />
        </label>
        <div className="flex items-end gap-2">
          <button type="button" onClick={() => setWeekStart(mondayOf(0))} className="tag">{t("dpThisWeek")}</button>
          <button type="button" onClick={() => setWeekStart(mondayOf(1))} className="tag">{t("dpNextWk")}</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-center text-sm">
          <thead>
            <tr className="text-[10px] font-black uppercase text-[var(--muted)]">
              <th className="pb-2 text-left">{t("dpSlot")}</th>
              {days.map((date, index) => (
                <th key={date} className="pb-2">
                  <div>{t(WEEKDAY_KEYS[index])}</div>
                  <div className="font-bold text-[var(--muted-strong)]">{date.slice(5)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOT_RANGES.map((range) => (
              <tr key={range} className="border-t border-[var(--line)]">
                <td className="py-2 text-left font-black">{range}</td>
                {days.map((date) => {
                  const key = `${date}|${range}`;
                  return (
                    <td key={key} className="px-1 py-2">
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

function ImportTab({ onImport, setMessage }: { onImport: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; setMessage: (m: { tone: "ok" | "warn" | "err"; text: string } | null) => void }) {
  const t = useT();
  const [planId, setPlanId] = useState("");
  const [planName, setPlanName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const input = "h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";

  return (
    <div className="panel space-y-4 p-5">
      <div className="text-sm font-bold leading-6 text-[var(--muted-strong)]">
        {t("dpImpDesc")}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <input className={input} placeholder={t("dpImpPlanId")} value={planId} onChange={(e) => setPlanId(e.target.value)} />
        <input className={input} placeholder={t("dpImpPlanName")} value={planName} onChange={(e) => setPlanName(e.target.value)} />
      </div>
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
  const [shiftId, setShiftId] = useState("");
  const [level, setLevel] = useState<"franchise" | "station">("franchise");
  const [franchise, setFranchise] = useState("");
  const [station, setStation] = useState("");
  const [quota, setQuota] = useState("");

  const shift = board.shifts.find((item) => item.id === shiftId);
  const quotas = (shiftId ? byShift.quotaMap.get(shiftId) ?? [] : []).sort((a, b) => a.level.localeCompare(b.level));
  const franchiseTotal = quotas.filter((item) => item.level === "franchise").reduce((sum, item) => sum + item.quota, 0);

  const input = "h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";

  return (
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <div className="panel space-y-3 p-5">
        <div className="text-xs font-black uppercase text-[var(--accent)]">{t("dpAssignQuota")}</div>
        <ShiftSelect shifts={board.shifts.filter((item) => item.status !== "finished")} value={shiftId} onChange={setShiftId} />
        <div className="flex gap-2">
          {(["franchise", "station"] as const).map((option) => (
            <button key={option} type="button" onClick={() => setLevel(option)} className={`h-10 flex-1 rounded-[8px] border text-xs font-black ${level === option ? "border-[var(--accent)] bg-[var(--accent-glow)] text-[var(--accent)]" : "border-[var(--line)] text-[var(--muted-strong)]"}`}>
              {option === "franchise" ? t("dpHqToFranchise") : t("dpFranchiseToStation")}
            </button>
          ))}
        </div>
        <select className={input} value={franchise} onChange={(e) => { setFranchise(e.target.value); setStation(""); }}>
          <option value="">{t("dpSelectFranchise")}</option>
          {network.franchises.map((item) => (
            <option key={item.id} value={item.name}>{item.name}</option>
          ))}
        </select>
        {level === "station" && (
          <select className={input} value={station} onChange={(e) => setStation(e.target.value)}>
            <option value="">{t("dpSelectStation")}</option>
            {network.stations.filter((item) => !franchise || item.franchise === franchise).map((item) => (
              <option key={item.id} value={item.name}>{item.name}</option>
            ))}
          </select>
        )}
        <input className={input} placeholder={t("dpQuotaCount")} inputMode="numeric" value={quota} onChange={(e) => setQuota(e.target.value.replace(/\D/g, ""))} />
        <button
          type="button"
          disabled={!shiftId || !franchise.trim() || quota === "" || (level === "station" && !station.trim())}
          onClick={async () => {
            setMessage(null);
            const result = await onSave({ action: "quota", shiftId, level, franchise: franchise.trim(), station: station.trim() || undefined, quota: Number(quota) });
            if (result) setMessage({ tone: "ok", text: t("dpQuotaOk") });
          }}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] text-sm font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
        >
          {t("dpSaveQuota")}
        </button>
        {shift && (
          <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3 text-xs font-bold text-[var(--muted-strong)]">
            {t("dpQuotaSummary", { planned: shift.plannedCount, allocated: franchiseTotal })}
            {franchiseTotal > shift.plannedCount && <span className="text-[var(--danger-ink)]">{t("dpOverQuota")}</span>}
          </div>
        )}
      </div>

      <div className="panel p-5">
        <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">{t("dpCurrentQuota")}</div>
        {quotas.length === 0 ? (
          <div className="text-sm font-bold text-[var(--muted)]">{t("dpNoQuota")}</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[10px] font-black uppercase text-[var(--muted)]">
                <th className="pb-2">{t("dpLevel")}</th>
                <th className="pb-2">{t("pfFranchise")}</th>
                <th className="pb-2">{t("pfStation")}</th>
                <th className="pb-2">{t("dpQuotaLabel")}</th>
                <th className="pb-2">{t("dpUpdatedAt")}</th>
              </tr>
            </thead>
            <tbody>
              {quotas.map((item) => (
                <tr key={item.id} className="border-t border-[var(--line)] font-bold">
                  <td className="py-2">{item.level === "franchise" ? t("pfFranchise") : t("pfStation")}</td>
                  <td className="py-2">{item.franchise}</td>
                  <td className="py-2">{item.station ?? "--"}</td>
                  <td className="py-2 font-black">{item.quota}</td>
                  <td className="py-2 text-xs text-[var(--muted)]">{item.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-black uppercase text-[var(--accent)]">{t("dpReviewProgress")}</div>
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
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {progress.map((row) => (
            <div key={row.name} className={`rounded-[8px] border p-3 ${row.unbound ? "border-[var(--danger)] bg-[var(--danger-bg)]" : row.pending > 0 ? "border-[var(--warning)] bg-[var(--warning-bg)]" : "border-[var(--line)] bg-[var(--surface-raised)]"}`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-black ${row.unbound ? "text-[var(--danger-ink)]" : ""}`}>{row.name}</span>
                {row.pending > 0 && !row.unbound && (
                  <button
                    type="button"
                    className="rounded-full bg-[var(--accent)] px-2.5 py-1 text-[10px] font-black uppercase text-[var(--accent-ink)]"
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
      </div>

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <div className="panel space-y-3 p-5">
        <div className="text-xs font-black uppercase text-[var(--accent)]">{t("dpProxySignup")}</div>
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
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] text-sm font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
        >
          <Users size={16} /> {t("dpSubmitSignup")}
        </button>
      </div>

      <div className="panel p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={allPendingSelected}
              onChange={(e) => setSelected(e.target.checked ? new Set(pending.map((s) => s.id)) : new Set())}
            />
            {t("dpPendingQueue", { n: pending.length })}
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => void review("approved")} disabled={selected.size === 0} className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] disabled:opacity-40">
              <CheckCircle2 size={14} /> {t("dpApproveN", { n: selected.size })}
            </button>
            <button type="button" onClick={() => void review("rejected")} disabled={selected.size === 0} className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-[var(--danger)] px-4 text-xs font-black uppercase text-[var(--danger-ink)] disabled:opacity-40">
              {t("dpReject")}
            </button>
          </div>
        </div>
        {pending.length === 0 ? (
          <div className="text-sm font-bold text-[var(--muted)]">{t("dpNoPending")}</div>
        ) : (
          <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
            {pending.map((signup) => {
              const shift = board.shifts.find((item) => item.id === signup.shiftId);
              return (
                <label key={signup.id} className="flex cursor-pointer items-center gap-3 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                  <input type="checkbox" checked={selected.has(signup.id)} onChange={() => toggle(signup.id)} className="h-4 w-4 accent-[var(--accent)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-black">
                      {signup.riderName || signup.rider99Id}
                      <span className="font-mono text-[11px] font-bold text-[var(--muted)]">{signup.rider99Id}</span>
                    </div>
                    <div className="text-[11px] font-bold text-[var(--muted)]">
                      {shift ? `${shift.date} ${shift.timeRange} · ${shift.hotzone}` : signup.shiftId} ｜ {signup.franchise} / {signup.station}
                    </div>
                  </div>
                  <Badge value={statusKey[signup.status] ? t(statusKey[signup.status]) : signup.status} />
                </label>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function ReportTab({ board, byShift, onAction, setMessage }: { board: Board; byShift: { signupMap: Map<string, ShiftSignup[]> }; onAction: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; setMessage: (m: { tone: "ok" | "warn" | "err"; text: string } | null) => void }) {
  const t = useT();
  const candidates = board.shifts.filter((shift) => shift.status !== "finished");

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

  return (
    <div className="panel p-5">
      <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">{t("dpReportTitle")}</div>
      {candidates.length === 0 ? (
        <div className="text-sm font-bold text-[var(--muted)]">{t("dpNoReportable")}</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[10px] font-black uppercase text-[var(--muted)]">
              <th className="pb-2">{t("dpShift")}</th>
              <th className="pb-2">{t("dpQuota99")}</th>
              <th className="pb-2">{t("dpStApproved")}</th>
              <th className="pb-2">{t("dpGap")}</th>
              <th className="pb-2">{t("dpStatus")}</th>
              <th className="pb-2">{t("dpAction")}</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((shift) => {
              const signups = byShift.signupMap.get(shift.id) ?? [];
              const approved = signups.filter((signup) => signup.status === "approved" || signup.status === "reported").length;
              const gap = shift.plannedCount - approved;
              return (
                <tr key={shift.id} className="border-t border-[var(--line)] font-bold">
                  <td className="py-2">
                    <div className="flex items-center gap-1 font-black">
                      {shift.isCritical && <Star size={13} className="text-[var(--accent)]" />}
                      {shift.date} {shift.timeRange}
                    </div>
                    <div className="text-[11px] text-[var(--muted)]">{shift.hotzone} · {shift.id}</div>
                  </td>
                  <td className="py-2">{shift.plannedCount}</td>
                  <td className={`py-2 font-black ${statBadge(approved, shift.plannedCount)}`}>{approved}</td>
                  <td className={`py-2 font-black ${gap > 0 ? "text-[var(--danger-ink)]" : "text-[var(--ok-ink)]"}`}>{gap > 0 ? gap : 0}</td>
                  <td className="py-2">{shift.reportedAt ? <Badge value={t("dpReportedAt", { x: shift.reportedAt })} /> : <Badge value={t("dpNotReported")} />}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void copyRoster(shift.id)} className="tag inline-flex items-center gap-1">
                        <ClipboardCopy size={13} /> {t("dpCopyRoster")}
                      </button>
                      <button type="button" onClick={() => void markReported(shift.id)} className="tag inline-flex items-center gap-1">
                        <Download size={13} /> {t("dpMarkReported")}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
