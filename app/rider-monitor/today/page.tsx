"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search } from "lucide-react";
import { AppShell, DataTable, PageTitle } from "../../components/ui";
import MonitorTabs from "../MonitorTabs";
import { readSession } from "../../lib/session";
import { useVentoStore } from "../../lib/store";
import { translate, type TranslationKey } from "../../lib/i18n";

/**
 * READ-ONLY daily accumulation view: every rider that appeared in today's
 * Eastwind snapshots with their day-cumulative counters. HQ sees the whole
 * city; franchise / station portals are scoped to their own riders (same
 * isolation as the live board). No actions here — viewing only.
 */

type Perf = {
  ar: number | null; caa: number | null; overtime: number | null; tsh: number | null;
  acceptCnt: number | null; declinedCnt: number | null; cancelledCnt: number | null;
  delayedCnt: number | null; joinTime: string | null;
};
type TodayRider = {
  key: string; riderExtId: string | null; name: string | null; phone: string | null;
  status: string | null; shift: string; hotZone: string | null; vehicle: string | null;
  onlineMins: number | null; restMins: number | null; finishedCnt: number | null;
  franchise: string; ponto: string; pool?: "standard" | "pro"; lastSeenAt: string; perf: Perf | null;
};
type Payload = {
  date: string; batches: number; latestBatch: string | null; riders: TodayRider[];
  summary: { riders: number; ridersPro?: number; finished: number; finishedPro?: number; onlineMins: number; accepted: number; declined: number; cancelled: number; delayed: number };
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string | null }) {
  return (
    <div className="panel p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--text)] font-[family-name:var(--font-outfit)]">{value}</div>
      {/* 模式二: 金色 PRO 小计 —— 与实时页 KPI 条、T+1 看板顶卡同一套语言。 */}
      {sub != null && <div className="mt-0.5 text-[10px] font-bold" style={{ color: "#b97900" }}>PRO {sub}</div>}
    </div>
  );
}

