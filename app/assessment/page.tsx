"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, ClipboardCheck, MapPin, Pencil, RefreshCcw } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
import { readSession } from "../lib/session";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";
import type { AssessmentMetric, AssessmentRule } from "../lib/assessment";

/**
 * 考核规则 — HQ edits the quality thresholds / commission adjustments;
 * every portal sees the rule terms plus week-to-date actuals vs targets.
 */

type Cell = { actual: number | null; status: string; adjust: number };
type BoardRow = { name: string; sub: string; riders: number; orders: number; days: number; metrics: Record<string, Cell>; totalAdjust: number; commissionPct: number };
type Payload = { rule: AssessmentRule; week: { from: string; to: string }; scoped: boolean; franchises: BoardRow[]; stations: BoardRow[] };

const HEADERS = { "Content-Type": "application/json" };
const input = "h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--accent)]";
const md = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

const statusStyle: Record<string, string> = {
  meet: "text-[var(--ok-ink)]",
  fail: "text-[var(--danger-ink)]",
  mid: "text-[var(--warning-ink)]",
  na: "text-[var(--muted)]",
};
export default function AssessmentPage() {
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
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

  const load = useCallback(async () => {
    const response = await fetch(`/api/assessment?week=${anchor}`, { headers: HEADERS, cache: "no-store" });
    if (response.ok) setData((await response.json()).data);
  }, [anchor]);

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

  function MetricEditor({ metric, index }: { metric: AssessmentMetric; index: number }) {
    const update = (patch: Partial<AssessmentMetric>) => {
      if (!draft) return;
      const metrics = draft.metrics.map((item, i) => (i === index ? { ...item, ...patch } : item));
      setDraft({ ...draft, metrics });
    };
    return (
      <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
        <div className="mb-2 text-sm font-black">{metric.label}</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="mb-1 text-[10px] font-black uppercase text-[var(--ok-ink)]">{t("asMeetUp")}</div>
            <div className="flex items-center gap-1.5">
              <select className={`${input} w-16`} value={metric.meetOp} onChange={(e) => update({ meetOp: e.target.value as "<=" | ">=" })}><option>{">="}</option><option>{"<="}</option></select>
              <input className={input} inputMode="decimal" value={metric.meetThreshold} onChange={(e) => update({ meetThreshold: Number(e.target.value) || 0 })} />
              <span className="text-xs font-black text-[var(--ok-ink)]">+</span>
              <input className={input} inputMode="decimal" value={metric.meetAdjust} onChange={(e) => update({ meetAdjust: Number(e.target.value) || 0 })} />
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-black uppercase text-[var(--danger-ink)]">{t("asFailDown")}</div>
            <div className="flex items-center gap-1.5">
              <select className={`${input} w-16`} value={metric.failOp} onChange={(e) => update({ failOp: e.target.value as "<=" | ">=" })}><option>{"<="}</option><option>{">="}</option></select>
              <input className={input} inputMode="decimal" value={metric.failThreshold} onChange={(e) => update({ failThreshold: Number(e.target.value) || 0 })} />
              <span className="text-xs font-black text-[var(--danger-ink)]">−</span>
              <input className={input} inputMode="decimal" value={metric.failAdjust} onChange={(e) => update({ failAdjust: Number(e.target.value) || 0 })} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  function Board({ rows, label, icon: Icon }: { rows: BoardRow[]; label: string; icon: typeof Building2 }) {
    if (!rule) return null;
    return (
      <div className="panel overflow-x-auto p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Icon size={14} /> {label}{t("asBoardSuffix")}</div>
        {rows.length === 0 ? (
          <div className="py-4 text-sm font-bold text-[var(--muted)]">{t("asNoKpi")}</div>
        ) : (
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="text-left text-[10px] font-black uppercase text-[var(--muted)]">
                <th className="pb-2">{t("asColObject")}</th>
                <th className="pb-2 text-right">{t("asColRiders")}</th>
                <th className="pb-2 text-right">{t("asColOrders")}</th>
                <th className="pb-2 text-right">{t("asColDays")}</th>
                {rule.metrics.map((metric) => (
                  <th key={metric.key} className="pb-2 text-right">{metric.label}<div className="font-bold normal-case">{t("asTarget")} {metric.meetOp}{metric.meetThreshold}</div></th>
                ))}
                <th className="pb-2 text-right">{t("asColAdjust")}</th>
                <th className="pb-2 text-right">{t("asColCommission")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name + row.sub} className="border-t border-[var(--line)]">
                  <td className="py-2">
                    <div className="font-black">{row.name}</div>
                    {row.sub && <div className="text-[10px] font-bold text-[var(--muted)]">{row.sub}</div>}
                  </td>
                  <td className="py-2 text-right">{row.riders}</td>
                  <td className="py-2 text-right font-black">{row.orders}</td>
                  <td className="py-2 text-right">{row.days}</td>
                  {rule.metrics.map((metric) => {
                    const cell = row.metrics[metric.key];
                    return (
                      <td key={metric.key} className="py-2 text-right">
                        <div className={`font-black ${statusStyle[cell?.status ?? "na"]}`}>{cell?.actual ?? "—"}{cell?.actual !== null && metric.key !== "caa" ? "%" : ""}</div>
                        <div className={`text-[10px] font-bold ${statusStyle[cell?.status ?? "na"]}`}>
                          {statusLabel[cell?.status ?? "na"]}{cell && cell.adjust !== 0 ? `（${cell.adjust > 0 ? "+" : ""}${cell.adjust}）` : ""}
                        </div>
                      </td>
                    );
                  })}
                  <td className={`py-2 text-right font-black ${row.totalAdjust > 0 ? "text-[var(--ok-ink)]" : row.totalAdjust < 0 ? "text-[var(--danger-ink)]" : ""}`}>
                    {row.totalAdjust > 0 ? "+" : ""}{row.totalAdjust}%
                  </td>
                  <td className="py-2 text-right text-base font-black text-[var(--accent)]">{row.commissionPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

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
                  setEditing((v) => !v);
                }}
              >
                <Pencil size={13} /> {editing ? t("asCancelEdit") : t("asEditRule")}
              </button>
            )}
            <button type="button" className="tag inline-flex items-center gap-1" onClick={() => void load()}><RefreshCcw size={13} /> {t("asRefresh")}</button>
          </div>
        }
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      {/* Rule terms */}
      {rule && !editing && (
        <div className="panel mb-4 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><ClipboardCheck size={14} /> {t("asRuleEffective", { d: rule.effectiveDate })}{rule.updatedAt ? t("asRuleUpdated", { u: rule.updatedAt }) : ""}</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[[t("asCity"), rule.city], [t("asPeriod"), t("asWeeksN", { n: rule.periodWeeks })], [t("asMinCommission"), `${rule.minCommissionPct}%`], [t("asExclusive"), rule.exclusive ? "Yes" : "No"], [t("asNote"), rule.note || "—"]].map(([label, value]) => (
              <div key={label} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                <div className="text-[10px] font-black uppercase text-[var(--muted)]">{label}</div>
                <div className="mt-1 text-sm font-black">{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {rule.metrics.map((metric) => (
              <div key={metric.key} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                <div className="text-sm font-black">{metric.label}</div>
                <div className="mt-1 text-[11px] font-bold">
                  <span className="text-[var(--ok-ink)]">{t("asMeetLine", { op: metric.meetOp, th: metric.meetThreshold, adj: metric.meetAdjust })}</span>
                  <span className="mx-2 text-[var(--muted)]">｜</span>
                  <span className="text-[var(--danger-ink)]">{t("asFailLine", { op: metric.failOp, th: metric.failThreshold, adj: metric.failAdjust })}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HQ rule editor */}
      {editing && draft && (
        <div className="panel mb-4 space-y-3 p-4">
          <div className="text-xs font-black uppercase text-[var(--accent)]">{t("asEditTitle")}</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <label className="block"><span className="mb-1 block text-[10px] font-black uppercase text-[var(--muted)]">{t("asCity")}</span><input className={input} value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} /></label>
            <label className="block"><span className="mb-1 block text-[10px] font-black uppercase text-[var(--muted)]">{t("asPeriodWeeks")}</span><input className={input} inputMode="numeric" value={draft.periodWeeks} onChange={(e) => setDraft({ ...draft, periodWeeks: Number(e.target.value) || 1 })} /></label>
            <label className="block"><span className="mb-1 block text-[10px] font-black uppercase text-[var(--muted)]">{t("asMinCommissionPct")}</span><input className={input} inputMode="decimal" value={draft.minCommissionPct} onChange={(e) => setDraft({ ...draft, minCommissionPct: Number(e.target.value) || 0 })} /></label>
            <label className="block"><span className="mb-1 block text-[10px] font-black uppercase text-[var(--muted)]">{t("asEffectiveDate")}</span><input type="date" className={input} value={draft.effectiveDate} onChange={(e) => setDraft({ ...draft, effectiveDate: e.target.value })} /></label>
            <label className="block"><span className="mb-1 block text-[10px] font-black uppercase text-[var(--muted)]">{t("asExclusiveSign")}</span>
              <select className={input} value={draft.exclusive ? "yes" : "no"} onChange={(e) => setDraft({ ...draft, exclusive: e.target.value === "yes" })}><option value="no">No</option><option value="yes">Yes</option></select>
            </label>
          </div>
          <label className="block"><span className="mb-1 block text-[10px] font-black uppercase text-[var(--muted)]">{t("asNote")}</span><input className={input} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></label>
          <div className="grid gap-2 lg:grid-cols-2">
            {draft.metrics.map((metric, index) => <MetricEditor key={metric.key} metric={metric} index={index} />)}
          </div>
          <button type="button" onClick={() => void save()} className="inline-flex h-11 items-center rounded-[8px] bg-[var(--accent)] px-6 text-sm font-black uppercase text-[var(--accent-ink)]">{t("asSaveRule")}</button>
        </div>
      )}

      {/* Week selector */}
      <div className="panel mb-4 flex flex-wrap items-center gap-3 p-3" data-i18n-skip>
        <button type="button" className="tag" onClick={() => shiftWeek(-7)}>{t("asPrevWeek")}</button>
        <div className="text-sm font-black">{data ? `${md(data.week.from)} – ${md(data.week.to)}` : "—"}<span className="ml-2 text-[11px] font-bold text-[var(--muted)]">{t("asDailyAuto")}</span></div>
        <button type="button" className="tag" onClick={() => shiftWeek(7)}>{t("asNextWeek")}</button>
      </div>

      <div className="space-y-4">
        <Board rows={data?.franchises ?? []} label={data?.scoped ? t("asThisFranchise") : t("asByFranchise")} icon={Building2} />
        <Board rows={data?.stations ?? []} label={t("asByStation")} icon={MapPin} />
      </div>
    </AppShell>
  );
}
