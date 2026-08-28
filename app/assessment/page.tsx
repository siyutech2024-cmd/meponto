"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, ClipboardCheck, MapPin, Pencil, RefreshCcw } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
import { Chip, DataTable, Drawer, SectionCard, Stat, Toolbar, type DataColumn, type SortState } from "../components/kit";
import { readSession } from "../lib/session";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";
import type { AssessmentMetric, AssessmentRule } from "../lib/assessment";
import { isoWeekOf, type LeaderAssessment } from "../lib/leader-mode";

/**
 * 考核规则 — HQ edits the quality thresholds / commission adjustments;
 * every portal sees the rule terms plus week-to-date actuals vs targets.
 */

type Cell = { actual: number | null; status: string; adjust: number };
type BoardRow = { name: string; sub: string; riders: number; orders: number; days: number; metrics: Record<string, Cell>; totalAdjust: number; commissionPct: number };
type Payload = { rule: AssessmentRule; week: { from: string; to: string }; scoped: boolean; franchises: BoardRow[]; stations: BoardRow[] };
type T = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => string;

const HEADERS = { "Content-Type": "application/json" };
const input = "h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--accent)]";
const md = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

const statusStyle: Record<string, string> = {
  meet: "text-[var(--ok-ink)]",
  fail: "text-[var(--danger-ink)]",
  mid: "text-[var(--warning-ink)]",
  na: "text-[var(--muted)]",
};

/** Generic client-side sort keyed by a flat row field (numbers first, strings as fallback). */
function sortRows<T2>(rows: T2[], sort: SortState): T2[] {
  if (!sort) return rows;
  const { key, dir } = sort;
  const val = (row: T2) => (row as unknown as Record<string, unknown>)[key];
  return [...rows].sort((a, b) => {
    const av = val(a);
    const bv = val(b);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    const an = av === null || av === undefined ? Number.NEGATIVE_INFINITY : Number(av);
    const bn = bv === null || bv === undefined ? Number.NEGATIVE_INFINITY : Number(bv);
    if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * dir;
    return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
  });
}

