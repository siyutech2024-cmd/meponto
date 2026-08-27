"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, CalendarDays, CheckCircle2, ClipboardCopy, ClipboardList, Download, Lock, Plus, RefreshCcw, Send, Star, Unlock, Upload, Users, X } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
import { Chip, DataTable, Drawer, ProBadge, SectionCard, Stat, StatusBadge, TodoCard, Toolbar, type BadgeTone, type DataColumn } from "../components/kit";
import type { DispatchShift, ShiftQuota, ShiftSignup, SwapRequest, SwapRequestStatus } from "../lib/dispatch";
import { downloadCsv } from "../lib/csv";
import { useDialog } from "../components/dialog";
import type { Franchise } from "../lib/network";
import type { Ponto } from "../lib/data";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";
import { canonicalCity, DEFAULT_CITY, type City } from "../lib/cities";
import { HOT_ZONES } from "../rider-monitor/hot-zones";

function useT() {
  const language = useVentoStore((s) => s.language);
  return (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
}

type Board = {
  shifts: DispatchShift[];
  quotas: ShiftQuota[];
  signups: ShiftSignup[];
  swaps: SwapRequest[];
  /** Cities this caller may switch between (server-decided; a tenant only gets its own). */
  cities: City[];
  /** The single city the payload is scoped to (null = HQ asked for everything). */
  city: City | null;
};

const EMPTY_BOARD: Board = { shifts: [], quotas: [], signups: [], swaps: [], cities: [], city: null };

/**
 * Hot zones of one city, deduplicated, for the scheduling form.
 * Compare through `canonicalCity` — historic rows spell São Paulo as "圣保罗"
 * and a raw string match would silently return an empty list.
 */
function hotzonesOf(city: string): string[] {
  const target = canonicalCity(city);
  const names = new Set<string>();
  for (const zone of HOT_ZONES) {
    if (canonicalCity(zone.city) !== target) continue;
    const name = zone.hotZone ?? zone.group;
    if (name) names.add(name);
  }
  return [...names];
}

const headers = { "Content-Type": "application/json", "x-vento-role": "Super Admin" };

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

/** 换人原因以稳定代码入库(站点端选葡语、总部读中文,存文案两边都会错)。 */
const SWAP_REASON_KEY: Record<string, TranslationKey> = {
  sick: "dsSwapR1",
  late: "dsSwapR2",
  personal: "dsSwapR3",
  vehicle: "dsSwapR4",
  other: "dsSwapR5",
};

function swapReasonText(reason: string, t: (k: TranslationKey) => string): string {
  if (!reason) return "--";
  const [code, ...rest] = reason.split(" · ");
  const head = SWAP_REASON_KEY[code] ? t(SWAP_REASON_KEY[code]) : code;
  return rest.length > 0 ? `${head} · ${rest.join(" · ")}` : head;
}

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
  { id: "swap", labelKey: "dpTabSwap", icon: ArrowLeftRight },
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
  const [board, setBoard] = useState<Board>(EMPTY_BOARD);
  /**
   * 城市切换 —— 每次 GET 都带上 city,服务端按城市过滤 shifts/quotas/signups/swaps
   * 和 summary,所以顶部统计卡自动跟着城市走(前端不再另算一份全量口径)。
   */
  const [city, setCity] = useState<City>(DEFAULT_CITY);
  /**
   * 换人待确认 —— 直接用服务端 summary,不在前端另算一份。服务端已经在 GET 时
   * 把过期的 pending 关掉了,所以这个数字只会因为"被处理"或"班次已过"而下降,
   * 前端不存任何"已读/忽略"状态。
   */
  const [pendingSwaps, setPendingSwaps] = useState(0);
  /**
   * 模式二 · PRO 排班表 = 独立工作区(业务方 2026-08-06 定:"单独的排班表")。
   *
   * 切到 PRO 后,四个 tab 看到的、以及新建出来的班次都属于 PRO 池 —— 视觉上
   * 就是另一张排班表,底层仍是同一个 pool 字段,所以按池下发、跨池提报拦截、
   * 锁班二次校验这些既有逻辑全部继续生效,不用另起一套数据。
   *
   * 注意配额和提报也一起过滤:PRO 班的配额拆分和名单绝不能混进普通池的视图,
   * 否则加盟商会按错误的总数分配人头。
   */
  const [pool, setPool] = useState<"standard" | "pro">("standard");
  const [network, setNetwork] = useState<{ franchises: Franchise[]; stations: Ponto[] }>({ franchises: [], stations: [] });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/dispatch?city=${encodeURIComponent(city)}`, { headers, cache: "no-store" });
      const payload = await response.json();
      if (response.ok) {
        setBoard({ ...EMPTY_BOARD, ...payload.data });
        setPendingSwaps(Number(payload.summary?.pendingSwaps ?? 0));
      }
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    void load();
  }, [load]);

  // 服务端说了算:如果当前选中的城市不在这个调用方的可见列表里(比如只在新城市
  // 运营的租户,默认值是圣保罗),就跟着服务端返回的城市走。
  useEffect(() => {
    if (board.cities.length === 0) return;
    if (board.cities.some((item) => canonicalCity(item) === canonicalCity(city))) return;
    setCity(canonicalCity(board.city ?? board.cities[0]));
  }, [board.cities, board.city, city]);

  useEffect(() => {
    fetch("/api/network", { headers, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => payload && setNetwork({ franchises: payload.data.franchises, stations: payload.data.stations }))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 当前池的视图:班次按池筛,配额和报名跟着班次走(避免跨池串台)。
  const scopedBoard = useMemo<Board>(() => {
    const shifts = board.shifts.filter((shift) => (shift.pool === "pro") === (pool === "pro"));
    const ids = new Set(shifts.map((shift) => shift.id));
    return {
      shifts,
      quotas: board.quotas.filter((quota) => ids.has(quota.shiftId)),
      signups: board.signups.filter((signup) => ids.has(signup.shiftId)),
      // 换人申请**不**按池过滤:告警不该因为看的是另一张排班表就消失。
      // (城市过滤已经在服务端做掉了,这里不再做任何跨城市假设。)
      swaps: board.swaps,
      cities: board.cities,
      city: board.city,
    };
  }, [board, pool]);

  async function post(body: Record<string, unknown>) {
    // 模式二 H4: the "lock anyway" override travels as a query flag so the
    // request body stays a clean domain payload.
    const { __force, ...payloadBody } = body as { __force?: boolean };
    const url = __force ? "/api/dispatch?force=1" : "/api/dispatch";
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(payloadBody) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      // 模式二 H4: the lock action can fail on purpose (roster carries riders
      // who left the PRO pool). That caller needs the offender list to offer
      // the forced override, so hand the failure back INSTEAD of only toasting
      // it. Every other action keeps the old "null means failed" contract.
      if (body.action === "lock" && payload.code === "pool_mismatch") {
        return { __failed: true, ...payload } as Record<string, unknown>;
      }
      setMessage({ tone: "err", text: payload.error ?? t("dpReqFail", { status: response.status }) });
      return null;
    }
    void load();
    return payload.data as Record<string, unknown>;
  }

  const byShift = useMemo(() => {
    const quotaMap = new Map<string, ShiftQuota[]>();
    for (const quota of scopedBoard.quotas) {
      quotaMap.set(quota.shiftId, [...(quotaMap.get(quota.shiftId) ?? []), quota]);
    }
    const signupMap = new Map<string, ShiftSignup[]>();
    for (const signup of scopedBoard.signups) {
      signupMap.set(signup.shiftId, [...(signupMap.get(signup.shiftId) ?? []), signup]);
    }
    return { quotaMap, signupMap };
  }, [scopedBoard]);

  // Todo-driven header: pending review is the call to action.
  const pendingCount = scopedBoard.signups.filter((s) => s.status === "submitted").length;
  const approvedCount = scopedBoard.signups.filter((s) => s.status === "approved" || s.status === "reported").length;
  const schedulingCount = scopedBoard.shifts.filter((s) => s.status === "scheduling").length;
  const notReportedCount = scopedBoard.shifts.filter((s) => s.status !== "finished" && !s.reportedAt).length;

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

      <section className="mb-4 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        <TodoCard label={t("dpPendingCnt")} value={pendingCount} tone={pendingCount > 0 ? "warn" : "neutral"} active={tab === "review"} onClick={() => setTab("review")} hint={t("dpTabReview")} />
        <TodoCard label={t("dpSwapPendingCnt")} value={pendingSwaps} tone={pendingSwaps > 0 ? "warn" : "neutral"} active={tab === "swap"} onClick={() => setTab("swap")} hint={t("dpTabSwap")} />
        <TodoCard label={t("dpNotReported")} value={notReportedCount} tone={notReportedCount > 0 ? "warn" : "neutral"} active={tab === "report"} onClick={() => setTab("report")} hint={t("dpTabReport")} />
        <Stat label={t("dpStScheduling")} value={String(schedulingCount)} />
        <Stat label={t("dpApprovedCnt")} value={String(approvedCount)} />
      </section>

      {/* 模式二 · 排班表切换。放在 tab 之上 —— 先选"哪张表",再选"看这张表的哪个环节"。
          PRO 高亮成金色,和全站 PRO 徽章同色,一眼能看出自己在哪张表上操作。 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* 城市切换 —— 只在调用方能看到多座城市时出现;单城市租户不该看到一个
            没有第二个选项的控件。列表由服务端给(board.cities)。 */}
        {board.cities.length > 1 && (
          <>
            <span className="text-[11px] font-black uppercase text-[var(--muted)]">{t("dpCity")}</span>
            <div className="flex overflow-hidden rounded-full border border-[var(--line)]">
              {board.cities.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setCity(canonicalCity(name))}
                  className={`h-8 px-3 text-xs font-black ${canonicalCity(name) === canonicalCity(city) ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "text-[var(--muted-strong)] hover:bg-[var(--surface-raised)]"}`}
                >
                  {name}
                </button>
              ))}
            </div>
            <span className="mx-1 h-5 w-px bg-[var(--line)]" aria-hidden />
          </>
        )}
        <span className="text-[11px] font-black uppercase text-[var(--muted)]">{t("dpPoolTable")}</span>
        <button
          type="button"
          onClick={() => setPool("standard")}
          className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-black ${pool === "standard" ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "border border-[var(--line)] text-[var(--muted-strong)]"}`}
        >
          {t("dpPoolStandard")}
        </button>
        <button
          type="button"
          onClick={() => setPool("pro")}
          className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-black ${pool === "pro" ? "bg-[#eda100] text-[#171b33]" : "border border-[var(--line)] text-[var(--muted-strong)]"}`}
        >
          PRO
        </button>
        {pool === "pro" && (
          <span className="text-[11px] font-bold text-[var(--muted)]">{t("dpPoolProHint")}</span>
        )}
      </div>

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

      {tab === "board" && <BoardTab board={scopedBoard} byShift={byShift} loading={loading} onAction={post} setMessage={setMessage} pool={pool} city={city} />}
      {tab === "quota" && <QuotaTab board={scopedBoard} byShift={byShift} onSave={post} setMessage={setMessage} network={network} />}
      {tab === "review" && <ReviewTab board={scopedBoard} onAction={post} setMessage={setMessage} network={network} />}
      {tab === "report" && <ReportTab board={scopedBoard} byShift={byShift} onAction={post} setMessage={setMessage} />}
      {tab === "swap" && <SwapTab swaps={board.swaps} onAction={post} setMessage={setMessage} />}
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

function BoardTab({ board, byShift, loading, onAction, setMessage, pool, city }: { board: Board; byShift: { quotaMap: Map<string, ShiftQuota[]>; signupMap: Map<string, ShiftSignup[]> }; loading: boolean; onAction: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; setMessage: (m: { tone: "ok" | "warn" | "err"; text: string } | null) => void; pool: "standard" | "pro"; city: City }) {
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
    // 建在当前这张表里 —— 在 PRO 表上快速新增,建出来的就是 PRO 班;
    // 城市也跟着当前视图走,否则在新城市面板上快建会落到圣保罗去。
    // 默认城市不传 hotzone:沿用服务端旧默认值,班次 id 与历史数据保持逐字一致;
    // 其他城市必须带本城热区,否则会建出一个圣保罗热区名的班次。
    const cityZone = canonicalCity(city) === DEFAULT_CITY ? "" : hotzonesOf(city)[0] ?? "";
    const result = await onAction({ action: "setWeek", pool, city, ...(cityZone ? { hotzone: cityZone } : {}), entries: [{ date, timeRange, plannedCount }] });
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
            {shift.pool === "pro" && <ProBadge small />}
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
      ) : weekShifts.length === 0 ? (
        // 空白周历会被当成"页面坏了"。说清楚是这座城市这一周没有班次,并指路。
        <div className="panel p-8 text-center text-sm font-bold text-[var(--muted)]">{t("dpCityWeekEmpty", { city, action: t("dpTabSetup") })}</div>
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
        <WeekSetupForm board={board} onSave={onAction} setMessage={setMessage} pool={pool} city={city} />
      </Drawer>

      <Drawer open={importOpen} onClose={() => setImportOpen(false)} width={560} ariaLabel={t("dpTabImport")} title={<div className="text-sm font-black uppercase">{t("dpTabImport")}</div>}>
        <ImportForm onImport={onAction} setMessage={setMessage} pool={pool} city={city} />
      </Drawer>
    </div>
  );
}

/** Sentinel option value: fall back to a free-text hot zone. */
const HOTZONE_CUSTOM = "__custom__";

function WeekSetupForm({ board, onSave, setMessage, pool, city }: { board: Board; onSave: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; setMessage: (m: { tone: "ok" | "warn" | "err"; text: string } | null) => void; pool: "standard" | "pro"; city: City }) {
  const t = useT();
  const [weekStart, setWeekStart] = useState(() => mondayOf(1));
  // 热区跟着城市走(以前硬编码 Santo Amaro,在新城市上会建出一批圣保罗的热区名)。
  const zoneOptions = useMemo(() => hotzonesOf(city), [city]);
  const [hotzone, setHotzone] = useState(() => zoneOptions[0] ?? "");
  // 老数据里的热区名不一定在 HOT_ZONES 里,所以保留手填的口子。
  const [customZone, setCustomZone] = useState(false);
  const [grid, setGrid] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCustomZone(false);
    setHotzone(zoneOptions[0] ?? "");
  }, [zoneOptions]);

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
          {customZone || zoneOptions.length === 0 ? (
            <div className="mt-1.5 flex gap-2">
              <input className={`${input} w-full`} value={hotzone} placeholder={t("dpHotzoneCustom")} onChange={(e) => setHotzone(e.target.value)} />
              {zoneOptions.length > 0 && (
                <button type="button" className="tag h-11 shrink-0" onClick={() => { setCustomZone(false); setHotzone(zoneOptions[0]); }}>
                  {t("dpHotzoneBack")}
                </button>
              )}
            </div>
          ) : (
            <select
              className={`${input} mt-1.5 w-full`}
              value={hotzone}
              onChange={(e) => {
                if (e.target.value === HOTZONE_CUSTOM) {
                  setCustomZone(true);
                  setHotzone("");
                  return;
                }
                setHotzone(e.target.value);
              }}
            >
              {zoneOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
              <option value={HOTZONE_CUSTOM}>{t("dpHotzoneOther")}</option>
            </select>
          )}
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
          if (!hotzone.trim()) {
            setMessage({ tone: "warn", text: t("dpHotzoneWarn") });
            setBusy(false);
            return;
          }
          const result = await onSave({ action: "setWeek", pool, city, hotzone: hotzone.trim(), entries });
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

function ImportForm({ onImport, setMessage, pool, city }: { onImport: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; setMessage: (m: { tone: "ok" | "warn" | "err"; text: string } | null) => void; pool: "standard" | "pro"; city: City }) {
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
          // 在 PRO 表上导入 = 这批 Eastwind 班次(来自新 OL 账号)整批标为 PRO
          // 城市 = 当前视图的城市(仅作兜底:粘贴的表格里自带城市时以表格为准),
          // 否则在新城市面板上导入会整批落回圣保罗、在这个面板里看不见。
          const result = await onImport({ action: "import", pool, city, planId: planId.trim(), planName: planName.trim(), text });
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
  // 模式二:审核队列按池过滤。PRO 提报每周固定一大批 —— 点「PRO」chip →
  // 全选 → 通过,三下清完,不用在混合队列里逐条挑。
  const [poolChip, setPoolChip] = useState<"" | "pro" | "standard">("");

  const shiftPoolById = new Map(board.shifts.map((shift) => [shift.id, shift.pool === "pro" ? "pro" : "standard"]));
  const pendingAll = board.signups.filter((signup) => signup.status === "submitted");
  const pending = pendingAll.filter((signup) => !poolChip || shiftPoolById.get(signup.shiftId) === poolChip);
  const pendingProCnt = pendingAll.filter((signup) => shiftPoolById.get(signup.shiftId) === "pro").length;
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
      const blocked = Array.isArray(result.blocked) ? (result.blocked as string[]) : [];
      const okText = t("dpReviewOk", { verb: status === "approved" ? t("dpStApproved") : t("dpStRejected"), n: String(result.changed) });
      setMessage(
        blocked.length > 0
          ? { tone: "warn", text: `${okText} · ${t("dpQuotaBlocked", { n: blocked.length })}：${blocked.slice(0, 5).join("、")}${blocked.length > 5 ? "…" : ""}` }
          : { tone: "ok", text: okText },
      );
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
          desc={
            <div className="mt-1 flex gap-1.5">
              {([["", `全部 ${pendingAll.length}`], ["pro", `PRO ${pendingProCnt}`], ["standard", `普通 ${pendingAll.length - pendingProCnt}`]] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setPoolChip(key); setSelected(new Set()); }}
                  className="inline-flex h-7 items-center rounded-full px-2.5 text-[10px] font-black uppercase"
                  style={
                    poolChip === key
                      ? key === "pro"
                        ? { background: "#eda100", color: "#171b33" }
                        : { background: "var(--text)", color: "var(--bg)" }
                      : { border: "1px solid var(--line)", color: "var(--muted-strong)" }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
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

/**
 * 换人申请队列 (HQ). The whole point of this tab is that an alert fires ONCE:
 * `pending` is the only state that shows up in the default view and in the
 * header count, and a decision is terminal on the server. There is deliberately
 * no local "read/ignore" state — a stale tab that re-submits gets the decided
 * record back (alreadyDecided) instead of re-opening anything.
 */
function SwapTab({ swaps, onAction, setMessage }: { swaps: SwapRequest[]; onAction: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; setMessage: (m: { tone: "ok" | "warn" | "err"; text: string } | null) => void }) {
  const t = useT();
  const dialog = useDialog();
  const [filter, setFilter] = useState<"pending" | "decided" | "all">("pending");
  const [busyId, setBusyId] = useState("");

  const pendingCount = swaps.filter((row) => row.status === "pending").length;
  const rows = swaps.filter((row) => (filter === "all" ? true : filter === "pending" ? row.status === "pending" : row.status !== "pending"));

  async function decide(row: SwapRequest, approve: boolean) {
    let note = "";
    if (approve) {
      const ok = await dialog.confirm(t("dpSwapApproveTitle"), {
        message: t("dpSwapApproveMsg", { out: row.outRiderName || row.outRider99Id, in: row.inRiderName || row.inRider99Id }),
        confirmText: t("dpSwapApproveConfirm"),
      });
      if (!ok) return;
    } else {
      const value = await dialog.prompt(t("dpSwapRejectTitle"), {
        message: t("dpSwapRejectMsg"),
        placeholder: t("dpSwapReason"),
        confirmText: t("dpSwapRejectConfirm"),
      });
      if (value === null) return;
      note = value;
    }
    setMessage(null);
    setBusyId(row.id);
    // onAction refreshes the board, so the row leaves the pending list and the
    // header count drops on its own — nothing to update locally.
    const result = await onAction({ action: "swapDecide", swapId: row.id, approve, note });
    setBusyId("");
    if (!result) return;
    const finalStatus = String(result.status ?? "");
    if (finalStatus && finalStatus !== (approve ? "approved" : "rejected")) {
      setMessage({ tone: "warn", text: t("dpSwapAlready") });
      return;
    }
    setMessage({
      tone: "ok",
      text: approve ? t("dpSwapOkApproved", { out: row.outRiderName || row.outRider99Id, in: row.inRiderName || row.inRider99Id }) : t("dpSwapOkRejected"),
    });
  }

  const columns: Array<DataColumn<SwapRequest>> = [
    {
      key: "shift",
      label: t("dpShift"),
      render: (row) => (
        <div>
          <div className="font-black" translate="no">{row.shiftDate} {row.shiftRange}</div>
          <div className="text-[11px] font-bold text-[var(--muted)]">{row.franchise} / {row.station}</div>
        </div>
      ),
    },
    {
      key: "swap",
      label: `${t("dpSwapOut")} → ${t("dpSwapIn")}`,
      render: (row) => (
        <div className="text-xs font-bold">
          <div className="text-[var(--danger-ink)]">{row.outRiderName || row.outRider99Id} <span className="font-mono text-[10px] text-[var(--muted)]">{row.outRider99Id}</span></div>
          <div className="text-[var(--ok-ink)]">→ {row.inRiderName || row.inRider99Id} <span className="font-mono text-[10px] text-[var(--muted)]">{row.inRider99Id}</span></div>
        </div>
      ),
    },
    { key: "reason", label: t("dpSwapReason"), render: (row) => <span className="text-xs font-bold">{swapReasonText(row.reason, t)}</span> },
    {
      key: "by",
      label: t("dpSubmittedAt"),
      render: (row) => <span className="text-[11px] font-bold text-[var(--muted)]">{t("dpSwapBy", { who: row.createdBy, at: row.createdAt })}</span>,
    },
    {
      key: "action",
      label: t("dpAction"),
      align: "right",
      render: (row) =>
        row.status === "pending" ? (
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={busyId === row.id}
              onClick={() => void decide(row, true)}
              className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-3.5 text-xs font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
            >
              <CheckCircle2 size={13} /> {t("dpSwapApprove")}
            </button>
            <button
              type="button"
              disabled={busyId === row.id}
              onClick={() => void decide(row, false)}
              className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-[var(--danger)] px-3.5 text-xs font-black uppercase text-[var(--danger-ink)] disabled:opacity-50"
            >
              {t("dpReject")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <StatusBadge tone={SWAP_TONE[row.status] ?? "neutral"} label={t(SWAP_STATUS_KEY[row.status] ?? "dsSwapStPending")} />
            <span className="text-[10px] font-bold text-[var(--muted)]">{t("dpSwapDecidedBy", { who: row.decidedBy ?? "--", at: row.decidedAt ?? "--" })}</span>
            {row.decisionNote && <span className="text-[10px] font-bold text-[var(--muted-strong)]">{row.decisionNote}</span>}
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <SectionCard
        title={t("dpSwapQueue", { n: rows.length })}
        desc={t("dpSwapPendingCnt") + ` ${pendingCount}`}
        right={
          <div className="flex flex-wrap gap-2">
            {([["pending", t("dpSwapChipPending")], ["decided", t("dpSwapChipDecided")], ["all", t("fmChipAll")]] as const).map(([key, label]) => (
              <Chip key={key} active={filter === key} onClick={() => setFilter(key)}>{label}</Chip>
            ))}
          </div>
        }
      >
        <DataTable<SwapRequest> columns={columns} rows={rows} rowKey={(row) => row.id} minWidth={880} empty={t("dpSwapEmpty")} />
      </SectionCard>
    </div>
  );
}

function ReportTab({ board, byShift, onAction, setMessage }: { board: Board; byShift: { signupMap: Map<string, ShiftSignup[]> }; onAction: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; setMessage: (m: { tone: "ok" | "warn" | "err"; text: string } | null) => void }) {
  const t = useT();
  const dialog = useDialog();
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

  /**
   * 模式二 T5 · 锁班 — manual lock/unlock from the reporting desk (no new menu:
   * the desk is exactly where ops freezes a roster before submitting it).
   * The 18:00 cron does the same thing automatically for the next day; this is
   * the "lock it now" / "I need to fix one name" escape hatch. Unlocking asks
   * for confirmation because it reopens a roster that may already be at 99.
   */
  async function toggleLock(shift: DispatchShift) {
    const unlock = Boolean(shift.lockedAt);
    if (unlock && !(await dialog.confirm(t("dpUnlockTitle"), { message: t("dpUnlockMsg"), tone: "danger", confirmText: t("dpUnlock") }))) return;
    const result = await runLock({ action: "lock", shiftId: shift.id, unlock });
    if (result) setMessage({ tone: "ok", text: unlock ? t("dpUnlockOk", { n: String(result.changed ?? 1) }) : t("dpLockOk", { n: String(result.changed ?? 1) }) });
  }

  /** Lock every still-open shift of one day in a single click (the manual
   *  equivalent of the evening sweep). */
  async function lockDay(date: string) {
    setBusyDay(date);
    const result = await runLock({ action: "lock", date });
    setBusyDay("");
    if (result) setMessage({ tone: "ok", text: t("dpLockOk", { n: String(result.changed ?? 0) }) });
  }

  /**
   * 模式二 H4 · 锁班前池校验的前端半边. The server refuses to freeze a PRO
   * roster that contains riders who have since left the pool, and returns the
   * names. We show them and let HQ either fix the roster (default) or lock
   * anyway — the forced lock is audited as Medium risk on the server.
   */
  async function runLock(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const result = await onAction(body);
    if (!result?.__failed) return result;
    const offenders = (result.offenders as string[] | undefined) ?? [];
    const forced = await dialog.confirm(t("dpPoolMismatchTitle", { n: offenders.length }), {
      message: `${offenders.map((line) => `· ${line}`).join("\n")}\n\n${t("dpPoolMismatchMsg")}`,
      tone: "danger",
      confirmText: t("dpPoolMismatchForce"),
    });
    if (!forced) return null;
    return onAction({ ...body, __force: true });
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
      render: (shift) => (
        <div className="flex flex-wrap items-center gap-1">
          {shift.reportedAt ? <StatusBadge tone="success" label={t("dpReportedAt", { x: shift.reportedAt })} /> : <StatusBadge tone="warn" label={t("dpNotReported")} />}
          {/* 模式二 T5: locked roster is the strongest signal on this row — a
              locked shift can no longer change under ops' feet. */}
          {shift.lockedAt && <StatusBadge tone="neutral" label={`🔒 ${t("dpLocked", { x: shift.lockedAt })}`} />}
        </div>
      ),
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
          <button type="button" onClick={() => void toggleLock(shift)} className="tag inline-flex items-center gap-1" title={shift.lockedBy ? t("dpLockedBy", { who: shift.lockedBy }) : t("dpLockHint")}>
            {shift.lockedAt ? <><Unlock size={13} /> {t("dpUnlock")}</> : <><Lock size={13} /> {t("dpLock")}</>}
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
        // 模式二 T5: how many shifts of this day are still unlocked — the whole
        // day is either "lockable" or already frozen.
        const dayUnlocked = shifts.filter((shift) => !shift.lockedAt && shift.status === "scheduling").length;
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
                {dayUnlocked > 0 && (
                  <button type="button" disabled={busyDay === date} onClick={() => void lockDay(date)} className="tag inline-flex items-center gap-1 disabled:opacity-50" title={t("dpLockHint")}>
                    <Lock size={13} /> {t("dpLockDay")} ×{dayUnlocked}
                  </button>
                )}
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
