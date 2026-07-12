"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Send, Star } from "lucide-react";
import { AppShell, PageTitle } from "../../components/ui";
import { DataTable, SectionCard, Stat, StatusBadge, TodoCard, type BadgeTone, type DataColumn } from "../../components/kit";
import { readSession } from "../../lib/session";
import type { DispatchShift, ShiftQuota, ShiftSignup } from "../../lib/dispatch";
import { ShiftRiderPicker } from "../../components/shift-rider-picker";
import { useVentoStore } from "../../lib/store";
import { translate, type TranslationKey } from "../../lib/i18n";

type Board = { shifts: DispatchShift[]; quotas: ShiftQuota[]; signups: ShiftSignup[] };
type MyShiftRow = { shift: DispatchShift; franchiseQuota?: ShiftQuota; stationQuotas: ShiftQuota[] };

const statusKey: Record<string, TranslationKey> = { scheduling: "dpStScheduling", executing: "dpStExecuting", finished: "dpStFinished" };
// Badge semantics: green = running, amber = waiting on a human, gray = terminal.
const SHIFT_TONE: Record<string, BadgeTone> = { scheduling: "warn", executing: "success", finished: "neutral" };
const WEEKDAY_KEYS: TranslationKey[] = ["pfWdMon", "pfWdTue", "pfWdWed", "pfWdThu", "pfWdFri", "pfWdSat", "pfWdSun"];
const SLOT_RANGES = ["11:00~14:00", "14:00~18:00", "18:00~22:00"] as const;

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