/** One metric's meet/fail thresholds inside the rule editor drawer. */
function MetricEditor({ metric, onChange, t }: { metric: AssessmentMetric; onChange: (patch: Partial<AssessmentMetric>) => void; t: T }) {
  return (
    <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
      <div className="mb-2 text-sm font-black">{metric.label}</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 text-[10px] font-black uppercase text-[var(--ok-ink)]">{t("asMeetUp")}</div>
          <div className="flex items-center gap-1.5">
            <select className={`${input} w-16`} value={metric.meetOp} onChange={(e) => onChange({ meetOp: e.target.value as "<=" | ">=" })}><option>{">="}</option><option>{"<="}</option></select>
            <input className={input} inputMode="decimal" value={metric.meetThreshold} onChange={(e) => onChange({ meetThreshold: Number(e.target.value) || 0 })} />
            <span className="text-xs font-black text-[var(--ok-ink)]">+</span>
            <input className={input} inputMode="decimal" value={metric.meetAdjust} onChange={(e) => onChange({ meetAdjust: Number(e.target.value) || 0 })} />
          </div>
        </div>
        <div>
          <div className="mb-1 text-[10px] font-black uppercase text-[var(--danger-ink)]">{t("asFailDown")}</div>
          <div className="flex items-center gap-1.5">
            <select className={`${input} w-16`} value={metric.failOp} onChange={(e) => onChange({ failOp: e.target.value as "<=" | ">=" })}><option>{"<="}</option><option>{">="}</option></select>
            <input className={input} inputMode="decimal" value={metric.failThreshold} onChange={(e) => onChange({ failThreshold: Number(e.target.value) || 0 })} />
            <span className="text-xs font-black text-[var(--danger-ink)]">−</span>
            <input className={input} inputMode="decimal" value={metric.failAdjust} onChange={(e) => onChange({ failAdjust: Number(e.target.value) || 0 })} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Week-to-date actuals vs targets, one board per grouping dimension. */
function Board({ rows, label, icon: Icon, rule, t, statusLabel }: { rows: BoardRow[]; label: string; icon: typeof Building2; rule: AssessmentRule; t: T; statusLabel: Record<string, string> }) {
  const [sort, setSort] = useState<SortState>(null);
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const onSort = (key: string) => setSort((prev) => (prev?.key === key ? (prev.dir === -1 ? { key, dir: 1 } : null) : { key, dir: -1 }));

  const columns: Array<DataColumn<BoardRow>> = [
    {
      key: "name",
      label: t("asColObject"),
      sortKey: "name",
      render: (row) => (
        <div>
          <div className="font-black">{row.name}</div>
          {row.sub && <div className="text-[10px] font-bold text-[var(--muted)]">{row.sub}</div>}
        </div>
      ),
    },
    { key: "riders", label: t("asColRiders"), sortKey: "riders", align: "right", render: (row) => row.riders },
    { key: "orders", label: t("asColOrders"), sortKey: "orders", align: "right", render: (row) => <span className="font-black">{row.orders}</span> },
    { key: "days", label: t("asColDays"), sortKey: "days", align: "right", render: (row) => row.days },
    ...rule.metrics.map((metric): DataColumn<BoardRow> => ({
      key: metric.key,
      label: (
        <span>
          {metric.label}
          <span className="block font-bold normal-case">{t("asTarget")} {metric.meetOp}{metric.meetThreshold}</span>
        </span>
      ),
      align: "right",
      render: (row) => {
        const cell = row.metrics[metric.key];
        return (
          <div>
            <div className={`font-black ${statusStyle[cell?.status ?? "na"]}`}>{cell?.actual ?? "—"}{cell?.actual !== null && metric.key !== "caa" ? "%" : ""}</div>
            <div className={`text-[10px] font-bold ${statusStyle[cell?.status ?? "na"]}`}>
              {statusLabel[cell?.status ?? "na"]}{cell && cell.adjust !== 0 ? `（${cell.adjust > 0 ? "+" : ""}${cell.adjust}）` : ""}
            </div>
          </div>
        );
      },
    })),
    {
      key: "totalAdjust",
      label: t("asColAdjust"),
      sortKey: "totalAdjust",
      align: "right",
      render: (row) => (
        <span className={`font-black ${row.totalAdjust > 0 ? "text-[var(--ok-ink)]" : row.totalAdjust < 0 ? "text-[var(--danger-ink)]" : ""}`}>
          {row.totalAdjust > 0 ? "+" : ""}{row.totalAdjust}%
        </span>
      ),
    },
    { key: "commissionPct", label: t("asColCommission"), sortKey: "commissionPct", align: "right", render: (row) => <span className="text-base font-black text-[var(--accent)]">{row.commissionPct}%</span> },
  ];

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Icon size={14} /> {label}{t("asBoardSuffix")}</div>
      <DataTable<BoardRow>
        columns={columns}
        rows={sorted}
        rowKey={(row) => row.name + row.sub}
        sort={sort}
        onSort={onSort}
        minWidth={980}
        empty={t("asNoKpi")}
      />
    </div>
  );
}

// ---- Leader Mode weekly assessment (docs/leader-mode-design.md §7 UI) ------
// Self-hiding: the API only returns leaderMode franchises, so São Paulo
// portals render nothing here. Scope (franchise/station) is enforced
// server-side via the session cookie.

type LmPayload = {
  week: string;
  today: string;
  franchises: Array<{ franchise: string; assessments: LeaderAssessment[]; untaggedRider99Ids: string[] }>;
};

function LeaderModeSection({ t, canManage }: { t: T; canManage: boolean }) {
  const [payload, setPayload] = useState<LmPayload | null>(null);
  const [weekSel, setWeekSel] = useState<"this" | "last">("this");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const weekParam = useMemo(() => {
    const d = new Date();
    if (weekSel === "last") d.setDate(d.getDate() - 7);
    return isoWeekOf(d.toISOString().slice(0, 10));
  }, [weekSel]);

  const load = useCallback(async () => {
    const response = await fetch(`/api/leaders/assessment?week=${weekParam}`, { headers: HEADERS, cache: "no-store" });
    if (response.ok) setPayload((await response.json()).data as LmPayload);
  }, [weekParam]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!payload || payload.franchises.length === 0) return null;

  const gapText = (gap: LeaderAssessment["gaps"][number]) =>
    gap.hintKey === "recruit_more"
      ? t("lmGapRecruit", { n: gap.deficit })
      : gap.hintKey === "raise_volume"
        ? t("lmGapVolume", { n: gap.deficit })
        : t("lmGapSelfShare", { n: gap.deficit });

  async function act(kind: "close" | "settle", franchise: string) {
    setBusy(true);
    setMsg(null);
    const [path, body] =
      kind === "close"
        ? (["/api/leaders/assessment", { action: "closeWeek", week: weekParam, franchise }] as const)
        : (["/api/wallet", { action: "generateLeaderSettlements", week: weekParam, franchise }] as const);
    const response = await fetch(path, { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setMsg({ tone: "err", text: String(data.error ?? response.status) });
      return;
    }
    setMsg({ tone: "ok", text: t("lmActionDone") });
    void load();
  }

  const pct = (a: LeaderAssessment) =>
    a.metrics.leaderSelfOrdersPct === null ? "—" : `${a.metrics.leaderSelfOrdersPct}%`;

  return (
    <SectionCard
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          <ClipboardCheck size={14} /> {t("lmTitle")}
          <Chip active={weekSel === "this"} onClick={() => setWeekSel("this")}>{t("lmThisWeek")}</Chip>
          <Chip active={weekSel === "last"} onClick={() => setWeekSel("last")}>{t("lmLastWeek")}</Chip>
          <span className="text-[11px] font-bold text-[var(--muted)]">{payload.week}</span>
        </span>
      }
      className="mb-4"
    >
      {msg && (
        <div className={`mb-3 rounded-[8px] border px-3 py-2 text-sm font-bold ${msg.tone === "ok" ? "border-[var(--ok-ink)]/40 text-[var(--ok-ink)]" : "border-[var(--danger-ink)]/40 text-[var(--danger-ink)]"}`}>
          {msg.text}
        </div>
      )}
      {payload.franchises.map((group) => (
        <div key={group.franchise} className="mb-4 last:mb-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-black">{group.franchise}</span>
            {canManage && weekSel === "last" && (
              <>
                <button type="button" disabled={busy} className="tag" onClick={() => void act("close", group.franchise)}>
                  {t("lmCloseWeek")}
                </button>
                <button type="button" disabled={busy} className="tag" onClick={() => void act("settle", group.franchise)}>
                  {t("lmGenSettle")}
                </button>
              </>
            )}
          </div>
          {group.untaggedRider99Ids.length > 0 && (
            <div className="mb-2 text-[12px] font-bold text-[var(--warning-ink)]">
              {t("lmUntagged", { n: group.untaggedRider99Ids.length })}
            </div>
          )}
          {group.assessments.length === 0 ? (
            <div className="text-sm font-bold text-[var(--muted)]">{t("lmNoStations")}</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.assessments.map((a) => (
                <div key={a.id} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-black">{a.stationName}</span>
                    {a.trial && <span className="tag text-[10px]">{t("lmTrial")}</span>}
                    <span className={`text-[11px] font-black ${a.passed ? "text-[var(--ok-ink)]" : "text-[var(--danger-ink)]"}`}>
                      {a.passed ? t("lmPassed") : t("lmNotPassed")}
                    </span>
                    <span className="text-[10px] font-bold text-[var(--muted)]">
                      {a.state === "closed" ? t("lmClosedState") : a.state === "settled" ? t("lmSettledState") : t("lmLiveState")}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] font-bold">
                    <span className="text-[var(--muted)]">{t("lmActiveRiders")}</span>
                    <span className={a.metrics.activeRiders < a.targetsSnapshot.minActiveRiders ? "text-[var(--danger-ink)]" : ""}>
                      {a.metrics.activeRiders} / {a.targetsSnapshot.minActiveRiders}
                    </span>
                    <span className="text-[var(--muted)]">{t("lmWeeklyOrders")}</span>
                    <span className={a.metrics.totalOrders < a.targetsSnapshot.minWeeklyOrders ? "text-[var(--danger-ink)]" : ""}>
                      {a.metrics.totalOrders} / {a.targetsSnapshot.minWeeklyOrders}
                    </span>
                    <span className="text-[var(--muted)]">{t("lmAvgPerActive")}</span>
                    <span>{a.metrics.avgOrdersPerActive}</span>
                    <span className="text-[var(--muted)]">{t("lmDataDays")}</span>
                    <span>{a.metrics.dataDays} / {a.metrics.expectedDataDays}</span>
                    <span className="text-[var(--muted)]">{t("lmSelfShare")}</span>
                    <span>{pct(a)}</span>
                  </div>
                  {a.gaps.length > 0 && (
                    <ul className="mt-2 space-y-1 text-[11px] font-bold text-[var(--warning-ink)]">
                      {a.gaps.map((gap) => (
                        <li key={gap.metric}>· {gapText(gap)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </SectionCard>
  );
}

export default function AssessmentPage() {
  const language = useVentoStore((s) => s.language);
  const t: T = (k, vars) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
  const statusLabel: Record<string, string> = { meet: t("asStMeet"), fail: t("asStFail"), mid: t("asStMid"), na: t("asStNa") };
  const session = useMemo(() => readSession(), []);
  const isHq = session?.portal === "pontosys" || !session?.portal;

  const [data, setData] = useState<Payload | null>(null);
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AssessmentRule | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  /**
   * 模式二 R10 · 周考核分池. Same page, same rule, same tables — one chip that
   * narrows the weekly numbers to a single pool. Mixing PRO full-timers with
   * standard riders skews the weekly averages for both sides, so ops needs to
   * be able to look at them apart. Default "" keeps today's behaviour exactly.
   */
  const [pool, setPool] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/assessment?week=${anchor}${pool ? `&pool=${pool}` : ""}`, { headers: HEADERS, cache: "no-store" });
    if (response.ok) setData((await response.json()).data);
  }, [anchor, pool]);

  useEffect(() => {
    void load();
  }, [load]);

  const shiftWeek = (delta: number) => {
    const d = new Date(`${anchor}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    setAnchor(d.toISOString().slice(0, 10));
  };

  async function save() {
    if (!draft) return;
    const response = await fetch("/api/assessment", { method: "POST", headers: HEADERS, body: JSON.stringify({ action: "saveRule", ...draft }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? t("asSaveFailed", { s: response.status }) });
      return;
    }
    setMessage({ tone: "ok", text: t("asSaved") });
    setEditing(false);
    void load();
  }

  const rule = data?.rule;

  const messageBanner = message && (
    <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
      {message.text}
    </div>
  );

  const ruleColumns: Array<DataColumn<AssessmentMetric>> = [
    { key: "label", label: t("asColObject"), render: (metric) => <span className="font-black">{metric.label}</span> },
    { key: "meet", label: t("asMeetUp"), render: (metric) => <span className="font-black text-[var(--ok-ink)]">{t("asMeetLine", { op: metric.meetOp, th: metric.meetThreshold, adj: metric.meetAdjust })}</span> },
    { key: "fail", label: t("asFailDown"), render: (metric) => <span className="font-black text-[var(--danger-ink)]">{t("asFailLine", { op: metric.failOp, th: metric.failThreshold, adj: metric.failAdjust })}</span> },
  ];

  return (
    <AppShell>
      <PageTitle
        title={t("asTitle")}
        eyebrow={data?.scoped ? t("asEyebrowScoped") : t("asEyebrowHq")}
        action={
          <div className="flex gap-2">
            {isHq && !data?.scoped && rule && (
              <button
                type="button"
                className="tag inline-flex items-center gap-1"
                onClick={() => {
                  setDraft(JSON.parse(JSON.stringify(rule)) as AssessmentRule);
                  setMessage(null);
                  setEditing(true);
                }}
              >
                <Pencil size={13} /> {t("asEditRule")}
              </button>
            )}
            <button type="button" className="tag inline-flex items-center gap-1" onClick={() => void load()}><RefreshCcw size={13} /> {t("asRefresh")}</button>
          </div>
        }
      />

      {messageBanner}

      <LeaderModeSection t={t} canManage={isHq || session?.portal === "franchise"} />

      {/* Stat row — headline rule terms */}
      {rule && (
        <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label={t("asCity")} value={rule.city} />
          <Stat label={t("asPeriod")} value={t("asWeeksN", { n: rule.periodWeeks })} />
          <Stat label={t("asMinCommission")} value={`${rule.minCommissionPct}%`} />
          <Stat label={t("asExclusive")} value={rule.exclusive ? "Yes" : "No"} />
          <Stat label={t("asEffectiveDate")} value={rule.effectiveDate} hint={rule.updatedAt ? t("asRuleUpdated", { u: rule.updatedAt }) : undefined} />
        </section>
      )}

      {/* Rule terms as a table */}
      {rule && (
        <SectionCard
          title={<span className="inline-flex items-center gap-2"><ClipboardCheck size={14} /> {t("asRuleEffective", { d: rule.effectiveDate })}{rule.updatedAt ? t("asRuleUpdated", { u: rule.updatedAt }) : ""}</span>}
          desc={rule.note ? `${t("asNote")}: ${rule.note}` : undefined}
          className="mb-4"
        >
          <DataTable<AssessmentMetric>
            columns={ruleColumns}
            rows={rule.metrics}
            rowKey={(metric) => metric.key}
            minWidth={640}
            empty={t("asNoKpi")}
          />
        </SectionCard>
      )}

      {/* Toolbar — week navigation */}
      <div className="mb-4" data-i18n-skip>
        <Toolbar>
          <Chip onClick={() => shiftWeek(-7)}>{t("asPrevWeek")}</Chip>
          <div className="text-sm font-black">{data ? `${md(data.week.from)} – ${md(data.week.to)}` : "—"}</div>
          <Chip onClick={() => shiftWeek(7)}>{t("asNextWeek")}</Chip>
          {/* 模式二 R10: 分池考核 chip —— 不新增菜单,就在周切换旁边 */}
          {(["", "pro", "standard"] as const).map((value) => (
            <Chip key={value || "all"} active={pool === value} onClick={() => setPool(value)}>
              {value === "" ? t("fmChipAll") : value === "pro" ? "PRO" : t("rdPoolStandard")}
            </Chip>
          ))}
          <span className="text-[11px] font-bold text-[var(--muted)]">{t("asDailyAuto")}</span>
        </Toolbar>
      </div>

      <div className="space-y-4">
        {rule && <Board rows={data?.franchises ?? []} label={data?.scoped ? t("asThisFranchise") : t("asByFranchise")} icon={Building2} rule={rule} t={t} statusLabel={statusLabel} />}
        {rule && <Board rows={data?.stations ?? []} label={t("asByStation")} icon={MapPin} rule={rule} t={t} statusLabel={statusLabel} />}
      </div>

      {/* HQ rule editor drawer */}
      <Drawer
        open={editing && !!draft}
        onClose={() => setEditing(false)}
        width={560}
        ariaLabel={t("asEditTitle")}
        title={<div className="text-sm font-black uppercase">{t("asEditTitle")}</div>}
      >
        {draft && (
          <div className="space-y-3">
            {editing && messageBanner}
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block"><span className="mb-1 block text-[10px] font-black uppercase text-[var(--muted)]">{t("asCity")}</span><input className={input} value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} /></label>
              <label className="block"><span className="mb-1 block text-[10px] font-black uppercase text-[var(--muted)]">{t("asPeriodWeeks")}</span><input className={input} inputMode="numeric" value={draft.periodWeeks} onChange={(e) => setDraft({ ...draft, periodWeeks: Number(e.target.value) || 1 })} /></label>
              <label className="block"><span className="mb-1 block text-[10px] font-black uppercase text-[var(--muted)]">{t("asMinCommissionPct")}</span><input className={input} inputMode="decimal" value={draft.minCommissionPct} onChange={(e) => setDraft({ ...draft, minCommissionPct: Number(e.target.value) || 0 })} /></label>
              <label className="block"><span className="mb-1 block text-[10px] font-black uppercase text-[var(--muted)]">{t("asEffectiveDate")}</span><input type="date" className={input} value={draft.effectiveDate} onChange={(e) => setDraft({ ...draft, effectiveDate: e.target.value })} /></label>
              <label className="block"><span className="mb-1 block text-[10px] font-black uppercase text-[var(--muted)]">{t("asExclusiveSign")}</span>
                <select className={input} value={draft.exclusive ? "yes" : "no"} onChange={(e) => setDraft({ ...draft, exclusive: e.target.value === "yes" })}><option value="no">No</option><option value="yes">Yes</option></select>
              </label>
            </div>
            <label className="block"><span className="mb-1 block text-[10px] font-black uppercase text-[var(--muted)]">{t("asNote")}</span><input className={input} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></label>
            <div className="grid gap-2">
              {draft.metrics.map((metric, index) => (
                <MetricEditor
                  key={metric.key}
                  metric={metric}
                  t={t}
                  onChange={(patch) => {
                    setDraft((current) => (current ? { ...current, metrics: current.metrics.map((item, i) => (i === index ? { ...item, ...patch } : item)) } : current));
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-[var(--line)] pt-3">
              <button type="button" onClick={() => void save()} className="inline-flex h-11 items-center rounded-[8px] bg-[var(--accent)] px-6 text-sm font-black uppercase text-[var(--accent-ink)]">{t("asSaveRule")}</button>
              <button type="button" className="tag" onClick={() => setEditing(false)}>{t("asCancelEdit")}</button>
            </div>
          </div>
        )}
      </Drawer>
    </AppShell>
  );
}
