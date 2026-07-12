"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, RefreshCcw, Star } from "lucide-react";
import { AppShell, PageTitle } from "../../components/ui";
import { DataTable, SectionCard, Stat, StatusBadge, TodoCard, type BadgeTone, type DataColumn } from "../../components/kit";
import { readSession } from "../../lib/session";
import type { DispatchShift, ShiftQuota, ShiftSignup } from "../../lib/dispatch";
import { ShiftRiderPicker } from "../../components/shift-rider-picker";
import { useVentoStore } from "../../lib/store";
import { translate, type TranslationKey } from "../../lib/i18n";

type Board = { shifts: DispatchShift[]; quotas: ShiftQuota[]; signups: ShiftSignup[] };
type MyRow = { shift: DispatchShift; quota?: ShiftQuota; signups: ShiftSignup[] };

const WEEKDAY_KEYS: TranslationKey[] = ["pfWdMon", "pfWdTue", "pfWdWed", "pfWdThu", "pfWdFri", "pfWdSat", "pfWdSun"];

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mondayOf(): string {
  const d = new Date();
  const back = (d.getDay() - 1 + 7) % 7;
  d.setDate(d.getDate() - back);
  return localDateString(d);
}

function weekdayKeyOf(date: string): TranslationKey {
  return WEEKDAY_KEYS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7];
}

const shiftStatusKey: Record<string, TranslationKey> = { scheduling: "dpStScheduling", executing: "dpStExecuting", finished: "dpStFinished" };
// Badge semantics: green = running, amber = waiting on a human, gray = terminal.
const SHIFT_TONE: Record<string, BadgeTone> = { scheduling: "warn", executing: "success", finished: "neutral" };

const signupKey: Record<string, TranslationKey> = {
  submitted: "dpStSubmitted",
  approved: "dpStApproved",
  rejected: "dpStRejected",
  reported: "dpStReported",
  cancelled: "dpStCancelled",
};

const SIGNUP_TONE: Record<string, BadgeTone> = {
  submitted: "warn",
  approved: "success",
  reported: "success",
  rejected: "danger",
  cancelled: "neutral",
};

