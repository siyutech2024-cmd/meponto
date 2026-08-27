"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, ClipboardList, RefreshCcw, Star } from "lucide-react";
import { AppShell, PageTitle } from "../../components/ui";
import { Drawer, ProBadge, SectionCard, Stat, StatusBadge, TodoCard, type BadgeTone } from "../../components/kit";
import { readSession } from "../../lib/session";
import type { DispatchShift, ShiftQuota, ShiftSignup, SwapRequest, SwapRequestStatus } from "../../lib/dispatch";
import { ShiftRiderPicker } from "../../components/shift-rider-picker";
import { useVentoStore } from "../../lib/store";
import { translate, type TranslationKey } from "../../lib/i18n";

type Board = { shifts: DispatchShift[]; quotas: ShiftQuota[]; signups: ShiftSignup[]; swaps: SwapRequest[] };
type MyRow = { shift: DispatchShift; quota?: ShiftQuota; signups: ShiftSignup[] };
type RiderRow = { id: string; name: string; ninetyNineId?: string; ponto: string; franchise?: string };

function useT() {
  const language = useVentoStore((s) => s.language);
  return (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
}

/**
 * 换人原因用**稳定代码**存库,不存翻译后的文案 —— 站点端是葡语骑手头在选,
 * 总部端是中文控制台在读,存任何一种语言都会让另一端看不懂。代码在两端各自
 * 翻回本地语言;识别不出的旧值(或自由文本)原样显示。
 */
const SWAP_REASONS: Array<{ code: string; key: TranslationKey }> = [
  { code: "sick", key: "dsSwapR1" },
  { code: "late", key: "dsSwapR2" },
  { code: "personal", key: "dsSwapR3" },
  { code: "vehicle", key: "dsSwapR4" },
  { code: "other", key: "dsSwapR5" },
];

function swapReasonText(reason: string, t: (k: TranslationKey) => string): string {
  if (!reason) return "--";
  const [code, ...rest] = reason.split(" · ");
  const known = SWAP_REASONS.find((item) => item.code === code);
  const head = known ? t(known.key) : code;
  return rest.length > 0 ? `${head} · ${rest.join(" · ")}` : head;
}

const SWAP_TONE: Record<SwapRequestStatus, BadgeTone> = {
  pending: "warn",
  approved: "success",
  rejected: "danger",
  expired: "neutral",
};

const SWAP_STATUS_KEY: Record<SwapRequestStatus, TranslationKey> = {
  pending: "dsSwapStPending",
  approved: "dsSwapStApproved",
  rejected: "dsSwapStRejected",
  expired: "dsSwapStExpired",
};

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

// Same number semantics as the HQ dispatch board: green = on target,
// amber = getting there, red = far behind, gray = no target.
function statBadge(value: number, target: number) {
  if (target === 0) return "text-[var(--muted)]";
  if (value >= target) return "text-[var(--ok-ink)]";
  if (value >= target * 0.7) return "text-[var(--warning-ink)]";
  return "text-[var(--danger-ink)]";
}

export default function StationDispatchPage() {
  const t = useT();
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

  const [board, setBoard] = useState<Board>({ shifts: [], quotas: [], signups: [], swaps: [] });
  const [message, setMessage] = useState<{ tone: "ok" | "err" | "warn"; text: string } | null>(null);
  const [shiftId, setShiftId] = useState("");
  const [weekStart, setWeekStart] = useState(() => mondayOf());
  // 换人申请:点了哪个骑手的「换人」。null = 抽屉关闭。
  const [swapTarget, setSwapTarget] = useState<{ signup: ShiftSignup; shift: DispatchShift } | null>(null);
  const [riders, setRiders] = useState<RiderRow[]>([]);

  const load = useCallback(async () => {
    const response = await fetch(`/api/dispatch?station=${encodeURIComponent(station)}&franchise=${encodeURIComponent(franchise)}`, { headers, cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setBoard({ shifts: [], quotas: [], signups: [], swaps: [], ...payload.data });
  }, [headers, station, franchise]);

  useEffect(() => {
    void load();
  }, [load]);

  // Replacement-rider source for the swap form (same endpoint the signup
  // picker uses, so the two lists can never disagree).
  useEffect(() => {
    void fetch("/api/riders", { headers, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => payload && setRiders(payload.data as RiderRow[]))
      .catch(() => undefined);
  }, [headers]);

  const stationRiders = useMemo(
    () => riders.filter((rider) => Boolean(rider.ninetyNineId) && (!station || rider.ponto === station) && (!franchise || !rider.franchise || rider.franchise === franchise)),
    [riders, station, franchise],
  );

  // Shifts that have a station-level quota for us.
  const myRows: MyRow[] = board.shifts
    .map((shift) => {
      const quota = board.quotas.find((item) => item.shiftId === shift.id && item.level === "station" && item.station === station);
      const signups = board.signups.filter((item) => item.shiftId === shift.id);
      return { shift, quota, signups };
    })
    .filter((row) => row.quota);

  const openShifts = myRows.filter((row) => row.shift.status === "scheduling");

  const weekEnd = addDays(weekStart, 6);
  const weekRows = myRows
    .filter(({ shift }) => shift.date >= weekStart && shift.date <= weekEnd)
    .sort((a, b) => a.shift.date.localeCompare(b.shift.date) || a.shift.timeRange.localeCompare(b.shift.timeRange));

  const approvedOf = (row: MyRow) => row.signups.filter((item) => item.status === "approved" || item.status === "reported").length;

  // Stats row: THIS WEEK's quota vs approvals vs gap for this station.
  const weekQuota = weekRows.reduce((sum, row) => sum + (row.quota?.quota ?? 0), 0);
  const weekApproved = weekRows.reduce((sum, row) => sum + approvedOf(row), 0);
  const weekGap = weekRows.reduce((sum, row) => sum + Math.max(0, (row.quota?.quota ?? 0) - approvedOf(row)), 0);
  const weekWaiting = weekRows.reduce((sum, row) => sum + row.signups.filter((item) => item.status === "submitted").length, 0);

  // 一条报名同时只能有一条待确认的换人申请(服务端 409 拦重复),按状态算出来,
  // 不存任何本地"已提交"标记 —— 刷新后仍然准确。
  const pendingSwapSignupIds = new Set(board.swaps.filter((row) => row.status === "pending").map((row) => row.outSignupId));

  // Day-grouped board: date header + that day's shift rows (same as HQ ReportTab).
  const dayGroups = new Map<string, MyRow[]>();
  for (const row of weekRows) {
    const list = dayGroups.get(row.shift.date) ?? [];
    list.push(row);
    dayGroups.set(row.shift.date, list);
  }

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
        <Stat label={t("dsWeekQuota")} value={String(weekQuota)} hint={t("dpWeekShifts", { n: weekRows.length })} />
        <Stat label={t("dpApprovedCnt")} value={String(weekApproved)} />
        <Stat label={t("dpGap")} value={String(weekGap)} />
        <TodoCard label={t("dpPendingCnt")} value={weekWaiting} tone={weekWaiting > 0 ? "warn" : "neutral"} hint={t("dpPendingHq")} />
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
          ) : dayGroups.size === 0 ? (
            <div className="text-sm font-bold text-[var(--muted)]">{t("dsWeekEmpty")}</div>
          ) : (
            <div className="space-y-3">
              {[...dayGroups.entries()].map(([date, rows]) => {
                const dayQuota = rows.reduce((sum, row) => sum + (row.quota?.quota ?? 0), 0);
                const daySubmitted = rows.reduce((sum, row) => sum + row.signups.length, 0);
                const dayApproved = rows.reduce((sum, row) => sum + approvedOf(row), 0);
                const dayGap = rows.reduce((sum, row) => sum + Math.max(0, (row.quota?.quota ?? 0) - approvedOf(row)), 0);
                return (
                  <div key={date} className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1">
                      <span className="text-sm font-black" translate="no">
                        {date.slice(5)} <span className="ml-1 text-[10px] font-bold text-[var(--muted)]">{t(weekdayKeyOf(date))}</span>
                      </span>
                      <span className="text-[11px] font-bold text-[var(--muted-strong)]">
                        {t("dsStationQuota")} {dayQuota} · {t("dsSubmittedCnt")} {daySubmitted} · {t("dpApprovedCnt")} {dayApproved} · {t("dpGap")} {dayGap}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {rows.map((row) => {
                        const quota = row.quota?.quota ?? 0;
                        const approved = approvedOf(row);
                        const gap = Math.max(0, quota - approved);
                        const selectable = row.shift.status === "scheduling";
                        const selected = shiftId === row.shift.id;
                        return (
                          <div key={row.shift.id}>
                            <button
                              type="button"
                              onClick={() => {
                                if (!selectable) return;
                                setShiftId(selected ? "" : row.shift.id);
                              }}
                              className={`w-full rounded-[10px] border p-2.5 text-left transition-colors ${selected ? "border-[var(--accent)] bg-[var(--accent-glow)]" : "border-[var(--line)] bg-[var(--surface-raised)]"} ${selectable ? "hover:border-[var(--accent)]" : "cursor-default opacity-80"}`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <span className={`inline-flex items-center gap-1 text-[13px] font-black ${selected ? "text-[var(--accent)]" : ""}`} translate="no">
                                    {row.shift.isCritical && <Star size={12} className="text-[var(--accent)]" />}
                                    {row.shift.timeRange}
                                    {/* 模式二: PRO 班次 —— 只能填 PRO 骑手 */}
                                    {row.shift.pool === "pro" && <ProBadge small />}
                                    {/* 模式二 T5: 已锁班 —— 名单冻结,不能再提报/取消 */}
                                    {row.shift.lockedAt && <span title={t("dpLocked", { x: row.shift.lockedAt })}>🔒</span>}
                                  </span>
                                  <span className="truncate text-[11px] font-bold text-[var(--muted)]">{row.shift.hotzone}</span>
                                  <StatusBadge tone={SHIFT_TONE[row.shift.status] ?? "info"} label={shiftStatusKey[row.shift.status] ? t(shiftStatusKey[row.shift.status]) : row.shift.status} />
                                </div>
                                <div className="grid grid-cols-4 gap-3 text-center" translate="no">
                                  <div>
                                    <div className="text-[9px] font-black uppercase text-[var(--muted)]">{t("dsStationQuota")}</div>
                                    <div className="text-sm font-black text-[var(--accent)]">{quota}</div>
                                  </div>
                                  <div>
                                    <div className="text-[9px] font-black uppercase text-[var(--muted)]">{t("dsSubmittedCnt")}</div>
                                    <div className="text-sm font-black">{row.signups.length}</div>
                                  </div>
                                  <div>
                                    <div className="text-[9px] font-black uppercase text-[var(--muted)]">{t("dpApprovedCnt")}</div>
                                    <div className={`text-sm font-black ${statBadge(approved, quota)}`}>{approved}</div>
                                  </div>
                                  <div>
                                    <div className="text-[9px] font-black uppercase text-[var(--muted)]">{t("dpGap")}</div>
                                    <div className={`text-sm font-black ${gap > 0 ? "text-[var(--danger-ink)]" : "text-[var(--ok-ink)]"}`}>{gap}</div>
                                  </div>
                                </div>
                              </div>
                            </button>
                            {selected && row.signups.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2 px-1">
                                {row.signups.map((signup) => {
                                  // 只有"已通过/已提报"的人需要换人 —— 待审的直接改报名就行,
                                  // 服务端也是这么判的。已经有待确认申请的不给重复提交。
                                  const swappable = signup.status === "approved" || signup.status === "reported";
                                  const waiting = pendingSwapSignupIds.has(signup.id);
                                  return (
                                    <span key={signup.id} className="inline-flex items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1.5 text-[11px] font-bold">
                                      {signup.riderName || signup.rider99Id}
                                      <StatusBadge tone={SIGNUP_TONE[signup.status] ?? "neutral"} label={signupKey[signup.status] ? t(signupKey[signup.status]) : signup.status} />
                                      {swappable && (
                                        waiting ? (
                                          <StatusBadge tone="warn" label={t("dsSwapStPending")} />
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => { setMessage(null); setSwapTarget({ signup, shift: row.shift }); }}
                                            className="inline-flex h-6 items-center gap-1 rounded-[6px] border border-[var(--line)] px-2 text-[10px] font-black uppercase text-[var(--muted-strong)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                                          >
                                            <ArrowLeftRight size={11} /> {t("dsSwap")}
                                          </button>
                                        )
                                      )}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
        <ShiftRiderPicker
          shift={openShifts.find((row) => row.shift.id === shiftId)?.shift ?? null}
          franchise={franchise}
          fixedStation={station}
          weekShifts={
            openShifts.find((row) => row.shift.id === shiftId)?.shift.pool === "pro"
              ? openShifts.filter((row) => row.shift.pool === "pro").map((row) => row.shift)
              : []
          }
          headers={headers}
          signups={board.signups}
          onDone={(text) => { setMessage({ tone: "ok", text }); void load(); }}
          onError={(text) => { setMessage({ tone: "err", text }); void load(); }}
        />
      </div>

      {/* 我的换人申请 —— 纯历史。待确认是琥珀色的提醒,已决定的只是记录,
          不会再弹任何东西(状态由服务端决定,前端没有"已读/忽略")。 */}
      <SectionCard className="mt-4" title={<span className="inline-flex items-center gap-2"><ArrowLeftRight size={14} /> {t("dsSwapMine")}</span>}>
        {board.swaps.length === 0 ? (
          <div className="text-sm font-bold text-[var(--muted)]">{t("dsSwapEmpty")}</div>
        ) : (
          <div className="space-y-2">
            {board.swaps.map((row) => (
              <div key={row.id} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-black" translate="no">{row.shiftDate} {row.shiftRange}</span>
                  <span className="text-[12px] font-bold">
                    {row.outRiderName || row.outRider99Id} <span className="text-[var(--muted)]">→</span> {row.inRiderName || row.inRider99Id}
                  </span>
                  <StatusBadge tone={SWAP_TONE[row.status] ?? "neutral"} label={t(SWAP_STATUS_KEY[row.status] ?? "dsSwapStPending")} />
                </div>
                <div className="mt-1 text-[11px] font-bold text-[var(--muted-strong)]">
                  {t("dsSwapReason")}: {swapReasonText(row.reason, t)}
                  <span className="ml-2 text-[var(--muted)]" translate="no">{row.createdAt}</span>
                </div>
                {row.status !== "pending" && (
                  <div className="mt-0.5 text-[11px] font-bold text-[var(--muted)]">
                    {t("dsSwapDecided", { x: `${row.decidedAt ?? "--"}${row.decidedBy ? ` · ${row.decidedBy}` : ""}` })}
                    {row.decisionNote ? ` · ${t("dsSwapDecisionNote", { x: row.decisionNote })}` : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <Drawer
        open={Boolean(swapTarget)}
        onClose={() => setSwapTarget(null)}
        width={460}
        ariaLabel={t("dsSwapTitle")}
        title={<div className="text-sm font-black uppercase">{t("dsSwapTitle")}</div>}
      >
        {swapTarget && (
          <SwapForm
            target={swapTarget}
            riders={stationRiders}
            signups={board.signups}
            headers={headers}
            onDone={(text) => { setSwapTarget(null); setMessage({ tone: "ok", text }); void load(); }}
            onError={(text) => setMessage({ tone: "err", text })}
          />
        )}
      </Drawer>
    </AppShell>
  );
}

/**
 * 换人申请表单. Replacement is picked from this station's riders (the same
 * /api/riders source the signup picker uses); manual name + 99 ID stays
 * available for a rider who isn't in the roster yet. Reason is mandatory —
 * HQ decides on the reason, so an empty one just moves the question back.
 */
function SwapForm({
  target,
  riders,
  signups,
  headers,
  onDone,
  onError,
}: {
  target: { signup: ShiftSignup; shift: DispatchShift };
  riders: RiderRow[];
  signups: ShiftSignup[];
  headers: Record<string, string>;
  onDone: (text: string) => void;
  onError: (text: string) => void;
}) {
  const t = useT();
  const [manual, setManual] = useState(false);
  const [pick, setPick] = useState("");
  const [name, setName] = useState("");
  const [nineId, setNineId] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Anyone already on this shift can't be the replacement — the server refuses
  // it with a 409, so filtering here just saves the round trip.
  const taken = new Set(
    signups
      .filter((item) => item.shiftId === target.shift.id && item.status !== "rejected" && item.status !== "cancelled")
      .map((item) => item.rider99Id),
  );
  const options = riders.filter((rider) => !taken.has(rider.ninetyNineId ?? "")).sort((a, b) => a.name.localeCompare(b.name));
  const typing = manual || options.length === 0;

  const input = "h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";

  async function submit() {
    const chosen = options.find((rider) => rider.id === pick);
    const inRiderName = (typing ? name : chosen?.name ?? "").trim();
    const inRider99Id = (typing ? nineId : chosen?.ninetyNineId ?? "").trim();
    if (!inRiderName || !inRider99Id) {
      onError(t("dsSwapNeedRider"));
      return;
    }
    if (!reason) {
      onError(t("dsSwapNeedReason"));
      return;
    }
    setBusy(true);
    const response = await fetch("/api/dispatch", {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: "swapRequest",
        outSignupId: target.signup.id,
        inRiderName,
        inRider99Id,
        inRiderId: typing ? "" : chosen?.id ?? "",
        reason: note.trim() ? `${reason} · ${note.trim()}` : reason,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      onError(t("dsSwapFail", { x: payload.error ?? response.status }));
      return;
    }
    onDone(t("dsSwapOk"));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
        <div className="text-[10px] font-black uppercase text-[var(--muted)]">{t("dsSwapShift")}</div>
        <div className="text-sm font-black" translate="no">{target.shift.date} {target.shift.timeRange} · {target.shift.hotzone}</div>
        <div className="mt-2 text-[10px] font-black uppercase text-[var(--muted)]">{t("dsSwapOut")}</div>
        <div className="text-sm font-black">
          {target.signup.riderName || target.signup.rider99Id}
          <span className="ml-2 font-mono text-[10px] font-bold text-[var(--muted)]">{target.signup.rider99Id}</span>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-black uppercase text-[var(--muted)]">{t("dsSwapIn")}</span>
          {options.length > 0 && (
            <button type="button" className="tag" onClick={() => setManual((value) => !value)}>
              {typing ? t("dsSwapBack") : t("dsSwapManual")}
            </button>
          )}
        </div>
        {typing ? (
          <div className="space-y-2">
            {options.length === 0 && <div className="text-[11px] font-bold text-[var(--muted)]">{t("dsSwapNoRiders")}</div>}
            <input className={input} placeholder={t("dsSwapInName")} value={name} onChange={(e) => setName(e.target.value)} />
            <input className={input} inputMode="numeric" placeholder={t("dsSwapIn99")} value={nineId} onChange={(e) => setNineId(e.target.value.replace(/\D/g, ""))} />
          </div>
        ) : (
          <select className={input} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">{t("dsSwapPick")}</option>
            {options.map((rider) => (
              <option key={rider.id} value={rider.id}>{rider.name} · {rider.ninetyNineId}</option>
            ))}
          </select>
        )}
      </div>

      <div>
        <div className="mb-1.5 text-xs font-black uppercase text-[var(--muted)]">{t("dsSwapReason")}</div>
        <select className={input} value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">{t("dsSwapReasonPick")}</option>
          {SWAP_REASONS.map((item) => (
            <option key={item.code} value={item.code}>{t(item.key)}</option>
          ))}
        </select>
        <textarea
          className="mt-2 min-h-20 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3 text-sm font-bold outline-none focus:border-[var(--accent)]"
          placeholder={t("dsSwapNote")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] text-sm font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
      >
        <ArrowLeftRight size={15} /> {t("dsSwapSend")}
      </button>
    </div>
  );
}
