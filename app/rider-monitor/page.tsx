"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search } from "lucide-react";
import { AppShell, DataTable, PageTitle } from "../components/ui";
import { readSession } from "../lib/session";

type LiveRider = {
  riderExtId: string | null;
  name: string | null;
  phone: string | null;
  status: string | null;
  statusCode: string | null;
  shift: string;
  hotZone: string | null;
  vehicle: string | null;
  onlineMins: number | null;
  restMins: number | null;
  finishedCnt: number | null;
  lat: number | null;
  lng: number | null;
  franchise: string;
  ponto: string;
  leader: string;
  assigned: boolean;
};

type Payload = {
  capturedAt: string | null;
  kpi: { ar: number | null; caa: number | null; acceptCnt: number | null; overtime: number | null; tsh: number | null; finishedCnt: number | null } | null;
  riders: LiveRider[];
  summary: {
    total: number;
    assigned: number;
    unassigned: number;
    statusCounts: Record<string, number>;
    byFranchise: Array<{ name: string; online: number; finished: number }>;
    byPonto: Array<{ name: string; online: number; finished: number }>;
  };
};

// Eastwind status → tone. Online/delivering = good, below-expectation = warn, out-of-area/offline = danger.
function statusTone(status: string | null): string {
  const s = (status || "").toLowerCase();
  if (/conectado|entregando|online|em rota/.test(s)) return "border-[var(--ok)] text-[var(--ok-ink)] bg-[var(--ok-bg)]";
  if (/abaixo|expectativ|不及预期|aguard|pausa|descanso/.test(s)) return "border-[var(--warning)] text-[var(--warning-ink)] bg-[var(--warning-bg)]";
  if (/fora|área|area|offline|不在|desconect/.test(s)) return "border-[var(--danger)] text-[var(--danger-ink)] bg-[var(--danger-bg)]";
  return "border-[var(--line)] text-[var(--muted-strong)] bg-[var(--surface-raised)]";
}

function StatBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="panel p-4 relative overflow-hidden">
      <div className="absolute left-0 top-0 h-full w-[3px] opacity-80" style={{ background: accent ? "var(--accent)" : "var(--line)" }} />
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--text)] font-[family-name:var(--font-outfit)]">{value}</div>
    </div>
  );
}

export default function RiderMonitorPage() {
  const session = useMemo(() => readSession(), []);
  const scopeFranchise = session?.portal === "franchise" ? session.franchise || session.organization : "";
  const scopeStation = session?.portal === "ponto" ? session.station || session.organization : "";
  const isHQ = !scopeFranchise && !scopeStation;

  const [data, setData] = useState<Payload | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");

  const headers = useMemo(
    () => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Super Admin" }),
    [session],
  );

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (scopeFranchise) params.set("franchise", scopeFranchise);
    if (scopeStation) params.set("ponto", scopeStation);
    const res = await fetch(`/api/eastwind/riders-live?${params}`, { headers, cache: "no-store" });
    if (res.ok) {
      setData((await res.json()).data);
      setUpdatedAt(new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" }));
    }
  }, [headers, scopeFranchise, scopeStation]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000); // auto-refresh every 60s
    return () => clearInterval(t);
  }, [load]);

  const riders = data?.riders ?? [];
  const statuses = useMemo(() => Object.keys(data?.summary.statusCounts ?? {}).sort(), [data]);

  const filtered = riders.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (onlyUnassigned && r.assigned) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!(`${r.name ?? ""} ${r.phone ?? ""} ${r.riderExtId ?? ""}`.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const batchLabel = data?.capturedAt
    ? new Date(data.capturedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "—";

  const scopeLabel = isHQ ? "全城（总部）" : scopeFranchise ? `加盟商：${scopeFranchise}` : `站点：${scopeStation}`;
  const kpi = data?.kpi;
  const pct = (v: number | null | undefined) => (v == null ? "—" : `${v}%`);

  return (
    <AppShell>
      <PageTitle
        title="实时骑手看板"
        eyebrow={`Eastwind 实时 · ${scopeLabel}`}
        action={
          <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
            <span>批次 {batchLabel}{updatedAt ? ` · 刷新 ${updatedAt}` : ""}</span>
            <button
              onClick={() => void load()}
              className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-[var(--line)] px-3 font-bold text-[var(--muted-strong)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <RefreshCcw size={15} /> 刷新
            </button>
          </div>
        }
      />

      {/* Status summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <StatBox label="在班骑手" value={String(data?.summary.total ?? 0)} accent />
        {isHQ ? <StatBox label="未归属" value={String(data?.summary.unassigned ?? 0)} /> : null}
        {statuses.slice(0, isHQ ? 4 : 5).map((s) => (
          <StatBox key={s} label={s} value={String(data?.summary.statusCounts[s] ?? 0)} />
        ))}
      </div>

      {/* City KPI bar */}
      {kpi ? (
        <div className="mt-3 grid grid-cols-3 gap-3 md:grid-cols-6">
          <StatBox label="AR" value={pct(kpi.ar)} />
          <StatBox label="CAA" value={pct(kpi.caa)} />
          <StatBox label="接单量" value={String(kpi.acceptCnt ?? "—")} />
          <StatBox label="Overtime" value={pct(kpi.overtime)} />
          <StatBox label="%TSH" value={pct(kpi.tsh)} />
          <StatBox label="完单数" value={String(kpi.finishedCnt ?? "—")} />
        </div>
      ) : null}

      {/* By franchise / by ponto (HQ only) */}
      {isHQ && data ? (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">按加盟商</div>
            <DataTable
              headers={["加盟商", "在班", "完单"]}
              rows={data.summary.byFranchise.map((f) => [f.name, String(f.online), String(f.finished)])}
            />
          </div>
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">按站点</div>
            <DataTable
              headers={["站点", "在班", "完单"]}
              rows={data.summary.byPonto.map((p) => [p.name, String(p.online), String(p.finished)])}
            />
          </div>
        </div>
      ) : null}

      {/* Filters */}
      <div className="mt-4 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索姓名/电话/ID"
            className="h-9 w-56 rounded-[6px] border border-[var(--line)] bg-[var(--surface-raised)] pl-8 pr-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-[6px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
        >
          <option value="">全部状态</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {isHQ ? (
          <label className="flex items-center gap-2 text-xs font-bold text-[var(--muted-strong)]">
            <input type="checkbox" checked={onlyUnassigned} onChange={(e) => setOnlyUnassigned(e.target.checked)} />
            只看未归属
          </label>
        ) : null}
        <span className="ml-auto text-xs text-[var(--muted)]">{filtered.length} 名骑手</span>
      </div>

      {/* Rider table */}
      <DataTable
        headers={["姓名", "电话", "状态", "排班", "热区", "车型", "在线(分)", "完单", "加盟商", "站点"]}
        rows={filtered.map((r) => [
          <span key="n" className="font-bold text-[var(--text)]">{r.name || "—"}</span>,
          r.phone || "—",
          <span key="s" className={`inline-flex rounded-[6px] border px-2 py-0.5 text-[11px] font-bold ${statusTone(r.status)}`}>{r.status || "—"}</span>,
          r.shift || "—",
          r.hotZone || "—",
          r.vehicle || "—",
          r.onlineMins ?? "—",
          r.finishedCnt ?? 0,
          r.franchise || <span key="u" className="text-[var(--danger-ink)] font-bold">未归属</span>,
          r.ponto || "—",
        ])}
      />
    </AppShell>
  );
}
