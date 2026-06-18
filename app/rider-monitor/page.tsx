"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search, Bike } from "lucide-react";
import { AppShell, DataTable, PageTitle } from "../components/ui";
import { readSession } from "../lib/session";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";

type Cat = "delivering" | "online" | "below" | "outArea" | "other";
type LiveRider = {
  riderExtId: string | null; name: string | null; phone: string | null;
  status: string | null; statusLabel: string; cat: Cat; shift: string;
  hotZone: string | null; vehicle: string | null; onlineMins: number | null;
  restMins: number | null; finishedCnt: number | null; lat: number | null; lng: number | null;
  franchise: string; ponto: string; leader: string; assigned: boolean;
};
type Cats = { delivering: number; online: number; below: number; outArea: number; other: number };
type AggRow = { name: string; total: number; finished: number } & Cats;
type Payload = {
  capturedAt: string | null;
  kpi: { ar: number | null; caa: number | null; acceptCnt: number | null; overtime: number | null; tsh: number | null; finishedCnt: number | null } | null;
  riders: LiveRider[];
  summary: { total: number; assigned: number; unassigned: number; finishedTotal: number; cats: Cats; byFranchise: AggRow[]; byPonto: AggRow[] };
};

const CAT_COLOR: Record<Cat, string> = { delivering: "#16a34a", online: "#2563eb", below: "#d97706", outArea: "#dc2626", other: "#6b7280" };
const CAT_KEY: Record<Cat, TranslationKey> = { delivering: "rmDelivering", online: "rmOnline", below: "rmBelow", outArea: "rmOutArea", other: "rmColStatus" };

function StatCard({ label, value, color, big }: { label: string; value: number | string; color: string; big?: boolean }) {
  return (
    <div className="panel relative overflow-hidden p-4">
      <span className="absolute left-0 top-0 h-full w-[3px]" style={{ background: color }} />
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</span>
      </div>
      <div className={`mt-2 font-extrabold tracking-tight text-[var(--text)] font-[family-name:var(--font-outfit)] ${big ? "text-3xl" : "text-2xl"}`}>{value}</div>
    </div>
  );
}

function KpiPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-lg font-extrabold text-[var(--text)] font-[family-name:var(--font-outfit)]">{value}</div>
    </div>
  );
}