export default function StationDispatchPage() {
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
  const session = useMemo(() => readSession(), []);
  // SERVER session wins — stale localStorage must not point at another station.
  const [identity, setIdentity] = useState({ station: session?.station || "", franchise: session?.franchise || "" });
  // HQ / franchise sessions without a station binding → supervisor picker.
  const [pickerMode, setPickerMode] = useState(false);
  const [stationOptions, setStationOptions] = useState<Array<{ name: string; franchise?: string }>>([]);
  useEffect(() => {
    void fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const user = payload?.data?.user ?? payload?.user;
        if (user?.station) {
          setIdentity({ station: user.station, franchise: user.franchise || "" });
        } else if (user?.portal === "ponto" && user?.organization) {
          setIdentity({ station: user.organization, franchise: user.franchise || "" });
        } else {
          setPickerMode(true);
          void fetch("/api/network", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((net) => {
              const all = (net?.data?.stations ?? []) as Array<{ name: string; franchise?: string }>;
              const mine = user?.franchise ? all.filter((item) => item.franchise === user.franchise) : all;
              setStationOptions(mine);
              setIdentity((current) => current.station ? current : { station: mine[0]?.name ?? "", franchise: mine[0]?.franchise ?? user?.franchise ?? "" });
            })
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }, []);
  const station = identity.station;
  const franchise = identity.franchise;
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Ponto Manager" }), [session]);

  const [board, setBoard] = useState<Board>({ shifts: [], quotas: [], signups: [] });
  const [message, setMessage] = useState<{ tone: "ok" | "err" | "warn"; text: string } | null>(null);
  const [shiftId, setShiftId] = useState("");
  const [weekStart, setWeekStart] = useState(() => mondayOf());

  const load = useCallback(async () => {
    const response = await fetch(`/api/dispatch?station=${encodeURIComponent(station)}&franchise=${encodeURIComponent(franchise)}`, { headers, cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setBoard(payload.data);
  }, [headers, station, franchise]);

  useEffect(() => {
    void load();
  }, [load]);

  // Shifts that have a station-level quota for us.
  const myRows: MyRow[] = board.shifts
    .map((shift) => {
      const quota = board.quotas.find((item) => item.shiftId === shift.id && item.level === "station" && item.station === station);
      const signups = board.signups.filter((item) => item.shiftId === shift.id);
      return { shift, quota, signups };
    })
    .filter((row) => row.quota);

  const openShifts = myRows.filter((row) => row.shift.status === "scheduling");

  // Stats row: quota vs submissions across every shift assigned to us.
  const totalQuota = myRows.reduce((sum, row) => sum + (row.quota?.quota ?? 0), 0);
  const submittedTotal = myRows.reduce((sum, row) => sum + row.signups.length, 0);
  const approvedTotal = myRows.reduce((sum, row) => sum + row.signups.filter((item) => item.status === "approved" || item.status === "reported").length, 0);
  const waitingTotal = myRows.reduce((sum, row) => sum + row.signups.filter((item) => item.status === "submitted").length, 0);

  const weekEnd = addDays(weekStart, 6);
  const weekRows = myRows
    .filter(({ shift }) => shift.date >= weekStart && shift.date <= weekEnd)
    .sort((a, b) => a.shift.date.localeCompare(b.shift.date) || a.shift.timeRange.localeCompare(b.shift.timeRange));

  const activeRow = myRows.find((row) => row.shift.id === shiftId);

  const columns: Array<DataColumn<MyRow>> = [
    {
      key: "date",
      label: t("dfDate"),
      render: ({ shift }) => (
        <div translate="no">
          <div className={`font-black ${shiftId === shift.id ? "text-[var(--accent)]" : ""}`}>{shift.date.slice(5)}</div>
          <div className="text-[10px] font-bold text-[var(--muted)]">{t(weekdayKeyOf(shift.date))}</div>
        </div>
      ),
    },
    {
      key: "slot",
      label: t("dpSlot"),
      render: ({ shift }) => (
        <span className={`inline-flex items-center gap-1 font-black ${shiftId === shift.id ? "text-[var(--accent)]" : ""}`}>
          {shift.isCritical && <Star size={12} className="text-[var(--accent)]" />}
          {shift.timeRange}
        </span>
      ),
    },
    { key: "hotzone", label: t("dpHotzone"), render: ({ shift }) => <span className="text-xs text-[var(--muted-strong)]">{shift.hotzone}</span> },
    {
      key: "status",
      label: t("dpStatus"),
      render: ({ shift }) => <StatusBadge tone={SHIFT_TONE[shift.status] ?? "info"} label={shiftStatusKey[shift.status] ? t(shiftStatusKey[shift.status]) : shift.status} />,
    },
    { key: "quota", label: t("dsStationQuota"), align: "right", render: ({ quota }) => <span className="font-black text-[var(--accent)]">{quota?.quota ?? 0}</span> },
    { key: "submitted", label: t("dsSubmittedCnt"), align: "right", render: ({ signups }) => <span className="font-black">{signups.length}</span> },
    {
      key: "approved",
      label: t("dpApprovedCnt"),
      align: "right",
      render: ({ signups }) => <span className="font-black text-[var(--ok-ink)]">{signups.filter((item) => item.status === "approved" || item.status === "reported").length}</span>,
    },
    {
      key: "waiting",
      label: t("dpPendingCnt"),
      align: "right",
      render: ({ signups }) => {
        const waiting = signups.filter((item) => item.status === "submitted").length;
        return <span className={`font-black ${waiting > 0 ? "text-[var(--warning-ink)]" : "text-[var(--muted)]"}`}>{waiting}</span>;
      },
    },
  ];

  return (
    <AppShell>
      <PageTitle
        title={t("dsTitle")}
        eyebrow={t("dsEyebrow", { station, franchise })}
        action={
          <div className="flex items-center gap-2">
            {pickerMode && (
              <select
                className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-xs font-black text-[var(--text)] outline-none focus:border-[var(--accent)]"
                value={station}
                onChange={(e) => {
                  const next = stationOptions.find((item) => item.name === e.target.value);
                  setIdentity({ station: e.target.value, franchise: next?.franchise ?? "" });
                }}
              >
                {stationOptions.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
              </select>
            )}
            <button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> {t("pfRefresh")}</button>
          </div>
        }
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : message.tone === "warn" ? "border-[var(--warning)] bg-[var(--warning-bg)] text-[var(--warning-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      <section className="mb-4 grid gap-3 md:grid-cols-4">
        <Stat label={t("dsStationQuota")} value={String(totalQuota)} hint={t("dpWeekShifts", { n: myRows.length })} />
        <Stat label={t("dsSubmittedCnt")} value={String(submittedTotal)} />
        <Stat label={t("dpApprovedCnt")} value={String(approvedTotal)} />
        <TodoCard label={t("dpPendingCnt")} value={waitingTotal} tone={waitingTotal > 0 ? "warn" : "neutral"} hint={t("dpPendingHq")} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <SectionCard
          title={<span className="inline-flex items-center gap-2"><ClipboardList size={14} /> {t("dsBoardTitle")}</span>}
          right={
            <div className="flex flex-wrap items-center gap-2" data-i18n-skip>
              <button type="button" className="tag" onClick={() => setWeekStart(addDays(weekStart, -7))}>{t("dpPrevWeek")}</button>
              <span className="text-sm font-black">{weekStart} ~ {weekEnd}</span>
              <button type="button" className="tag" onClick={() => setWeekStart(addDays(weekStart, 7))}>{t("dpNextWeek")}</button>
              <button type="button" className="tag" onClick={() => setWeekStart(mondayOf())}>{t("dpThisWeek")}</button>
            </div>
          }
        >
          {myRows.length === 0 ? (
            <div className="text-sm font-bold text-[var(--muted)]">{t("dsNoQuota", { x: station })}</div>
          ) : (
            <>
              <DataTable<MyRow>
                columns={columns}
                rows={weekRows}
                rowKey={(row) => row.shift.id}
                onRowClick={(row) => {
                  if (row.shift.status !== "scheduling") return;
                  setShiftId(shiftId === row.shift.id ? "" : row.shift.id);
                }}
                minWidth={780}
              />
              {activeRow && activeRow.signups.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {activeRow.signups.map((signup) => (
                    <span key={signup.id} className="inline-flex items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1.5 text-[11px] font-bold">
                      {signup.riderName || signup.rider99Id}
                      <StatusBadge tone={SIGNUP_TONE[signup.status] ?? "neutral"} label={signupKey[signup.status] ? t(signupKey[signup.status]) : signup.status} />
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </SectionCard>
        <ShiftRiderPicker
          shift={openShifts.find((row) => row.shift.id === shiftId)?.shift ?? null}
          franchise={franchise}
          fixedStation={station}
          headers={headers}
          signups={board.signups}
          onDone={(text) => { setMessage({ tone: "ok", text }); void load(); }}
          onError={(text) => { setMessage({ tone: "err", text }); void load(); }}
        />
      </div>
    </AppShell>
  );
}