export default function FranchiseDispatchPage() {
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
  const session = useMemo(() => readSession(), []);
  // SERVER session is the source of truth for identity — localStorage can be
  // stale after account switches and would query the wrong franchise.
  const [franchise, setFranchise] = useState(session?.franchise || "");
  // HQ sessions have no franchise binding → supervisor mode with a picker.
  const [hqMode, setHqMode] = useState(false);
  const [allFranchises, setAllFranchises] = useState<string[]>([]);
  useEffect(() => {
    void fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const user = payload?.data?.user ?? payload?.user;
        if (user?.franchise) {
          setFranchise(user.franchise);
        } else if (user?.portal === "franchise" && user?.organization) {
          setFranchise(user.organization);
        } else {
          setHqMode(true);
        }
      })
      .catch(() => undefined);
  }, []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Franchise Admin" }), [session]);

  const [board, setBoard] = useState<Board>({ shifts: [], quotas: [], signups: [] });
  const [myStations, setMyStations] = useState<string[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "err" | "warn"; text: string } | null>(null);
  // Split matrix: station name -> quota input for the SELECTED shift.
  const [matrix, setMatrix] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [activeShiftId, setActiveShiftId] = useState("");
  const [weekStart, setWeekStart] = useState(() => mondayOf());

  const load = useCallback(async () => {
    if (!franchise) return;
    const response = await fetch(`/api/dispatch?franchise=${encodeURIComponent(franchise)}`, { headers, cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setBoard(payload.data);
  }, [headers, franchise]);

  useEffect(() => {
    void load();
  }, [load]);

  // Network: franchise list (HQ picker default) + this franchise's stations.
  useEffect(() => {
    void fetch("/api/network", { headers, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const franchises = (payload?.data?.franchises ?? []) as Array<{ name: string }>;
        const stations = (payload?.data?.stations ?? []) as Array<{ name: string; franchise?: string }>;
        setAllFranchises(franchises.map((item) => item.name));
        setFranchise((current) => current || franchises[0]?.name || "");
        if (franchise) setMyStations(stations.filter((item) => item.franchise === franchise).map((item) => item.name));
      })
      .catch(() => undefined);
  }, [franchise, headers]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/dispatch", { method: "POST", headers, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? t("dpReqFail", { status: response.status }) });
      return null;
    }
    void load();
    return payload.data ?? {};
  }

  // Shifts where HQ allocated a franchise-level quota to us.
  const myShifts: MyShiftRow[] = board.shifts
    .map((shift) => {
      const franchiseQuota = board.quotas.find((quota) => quota.shiftId === shift.id && quota.level === "franchise" && quota.franchise === franchise);
      const stationQuotas = board.quotas.filter((quota) => quota.shiftId === shift.id && quota.level === "station" && quota.franchise === franchise);
      return { shift, franchiseQuota, stationQuotas };
    })
    .filter((row) => row.franchiseQuota);

  const pending = board.signups.filter((signup) => signup.status === "submitted");
  const knownStations = [...new Set(board.quotas.filter((q) => q.level === "station" && q.franchise === franchise).map((q) => q.station))].filter((s): s is string => Boolean(s));

  // Stats row: quota vs split vs review progress across all my shifts.
  const totalQuota = myShifts.reduce((sum, row) => sum + (row.franchiseQuota?.quota ?? 0), 0);
  const totalSplit = myShifts.reduce((sum, row) => sum + row.stationQuotas.reduce((x, q) => x + q.quota, 0), 0);
  const approvedTotal = board.signups.filter((s) => s.status === "approved" || s.status === "reported").length;

  const weekEnd = addDays(weekStart, 6);
  const weekRows = myShifts
    .filter(({ shift }) => shift.date >= weekStart && shift.date <= weekEnd)
    .sort((a, b) => a.shift.date.localeCompare(b.shift.date) || a.shift.timeRange.localeCompare(b.shift.timeRange));

  const activeRow = myShifts.find((row) => row.shift.id === activeShiftId);
  const splitStations = myStations.length > 0 ? myStations : knownStations;

  // ---- Week grid + station split matrix (same pattern as HQ QuotaTab) ----
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const slotRows = [...new Set<string>([...SLOT_RANGES, ...weekRows.map((row) => row.shift.timeRange)])].sort();
  const splitTotalOf = (row: MyShiftRow) => row.stationQuotas.reduce((sum, quota) => sum + quota.quota, 0);
  const stationQuotaOf = (row: MyShiftRow, station: string) => row.stationQuotas.find((quota) => quota.station === station)?.quota ?? 0;

  // Prefill the matrix from existing station quotas whenever the selection changes.
  useEffect(() => {
    const row = myShifts.find((item) => item.shift.id === activeShiftId);
    if (!row) return;
    const next: Record<string, string> = {};
    for (const quota of row.stationQuotas) if (quota.station && quota.quota > 0) next[quota.station] = String(quota.quota);
    setMatrix(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeShiftId, board.quotas]);

  const matrixTotal = splitStations.reduce((sum, station) => sum + (Number(matrix[station]) || 0), 0);
  const dirtyStations = activeRow ? splitStations.filter((station) => (Number(matrix[station]) || 0) !== stationQuotaOf(activeRow, station)) : [];

  async function saveSplit() {
    if (!activeRow || dirtyStations.length === 0) return;
    setBusy(true);
    setMessage(null);
    let ok = 0;
    for (const station of dirtyStations) {
      const result = await post({ action: "quota", shiftId: activeRow.shift.id, level: "station", franchise, station, quota: Number(matrix[station]) || 0 });
      if (result) ok += 1;
    }
    setBusy(false);
    if (ok > 0) setMessage({ tone: "ok", text: `${t("dpQuotaOk")} ×${ok}` });
  }

  // Cell tone: gray = untouched, amber = partly split, green = fully split, red = over-split.
  const cellTone = (row: MyShiftRow) => {
    const allocated = splitTotalOf(row);
    const target = row.franchiseQuota?.quota ?? 0;
    if (allocated === 0) return "border-[var(--line)] text-[var(--muted)]";
    if (allocated < target) return "border-[var(--warn)] text-[var(--warn-ink,var(--warning-ink))]";
    if (allocated === target) return "border-[var(--success)] text-[var(--success-ink)]";
    return "border-[var(--danger)] text-[var(--danger-ink)]";
  };

  const shiftColumns: Array<DataColumn<MyShiftRow>> = [
    {
      key: "date",
      label: t("dfDate"),
      render: ({ shift }) => (
        <div translate="no">
          <div className={`font-black ${activeShiftId === shift.id ? "text-[var(--accent)]" : ""}`}>{shift.date.slice(5)}</div>
          <div className="text-[10px] font-bold text-[var(--muted)]">{t(weekdayKeyOf(shift.date))}</div>
        </div>
      ),
    },
    {
      key: "slot",
      label: t("dpSlot"),
      render: ({ shift }) => (
        <span className={`inline-flex items-center gap-1 font-black ${activeShiftId === shift.id ? "text-[var(--accent)]" : ""}`}>
          {shift.isCritical && <Star size={12} className="text-[var(--accent)]" />}
          {shift.timeRange}
        </span>
      ),
    },
    { key: "hotzone", label: t("dpHotzone"), render: ({ shift }) => <span className="text-xs text-[var(--muted-strong)]">{shift.hotzone}</span> },
    {
      key: "status",
      label: t("dpStatus"),
      render: ({ shift }) => <StatusBadge tone={SHIFT_TONE[shift.status] ?? "info"} label={statusKey[shift.status] ? t(statusKey[shift.status]) : shift.status} />,
    },
    { key: "quota", label: t("dfMyQuota"), align: "right", render: ({ franchiseQuota }) => <span className="font-black">{franchiseQuota?.quota ?? 0}</span> },
    {
      key: "split",
      label: t("dfAllocated"),
      align: "right",
      render: ({ franchiseQuota, stationQuotas }) => {
        const allocated = stationQuotas.reduce((sum, quota) => sum + quota.quota, 0);
        return <span className={`font-black ${allocated > (franchiseQuota?.quota ?? 0) ? "text-[var(--danger-ink)]" : "text-[var(--accent)]"}`}>{allocated}</span>;
      },
    },
    {
      key: "approved",
      label: t("dpApprovedCnt"),
      align: "right",
      render: ({ shift }) => {
        const approved = board.signups.filter((item) => item.shiftId === shift.id && (item.status === "approved" || item.status === "reported")).length;
        return <span className="font-black text-[var(--ok-ink)]">{approved}</span>;
      },
    },
    {
      key: "waiting",
      label: t("dpPendingCnt"),
      align: "right",
      render: ({ shift }) => {
        const waiting = board.signups.filter((item) => item.shiftId === shift.id && item.status === "submitted").length;
        return <span className={`font-black ${waiting > 0 ? "text-[var(--warning-ink)]" : "text-[var(--muted)]"}`}>{waiting}</span>;
      },
    },
  ];

  const pendingColumns: Array<DataColumn<ShiftSignup>> = [
    { key: "rider", label: t("pfRider"), render: (signup) => <span className="font-black">{signup.riderName || signup.rider99Id}</span> },
    { key: "station", label: t("pfStation"), render: (signup) => <span className="tag">{signup.station}</span> },
    {
      key: "date",
      label: t("dfDate"),
      render: (signup) => <span className="text-xs text-[var(--muted)]">{board.shifts.find((item) => item.id === signup.shiftId)?.date ?? "—"}</span>,
    },
    {
      key: "slot",
      label: t("dpSlot"),
      render: (signup) => board.shifts.find((item) => item.id === signup.shiftId)?.timeRange ?? signup.shiftId,
    },
    { key: "nn", label: "99 ID", render: (signup) => <span className="font-mono text-[11px] text-[var(--muted)]">{signup.rider99Id}</span> },
    { key: "status", label: t("dpStatus"), align: "right", render: () => <StatusBadge tone="warn" label={t("dpPendingHq")} /> },
  ];

  return (
    <AppShell>
      <PageTitle
        title={t("dfTitle")}
        eyebrow={hqMode ? t("dfEyebrowHq", { x: franchise || t("dfPickFranchise") }) : t("dfEyebrowFr", { x: franchise })}
        action={
          <div className="flex items-center gap-2">
            {hqMode && (
              <select
                className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-xs font-black text-[var(--text)] outline-none focus:border-[var(--accent)]"
                value={franchise}
                onChange={(e) => setFranchise(e.target.value)}
              >
                {allFranchises.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            )}
            <button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> {t("pfRefresh")}</button>
          </div>
        }
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      <FranchiseOverview franchise={franchise} headers={headers} />

      {/* Dispatch stats: split progress + review todo. */}
      <section className="mb-4 grid gap-3 md:grid-cols-4">
        <Stat label={t("dfMyQuota")} value={String(totalQuota)} hint={t("dpWeekShifts", { n: myShifts.length })} />
        <Stat label={t("dfAllocated")} value={String(totalSplit)} />
        <Stat label={t("dpApprovedCnt")} value={String(approvedTotal)} />
        <TodoCard label={t("dpPendingCnt")} value={pending.length} tone={pending.length > 0 ? "warn" : "neutral"} hint={t("dfSubmittedHint")} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_minmax(400px,460px)]">
        <SectionCard
          title={t("dfAllocTitle")}
          right={
            <div className="flex flex-wrap items-center gap-2" data-i18n-skip>
              <button type="button" className="tag" onClick={() => setWeekStart(addDays(weekStart, -7))}>{t("dpPrevWeek")}</button>
              <span className="text-sm font-black">{weekStart} ~ {weekEnd}<span className="ml-2 text-[10px] font-bold text-[var(--muted)]">{t("dpWeekShifts", { n: weekRows.length })}</span></span>
              <button type="button" className="tag" onClick={() => setWeekStart(addDays(weekStart, 7))}>{t("dpNextWeek")}</button>
              <button type="button" className="tag" onClick={() => setWeekStart(mondayOf())}>{t("dpThisWeek")}</button>
            </div>
          }
        >
          {myShifts.length === 0 ? (
            <div className="text-sm font-bold text-[var(--muted)]">{t("dfNoQuota", { x: franchise })}</div>
          ) : (
            <>
              {/* ---- Week grid: click a slot to select the shift ---- */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-center text-xs">
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
                    {slotRows.map((range) => (
                      <tr key={range} className="border-t border-[var(--line)]">
                        <td className="py-1.5 text-left font-black" translate="no">{range}</td>
                        {weekDates.map((date) => {
                          const cellRows = weekRows.filter((row) => row.shift.date === date && row.shift.timeRange === range && row.shift.status !== "finished");
                          return (
                            <td key={`${date}|${range}`} className="px-1 py-1.5">
                              {cellRows.length === 0 ? (
                                <span className="text-[var(--muted)]">—</span>
                              ) : (
                                <div className="flex flex-col gap-1">
                                  {cellRows.map((row) => (
                                    <button
                                      key={row.shift.id}
                                      type="button"
                                      onClick={() => setActiveShiftId(row.shift.id === activeShiftId ? "" : row.shift.id)}
                                      translate="no"
                                      className={`rounded-[8px] border px-1.5 py-1 font-black transition-colors ${row.shift.id === activeShiftId ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]" : `bg-[var(--surface-raised)] hover:border-[var(--accent)] ${cellTone(row)}`}`}
                                      title={`${row.shift.hotzone}${row.shift.isCritical ? " ★" : ""}`}
                                    >
                                      {splitTotalOf(row)}/{row.franchiseQuota?.quota ?? 0}
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
              <div className="mb-3 mt-2 text-[11px] font-bold text-[var(--muted)]">{t("dpSelectShift")} · {t("dfAllocated")}/{t("dfMyQuota")}</div>

              {/* ---- Detail table: clicking a row selects the same shift ---- */}
              <DataTable<MyShiftRow>
                columns={shiftColumns}
                rows={weekRows}
                rowKey={(row) => row.shift.id}
                onRowClick={(row) => setActiveShiftId(activeShiftId === row.shift.id ? "" : row.shift.id)}
                minWidth={760}
              />
            </>
          )}
        </SectionCard>

        <div className="space-y-4">
          {/* ---- Station split matrix: all my stations, one batch save ---- */}
          {activeRow && (
            <SectionCard
              title={
                <div>
                  <div>{t("dfSplitToStation")}</div>
                  <div className="mt-0.5 text-[11px] font-bold normal-case text-[var(--muted)]" translate="no">
                    {activeRow.shift.date} {activeRow.shift.timeRange} · {activeRow.shift.hotzone}
                  </div>
                </div>
              }
              desc={t("dfSplitSummary", { quota: activeRow.franchiseQuota?.quota ?? 0, allocated: matrixTotal })}
              right={
                <button
                  type="button"
                  disabled={busy || dirtyStations.length === 0}
                  onClick={() => void saveSplit()}
                  className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
                >
                  {t("dfSave")}{dirtyStations.length > 0 ? ` ×${dirtyStations.length}` : ""}
                </button>
              }
            >
              {splitStations.length === 0 ? (
                <div className="text-sm font-bold text-[var(--muted)]">{t("dfNoStations")}</div>
              ) : (
                <div className="space-y-1.5">
                  {splitStations.map((station) => {
                    const val = matrix[station] ?? "";
                    const changed = (Number(val) || 0) !== stationQuotaOf(activeRow, station);
                    return (
                      <label key={station} className={`flex items-center gap-3 rounded-[8px] border px-3 py-1.5 ${changed ? "border-[var(--accent)]" : "border-[var(--line)]"}`}>
                        <span className="flex-1 truncate text-sm font-black">{station}</span>
                        <input
                          inputMode="numeric"
                          className="h-9 w-20 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] text-center text-sm font-black outline-none focus:border-[var(--accent)]"
                          value={val}
                          onChange={(e) => setMatrix({ ...matrix, [station]: e.target.value.replace(/\D/g, "") })}
                        />
                      </label>
                    );
                  })}
                </div>
              )}
              {matrixTotal > (activeRow.franchiseQuota?.quota ?? 0) && (
                <div className="mt-2 text-xs font-black text-[var(--danger-ink)]">{t("dfOverSplit")}</div>
              )}
            </SectionCard>
          )}

          <ShiftRiderPicker
            shift={activeRow?.shift ?? null}
            franchise={franchise}
            headers={headers}
            signups={board.signups}
            onDone={(text) => { setMessage({ tone: "ok", text }); void load(); }}
            onError={(text) => { setMessage({ tone: "err", text }); void load(); }}
          />
        </div>
      </div>

      {/* 已提报 · 待总部审核 */}
      <div className="mt-4">
        <SectionCard
          title={t("dfSubmittedTitle", { n: pending.length })}
          right={<span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--muted)]"><Send size={12} /> {t("dfSubmittedHint")}</span>}
        >
          {(() => {
            const stations = [...new Set(board.signups.map((x) => x.station))];
            const rows = stations.map((name) => ({
              name,
              pending: board.signups.filter((x) => x.station === name && x.status === "submitted").length,
              total: board.signups.filter((x) => x.station === name).length,
            }));
            return rows.length > 0 ? (
              <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {rows.map((row) => (
                  <div key={row.name} className={`flex items-center justify-between gap-2 rounded-[8px] border px-3 py-2 text-[12px] font-bold ${row.pending > 0 ? "border-[var(--warning)] bg-[var(--warning-bg)]" : "border-[var(--line)] bg-[var(--surface-raised)]"}`}>
                    <span className="truncate font-black">{row.name}</span>
                    <span className="shrink-0">{t("dfWaitingRatio", { pending: row.pending, total: row.total })}</span>
                  </div>
                ))}
              </div>
            ) : null;
          })()}
          <DataTable<ShiftSignup> columns={pendingColumns} rows={pending} rowKey={(signup) => signup.id} minWidth={680} empty={t("dpNoPending")} />
        </SectionCard>
      </div>

    </AppShell>
  );
}

/** Franchise identity card + this-week KPI strip (own data only). */
function FranchiseOverview({ franchise, headers }: { franchise: string; headers: Record<string, string> }) {
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
  const [info, setInfo] = useState<{ owner?: string; phone?: string; city?: string; depositBalance?: number; stations: number; riders: number } | null>(null);
  const [kpi, setKpi] = useState<{ orders: number; settle: number; ar: number | null; reportDate: string } | null>(null);
  const [week, setWeek] = useState<{ from: string; to: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const [networkResponse, ridersResponse, weeklyResponse, perfResponse] = await Promise.all([
        fetch("/api/network", { headers, cache: "no-store" }),
        fetch("/api/riders", { headers, cache: "no-store" }),
        fetch("/api/wallet?view=weekly", { headers, cache: "no-store" }),
        fetch("/api/performance", { headers, cache: "no-store" }),
      ]);
      if (networkResponse.ok) {
        const network = (await networkResponse.json()).data as { franchises: Array<{ name: string; owner?: string; phone?: string; city?: string; depositBalance?: number }>; stations: Array<{ franchise?: string }> };
        const mine = network.franchises.find((f) => f.name === franchise);
        const stations = network.stations.filter((s) => s.franchise === franchise).length;
        setInfo({ owner: mine?.owner, phone: mine?.phone, city: mine?.city, depositBalance: mine?.depositBalance, stations, riders: 0 });
      }
      if (ridersResponse.ok) {
        const riders = (await ridersResponse.json()).data as Array<{ franchise?: string }>;
        setInfo((current) => (current ? { ...current, riders: riders.length } : current));
      }
      if (weeklyResponse.ok) {
        const weekly = (await weeklyResponse.json()).data as { week: { from: string; to: string }; franchises: Array<{ franchise: string; settle: number; riders: Array<{ orders: number }> }> };
        setWeek(weekly.week);
        const mine = weekly.franchises.find((g) => g.franchise === franchise);
        setKpi((current) => ({ orders: mine?.riders.reduce((sum, r) => sum + r.orders, 0) ?? 0, settle: mine?.settle ?? 0, ar: current?.ar ?? null, reportDate: current?.reportDate ?? "" }));
      }
      if (perfResponse.ok) {
        const perf = (await perfResponse.json()).data as { date: string | null; riders: Array<{ ar: number | null }> };
        const ars = perf.riders.map((r) => r.ar).filter((v): v is number => v !== null && Number.isFinite(v));
        const avg = ars.length ? Math.round((ars.reduce((sum, v) => sum + v, 0) / ars.length) * 10) / 10 : null;
        setKpi((current) => ({ orders: current?.orders ?? 0, settle: current?.settle ?? 0, ar: avg, reportDate: perf.date ?? "" }));
      }
    })();
  }, [franchise, headers]);

  const md = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

  return (
    <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <div className="panel p-4 md:col-span-2">
        <div className="text-[11px] font-bold uppercase text-[var(--muted)]">{t("dfProfile")}</div>
        <div className="mt-1 text-sm font-black">{franchise}</div>
        <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">
          {info ? `${info.owner || "—"}${info.phone ? ` ｜ ${info.phone}` : ""} ｜ ${info.city || "São Paulo"}` : t("dpLoading")}
        </div>
      </div>
      <Stat label={t("dfStations")} value={info ? String(info.stations) : "—"} />
      <Stat label={t("pfRiders")} value={info ? String(info.riders) : "—"} />
      <Stat label={t("dfDeposit")} value={info ? `R$ ${(info.depositBalance ?? 0).toFixed(2)}` : "—"} />
      <Stat label={week ? t("dfWeekOrders", { from: md(week.from), to: md(week.to) }) : t("dfWeekOrdersShort")} value={kpi ? String(kpi.orders) : "—"} />
      <div className="panel border-[var(--accent)] p-4">
        <div className="text-[11px] font-bold uppercase text-[var(--accent)]">{t("dfWeekDue")}{kpi?.ar !== null && kpi?.ar !== undefined ? t("dfWeekDueAr", { ar: kpi.ar }) : ""}</div>
        <div className="mt-1 text-2xl font-black text-[var(--accent)]">{kpi ? `R$ ${kpi.settle.toFixed(2)}` : "—"}</div>
      </div>
    </div>
  );
}