export default function RiderTodayPage() {
  const session = useMemo(() => readSession(), []);
  const language = useVentoStore((s) => s.language);
  const t = useCallback((k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  }, [language]);

  const scopeFranchise = session?.portal === "franchise" ? session.franchise || session.organization : "";
  const scopeStation = session?.portal === "ponto" ? session.station || session.organization : "";
  const isHQ = !scopeFranchise && !scopeStation;

  const [data, setData] = useState<Payload | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Super Admin" }), [session]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (scopeFranchise) params.set("franchise", scopeFranchise);
      if (scopeStation) params.set("ponto", scopeStation);
      const res = await fetch(`/api/eastwind/riders-today?${params}`, { headers, cache: "no-store" });
      if (res.ok) setData((await res.json()).data);
    } finally {
      setLoading(false);
    }
  }, [headers, scopeFranchise, scopeStation]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5 * 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const riders = data?.riders ?? [];
  const filtered = riders.filter((r) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return `${r.name ?? ""} ${r.phone ?? ""} ${r.riderExtId ?? ""}`.toLowerCase().includes(q);
  });

  const s = data?.summary;
  const hours = (mins: number | null | undefined) => (mins == null ? "—" : `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}`);
  const na = (v: number | string | null | undefined) => (v == null ? "—" : String(v));
  const pct = (v: number | null | undefined) => (v == null ? "—" : `${v}%`);
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const scopeLabel = isHQ ? t("rmScopeCity") : scopeFranchise ? `${t("rmScopeFranchise")}: ${scopeFranchise}` : `${t("rmScopePonto")}: ${scopeStation}`;

  return (
    <AppShell>
      <MonitorTabs />
      <PageTitle
        title={t("rtTitle")}
        eyebrow={`${data?.date ?? ""} · ${scopeLabel} · ${t("rtReadOnly")}`}
        action={
          <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
            <span>{data?.latestBatch ? `${t("rtLastBatch")} ${hhmm(data.latestBatch)}` : ""}</span>
            <button onClick={() => void load()} disabled={loading}
              className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-[var(--line)] px-3 font-bold text-[var(--muted-strong)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50">
              <RefreshCcw size={15} /> {t("rmRefresh")}
            </button>
          </div>
        }
      />

      {/* 七张卡齐全。计数口径(2026-08-07 定):
          · 计数器每班段清零 → 服务端按「班段内 MAX、跨班段相加」还原当日累计,
            不再依赖"班段末批恰好抓到卡片"(旧算法会把没抓到的班段整段算丢)
          · "接单"是平台的**派单邀约**口径 —— 系统直派的单没有"接"这个动作,
            所以接单 < 完单是正常现象,下面一行小字向看板用户说明,免得再被
            当成 bug 报上来 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <StatCard label={t("rtRidersToday")} value={s?.riders ?? 0} sub={s?.ridersPro ? String(s.ridersPro) : null} />
        <StatCard label={t("rmFinishedCnt")} value={s?.finished ?? 0} sub={s?.ridersPro ? String(s.finishedPro ?? 0) : null} />
        <StatCard label={t("rtOnlineTotal")} value={hours(s?.onlineMins)} />
        <StatCard label={t("rmAcceptCnt")} value={s?.accepted ?? 0} />
        <StatCard label={t("rmDeclinedCnt")} value={s?.declined ?? 0} />
        <StatCard label={t("rmCancelledCnt")} value={s?.cancelled ?? 0} />
        <StatCard label={t("rmDelayedCnt")} value={s?.delayed ?? 0} />
      </div>
      <div className="mt-2 text-[11px] font-bold text-[var(--muted)]">{t("rtAcceptNote")}</div>

      <div className="mb-3 mt-5 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("rmSearch")}
            className="h-9 w-60 rounded-[6px] border border-[var(--line)] bg-[var(--surface-raised)] pl-8 pr-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]" />
        </div>
        <span className="ml-auto text-xs text-[var(--muted)]">{filtered.length} {t("rmRidersUnit")}</span>
      </div>

      {data && riders.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-[var(--muted)]">{t("rtNoData")}</div>
      ) : (
        <DataTable
          headers={[t("rmColRider"), t("rmScopeFranchise"), t("rmScopePonto"), t("rmColShift"), t("rmFinishedCnt"), t("rmColOnlineMin"), t("rmAcceptCnt"), t("rmDeclinedCnt"), t("rmCancelledCnt"), t("rmDelayedCnt"), "AR", "%TSH", t("rtLastSeen")]}
          rows={filtered.map((r) => [
            <div key="n" className="flex flex-col">
              <span className="flex items-center gap-1.5 font-bold" style={r.pool === "pro" ? { color: "#b97900" } : undefined}>
                <span className="text-inherit">{r.name || "—"}</span>
                {r.pool === "pro" && <span className="shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-black" style={{ background: "#eda100", color: "#171b33" }}>PRO</span>}
              </span>
              <span className="text-[11px] text-[var(--muted)]">{r.phone || "—"}</span>
            </div>,
            r.franchise
              ? <span key="fr" className="inline-flex rounded-[6px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 py-0.5 text-[11px] font-bold text-[var(--muted-strong)]">{r.franchise}</span>
              : <span key="u" className="inline-flex rounded-[6px] border border-[var(--danger)] bg-[var(--danger-bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--danger-ink)]">{t("rmUnassigned")}</span>,
            r.ponto || "—",
            r.shift || "—",
            <span key="f" className="font-extrabold">{r.finishedCnt ?? 0}</span>,
            <span key="o">{r.onlineMins != null ? `${r.onlineMins} ${t("rmMins")}` : "—"}</span>,
            na(r.perf?.acceptCnt),
            na(r.perf?.declinedCnt),
            na(r.perf?.cancelledCnt),
            na(r.perf?.delayedCnt),
            pct(r.perf?.ar),
            pct(r.perf?.tsh),
            hhmm(r.lastSeenAt),
          ])}
          rowAccent={(index) => filtered[index]?.pool === "pro"}
        />
      )}
      <p className="mt-3 text-[11px] text-[var(--muted)]">{t("rtNote")}</p>
    </AppShell>
  );
}