export default function RiderMonitorPage() {
  const session = useMemo(() => readSession(), []);
  const language = useVentoStore((s) => s.language);
  const t = useCallback((k: TranslationKey) => translate(language, k), [language]);
  const catLabel = useCallback((r: { cat: Cat; statusLabel: string }) => (r.cat === "other" ? r.statusLabel : t(CAT_KEY[r.cat])), [t]);

  const scopeFranchise = session?.portal === "franchise" ? session.franchise || session.organization : "";
  const scopeStation = session?.portal === "ponto" ? session.station || session.organization : "";
  const isHQ = !scopeFranchise && !scopeStation;

  const [data, setData] = useState<Payload | null>(null);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState<Cat | "">("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");

  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Super Admin" }), [session]);

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
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const riders = data?.riders ?? [];
  const cats = data?.summary.cats;

  const filtered = riders.filter((r) => {
    if (catFilter && r.cat !== catFilter) return false;
    if (onlyUnassigned && r.assigned) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!`${r.name ?? ""} ${r.phone ?? ""} ${r.riderExtId ?? ""}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const batchLabel = data?.capturedAt ? new Date(data.capturedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
  const scopeLabel = isHQ ? t("rmScopeCity") : scopeFranchise ? `${t("rmScopeFranchise")}: ${scopeFranchise}` : `${t("rmScopePonto")}: ${scopeStation}`;
  const kpi = data?.kpi;
  const pct = (v: number | null | undefined) => (v == null ? "—" : `${v}%`);

  const catChips: Array<[Cat | "", string]> = [
    ["", t("rmAllStatus")], ["delivering", t("rmDelivering")], ["online", t("rmOnline")], ["below", t("rmBelow")], ["outArea", t("rmOutArea")],
  ];

  return (
    <AppShell>
      <PageTitle
        title={t("rmTitle")}
        eyebrow={`Eastwind · ${scopeLabel}`}
        action={
          <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
            <span>{t("rmBatch")} {batchLabel}{updatedAt ? ` · ${t("rmRefreshedAt")} ${updatedAt}` : ""} · {t("rmEvery5")}</span>
            <button onClick={() => void load()} className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-[var(--line)] px-3 font-bold text-[var(--muted-strong)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
              <RefreshCcw size={15} /> {t("rmRefresh")}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label={t("rmOnShift")} value={data?.summary.total ?? 0} color="var(--accent)" big />
        <StatCard label={t("rmDelivering")} value={cats?.delivering ?? 0} color={CAT_COLOR.delivering} />
        <StatCard label={t("rmOnline")} value={cats?.online ?? 0} color={CAT_COLOR.online} />
        <StatCard label={t("rmBelow")} value={cats?.below ?? 0} color={CAT_COLOR.below} />
        <StatCard label={t("rmOutArea")} value={cats?.outArea ?? 0} color={CAT_COLOR.outArea} />
        {isHQ
          ? <StatCard label={t("rmUnassigned")} value={data?.summary.unassigned ?? 0} color="#dc2626" />
          : <StatCard label={t("rmFinishedTotal")} value={data?.summary.finishedTotal ?? 0} color={CAT_COLOR.delivering} />}
      </div>

      {kpi ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <KpiPill label="AR" value={pct(kpi.ar)} />
          <KpiPill label="CAA" value={pct(kpi.caa)} />
          <KpiPill label={t("rmAcceptCnt")} value={String(kpi.acceptCnt ?? "—")} />
          <KpiPill label="Overtime" value={pct(kpi.overtime)} />
          <KpiPill label="%TSH" value={pct(kpi.tsh)} />
          <KpiPill label={t("rmFinishedCnt")} value={String(kpi.finishedCnt ?? "—")} />
          <span className="ml-auto self-center text-[10px] text-[var(--muted)]">{t("rmKpiCityNote")}</span>
        </div>
      ) : null}

      {isHQ && data ? (
        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">{t("rmByFranchise")}</div>
            <DataTable
              headers={[t("rmScopeFranchise"), t("rmOnShift"), t("rmDelivering"), t("rmOnline"), t("rmBelow"), t("rmColFinished")]}
              rows={data.summary.byFranchise.map((f) => [
                <span key="n" className={`font-bold ${f.name === "未归属" ? "text-[var(--danger-ink)]" : "text-[var(--text)]"}`}>{f.name === "未归属" ? t("rmUnassigned") : f.name}</span>,
                <span key="t" className="font-extrabold">{f.total}</span>,
                <span key="d" style={{ color: CAT_COLOR.delivering }}>{f.delivering}</span>,
                <span key="o" style={{ color: CAT_COLOR.online }}>{f.online}</span>,
                <span key="b" style={{ color: CAT_COLOR.below }}>{f.below}</span>,
                f.finished,
              ])}
            />
          </div>
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">{t("rmByPonto")}</div>
            <DataTable
              headers={[t("rmScopePonto"), t("rmOnShift"), t("rmDelivering"), t("rmOnline"), t("rmBelow"), t("rmColFinished")]}
              rows={data.summary.byPonto.map((p) => [
                <span key="n" className={`font-bold ${p.name === "未归属" ? "text-[var(--danger-ink)]" : "text-[var(--text)]"}`}>{p.name === "未归属" ? t("rmUnassigned") : p.name}</span>,
                <span key="t" className="font-extrabold">{p.total}</span>,
                <span key="d" style={{ color: CAT_COLOR.delivering }}>{p.delivering}</span>,
                <span key="o" style={{ color: CAT_COLOR.online }}>{p.online}</span>,
                <span key="b" style={{ color: CAT_COLOR.below }}>{p.below}</span>,
                p.finished,
              ])}
            />
          </div>
        </div>
      ) : null}

      <div className="mb-3 mt-5 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("rmSearch")}
            className="h-9 w-60 rounded-[6px] border border-[var(--line)] bg-[var(--surface-raised)] pl-8 pr-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]" />
        </div>
        {catChips.map(([c, label]) => (
          <button key={c || "all"} onClick={() => setCatFilter(c)}
            className={`h-8 rounded-full border px-3 text-xs font-bold transition-colors ${catFilter === c ? "border-[var(--accent)] bg-[rgba(255,209,0,0.12)] text-[var(--accent)]" : "border-[var(--line)] text-[var(--muted-strong)] hover:border-[var(--accent)]"}`}>
            {label}
          </button>
        ))}
        {isHQ ? (
          <label className="flex items-center gap-2 text-xs font-bold text-[var(--muted-strong)]">
            <input type="checkbox" checked={onlyUnassigned} onChange={(e) => setOnlyUnassigned(e.target.checked)} /> {t("rmOnlyUnassigned")}
          </label>
        ) : null}
        <span className="ml-auto text-xs text-[var(--muted)]">{filtered.length} {t("rmRidersUnit")}</span>
      </div>

      <DataTable
        headers={[t("rmColRider"), t("rmColStatus"), t("rmColShift"), t("rmColZone"), t("rmColVehicle"), t("rmColOnlineMin"), t("rmColFinished"), t("rmScopeFranchise"), t("rmScopePonto")]}
        rows={filtered.map((r) => [
          <div key="n" className="flex flex-col">
            <span className="font-bold text-[var(--text)]">{r.name || "—"}</span>
            <span className="text-[11px] text-[var(--muted)]">{r.phone || "—"}</span>
          </div>,
          <span key="s" className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold" style={{ borderColor: CAT_COLOR[r.cat], color: CAT_COLOR[r.cat] }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: CAT_COLOR[r.cat] }} />
            {catLabel(r)}
          </span>,
          r.shift || "—",
          r.hotZone || "—",
          <span key="v" className="inline-flex items-center gap-1 text-[var(--text-soft)]"><Bike size={13} />{r.vehicle || "—"}</span>,
          <span key="ol">{r.onlineMins != null ? `${r.onlineMins} ${t("rmMins")}` : "—"}</span>,
          <span key="f" className="font-bold">{r.finishedCnt ?? 0}</span>,
          r.franchise
            ? <span key="fr" className="inline-flex rounded-[6px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 py-0.5 text-[11px] font-bold text-[var(--muted-strong)]">{r.franchise}</span>
            : <span key="u" className="inline-flex rounded-[6px] border border-[var(--danger)] bg-[var(--danger-bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--danger-ink)]">{t("rmUnassigned")}</span>,
          r.ponto || "—",
        ])}
      />
    </AppShell>
  );
}
