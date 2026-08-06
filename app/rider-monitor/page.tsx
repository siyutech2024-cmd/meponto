"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { RefreshCcw, Search, Bike, X, MapPin, Phone } from "lucide-react";
import { AppShell, DataTable, PageTitle } from "../components/ui";
import RiderMap, { type MapRider } from "./RiderMap";
import MonitorTabs from "./MonitorTabs";
import { HOT_ZONES } from "./hot-zones";
import { readSession } from "../lib/session";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";

type Cat = "delivering" | "online" | "notOnline" | "below" | "outArea" | "other";
type Perf = {
  ar: number | null; caa: number | null; overtime: number | null; tsh: number | null;
  acceptCnt: number | null; declinedCnt: number | null; cancelledCnt: number | null;
  delayedCnt: number | null; joinTime: string | null;
};
type LiveRider = {
  riderExtId: string | null; name: string | null; phone: string | null;
  status: string | null; statusLabel: string; cat: Cat; shift: string;
  hotZone: string | null; vehicle: string | null; onlineMins: number | null;
  restMins: number | null; finishedCnt: number | null; lat: number | null; lng: number | null;
  franchise: string; ponto: string; leader: string; assigned: boolean; perf?: Perf | null;
  /** 模式二: 骑手所属池(PRO 实时监控用). */
  pool?: "standard" | "pro";
};
type Cats = { delivering: number; online: number; notOnline: number; below: number; outArea: number; other: number };
type AggRow = { name: string; total: number; finished: number } & Cats;
type Payload = {
  capturedAt: string | null;
  kpi: { ar: number | null; caa: number | null; acceptCnt: number | null; overtime: number | null; tsh: number | null; finishedCnt: number | null } | null;
  scopeKpi: { ar: number | null; caa: number | null; acceptCnt: number | null; overtime: number | null; tsh: number | null; finishedCnt: number | null } | null;
  riders: LiveRider[];
  summary: { total: number; assigned: number; unassigned: number; finishedTotal: number; cats: Cats; byFranchise: AggRow[]; byPonto: AggRow[] };
};

const CAT_COLOR: Record<Cat, string> = { delivering: "#16a34a", online: "#2563eb", notOnline: "#9ca3af", below: "#d97706", outArea: "#dc2626", other: "#6b7280" };
const CAT_KEY: Record<Cat, TranslationKey> = { delivering: "rmDelivering", online: "rmOnline", notOnline: "rmNotOnline", below: "rmBelow", outArea: "rmOutArea", other: "rmColStatus" };

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

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-base font-extrabold text-[var(--text)] font-[family-name:var(--font-outfit)]">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--line-soft)] py-2 text-sm last:border-0">
      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</span>
      <span className="text-right font-bold text-[var(--text)]">{value}</span>
    </div>
  );
}

const riderKey = (r: LiveRider) => r.riderExtId || r.phone || r.name || "";

export default function RiderMonitorPage() {
  const session = useMemo(() => readSession(), []);
  const language = useVentoStore((s) => s.language);
  const t = useCallback((k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  }, [language]);
  const catLabel = useCallback((r: { cat: Cat; statusLabel: string }) => (r.cat === "other" ? r.statusLabel : t(CAT_KEY[r.cat])), [t]);

  const scopeFranchise = session?.portal === "franchise" ? session.franchise || session.organization : "";
  const scopeStation = session?.portal === "ponto" ? session.station || session.organization : "";
  const isHQ = !scopeFranchise && !scopeStation;

  const [data, setData] = useState<Payload | null>(null);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState<Cat | "">("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  // 模式二: "" 全部 / "pro" 仅 PRO 池 / "standard" 仅普通池.
  const [poolFilter, setPoolFilter] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [detailKey, setDetailKey] = useState<string | null>(null);
  // Hot zone → franchise assignments (HQ assigns; franchise portals are
  // limited to their own zones). A zone can be shared by several franchises.
  // { [zoneId]: franchiseNames[] }
  const [zoneAssign, setZoneAssign] = useState<Record<string, string[]>>({});
  const [showZonePanel, setShowZonePanel] = useState(false);
  /**
   * 模式二 T6 · 应岗未上 (rostered but not online).
   * The locked roster of TODAY is the only trustworthy "who was supposed to
   * work" list — before the roster is locked people are still being added and
   * removed, so comparing against it would produce noise. Therefore:
   * roster未锁 → 整块隐藏(降级,不误报);roster已锁 → 名册 ∩ 不在实时快照里
   * = 应岗未上,红色列出,运营可以直接打电话。
   */
  const [noShow, setNoShow] = useState<Array<{ name: string; rider99Id: string; station: string; timeRange: string }> | null>(null);

  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Super Admin" }), [session]);

  /** 模式二 T6 · 应岗未上. Reads today's dispatch board and keeps only the
   *  LOCKED shifts — see the state declaration for why unlocked is skipped. */
  const loadNoShow = useCallback(async (live: Payload | null) => {
    const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10); // BRT
    const params = new URLSearchParams({ from: today, to: today });
    if (scopeFranchise) params.set("franchise", scopeFranchise);
    if (scopeStation) params.set("station", scopeStation);
    const res = await fetch(`/api/dispatch?${params}`, { headers, cache: "no-store" });
    if (!res.ok) {
      setNoShow(null);
      return;
    }
    const board = (await res.json()).data as {
      shifts: Array<{ id: string; lockedAt?: string; timeRange: string }>;
      signups: Array<{ shiftId: string; riderName: string; rider99Id: string; station: string; status: string }>;
    };
    const lockedShifts = new Map(board.shifts.filter((s) => s.lockedAt).map((s) => [s.id, s]));
    if (lockedShifts.size === 0) {
      setNoShow(null); // roster not frozen yet → the panel stays hidden
      return;
    }
    const onlineIds = new Set((live?.riders ?? []).map((r) => String(r.riderExtId ?? "")).filter(Boolean));
    const missing = board.signups
      .filter((s) => lockedShifts.has(s.shiftId) && (s.status === "approved" || s.status === "reported"))
      .filter((s) => !onlineIds.has(String(s.rider99Id)))
      .map((s) => ({ name: s.riderName, rider99Id: s.rider99Id, station: s.station, timeRange: lockedShifts.get(s.shiftId)?.timeRange ?? "" }));
    setNoShow(missing);
  }, [headers, scopeFranchise, scopeStation]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (scopeFranchise) params.set("franchise", scopeFranchise);
    if (scopeStation) params.set("ponto", scopeStation);
    const res = await fetch(`/api/eastwind/riders-live?${params}`, { headers, cache: "no-store" });
    if (res.ok) {
      const live = (await res.json()).data as Payload;
      setData(live);
      setUpdatedAt(new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" }));
      void loadNoShow(live); // 模式二 T6: recompute against the same snapshot
    }
  }, [headers, scopeFranchise, scopeStation, loadNoShow]);

  const loadZoneAssignments = useCallback(async () => {
    const res = await fetch("/api/eastwind/zone-assignments", { headers, cache: "no-store" });
    if (res.ok) {
      const list = ((await res.json()).data ?? []) as Array<{ id: string; franchises: string[] }>;
      setZoneAssign(Object.fromEntries(list.map((a) => [a.id, a.franchises ?? []])));
    }
  }, [headers]);

  const saveZoneAssignment = useCallback(async (zoneId: string, franchises: string[]) => {
    setZoneAssign((prev) => ({ ...prev, [zoneId]: franchises })); // optimistic
    const res = await fetch("/api/eastwind/zone-assignments", {
      method: "POST", headers, body: JSON.stringify({ zoneId, franchises }),
    });
    if (!res.ok) void loadZoneAssignments(); // roll back to server truth
  }, [headers, loadZoneAssignments]);

  const addZoneFranchise = useCallback((zoneId: string, franchise: string) => {
    if (!franchise) return;
    const cur = zoneAssign[zoneId] ?? [];
    if (!cur.includes(franchise)) void saveZoneAssignment(zoneId, [...cur, franchise]);
  }, [zoneAssign, saveZoneAssignment]);

  const removeZoneFranchise = useCallback((zoneId: string, franchise: string) => {
    const cur = zoneAssign[zoneId] ?? [];
    void saveZoneAssignment(zoneId, cur.filter((f) => f !== franchise));
  }, [zoneAssign, saveZoneAssignment]);

  useEffect(() => {
    void load();
    void loadZoneAssignments();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load, loadZoneAssignments]);

  const riders = data?.riders ?? [];
  const cats = data?.summary.cats;
  // 模式二 T6: how many of the riders on shift right now come from the PRO
  // source — shown as a subtitle on the existing "on shift" card.
  const proOnline = riders.filter((r) => r.pool === "pro").length;

  const filtered = riders.filter((r) => {
    if (catFilter && r.cat !== catFilter) return false;
    // 模式二: PRO / 普通 池筛选(两个 OL 抓取源在同一看板上并存)
    if (poolFilter && (r.pool === "pro" ? "pro" : "standard") !== poolFilter) return false;
    if (onlyUnassigned && r.assigned) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!`${r.name ?? ""} ${r.phone ?? ""} ${r.riderExtId ?? ""}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const staleMin = data?.capturedAt ? Math.floor((Date.now() - new Date(data.capturedAt).getTime()) / 60000) : null;
  const isStale = staleMin != null && staleMin > 15;
  const batchLabel = data?.capturedAt ? new Date(data.capturedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
  const scopeLabel = isHQ ? t("rmScopeCity") : scopeFranchise ? `${t("rmScopeFranchise")}: ${scopeFranchise}` : `${t("rmScopePonto")}: ${scopeStation}`;
  const kpi = data?.kpi;
  const pct = (v: number | null | undefined) => (v == null ? "—" : `${v}%`);
  const na = (v: number | string | null | undefined, suffix = "") => (v == null ? "N/A" : `${v}${suffix}`);
  const naPct = (v: number | null | undefined) => (v == null ? "N/A" : `${v}%`);
  const detail = detailKey ? riders.find((r) => riderKey(r) === detailKey) ?? null : null;

  // Map dots: every scoped rider with a GPS fix, colored by status category.
  const mapRiders: MapRider[] = useMemo(
    () =>
      riders
        .filter((r) => r.lat != null && r.lng != null)
        .map((r) => ({
          key: riderKey(r), name: r.name || "—", phone: r.phone,
          statusText: catLabel(r), color: CAT_COLOR[r.cat], lat: r.lat as number, lng: r.lng as number,
          // Hover tooltip summary lines (pre-localized).
          metaLines: [
            `${t("rmColShift")}: ${r.shift || "—"} · ${t("rmColZone")}: ${r.hotZone || "—"}`,
            `${t("rmColOnlineMin")}: ${r.onlineMins != null ? `${r.onlineMins} ${t("rmMins")}` : "—"} · ${t("rmColFinished")}: ${r.finishedCnt ?? 0}`,
          ],
        })),
    [riders, catLabel, t],
  );
  const noGpsCount = riders.length - mapRiders.length;

  // Zone visibility per portal: HQ sees everything; a franchise portal only
  // its assigned zones; a station portal sees all zones (its riders are
  // already scoped, and station→franchise ownership isn't in this payload).
  const visibleZones = useMemo(
    () => (scopeFranchise ? HOT_ZONES.filter((z) => (zoneAssign[z.id] ?? []).includes(scopeFranchise)) : HOT_ZONES),
    [scopeFranchise, zoneAssign],
  );
  // Franchise choices for the HQ assign panel: every franchise seen in the
  // city-wide summary plus any already holding an assignment.
  const franchiseOptions = useMemo(() => {
    const names = new Set<string>();
    for (const f of data?.summary.byFranchise ?? []) if (f.name && f.name !== "未归属") names.add(f.name);
    for (const fs of Object.values(zoneAssign)) for (const f of fs) if (f) names.add(f);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [data, zoneAssign]);

  const catChips: Array<[Cat | "", string]> = [
    ["", t("rmAllStatus")], ["delivering", t("rmDelivering")], ["online", t("rmOnline")], ["notOnline", t("rmNotOnline")], ["below", t("rmBelow")], ["outArea", t("rmOutArea")],
  ];

  return (
    <AppShell>
      <MonitorTabs />
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

      {isStale ? (
        isHQ ? (
          // HQ sees the operational truth (scraper likely down, re-login needed).
          <div className="mb-3 flex items-center gap-2 rounded-[8px] border border-[var(--danger)] bg-[var(--danger-bg)] px-4 py-3 text-sm font-black text-[var(--danger-ink)]">
            {t("rmStale", { min: staleMin })}
          </div>
        ) : (
          // Franchise/station portals get a soft "data as of …" note — no
          // internal scraper/Eastwind details outside HQ.
          <div className="mb-3 flex items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3 text-sm font-bold text-[var(--muted-strong)]">
            {t("rmDataAsOf", { time: batchLabel })}
          </div>
        )
      ) : null}

      {/* 模式二 T6 · 应岗未上:锁定名册里的人没出现在实时快照 → 红色列出,
          运营可以直接按名单打电话。名册未锁定时整块不渲染(不误报)。 */}
      {noShow && noShow.length > 0 && (
        <div className="mb-3 rounded-[8px] border border-[var(--danger)] bg-[var(--danger-bg)] px-4 py-3">
          <div className="text-[11px] font-black uppercase text-[var(--danger-ink)]">{t("rmNoShow", { n: noShow.length })}</div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-bold text-[var(--danger-ink)]">
            {noShow.slice(0, 30).map((row) => (
              <span key={`${row.rider99Id}-${row.timeRange}`} translate="no">
                {row.name} · {row.timeRange} · {row.station}
              </span>
            ))}
            {noShow.length > 30 && <span>… +{noShow.length - 30}</span>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* 模式二 T6: PRO 在线数不另开卡片,直接作为"在岗"卡的副标题——
            设计铁律:不新增菜单也不堆卡片。PRO 数为 0 时完全不显示。 */}
        <StatCard
          label={proOnline > 0 ? `${t("rmOnShift")} · PRO ${proOnline}` : t("rmOnShift")}
          value={data?.summary.total ?? 0}
          color="var(--accent)"
          big
        />
        <StatCard label={t("rmDelivering")} value={cats?.delivering ?? 0} color={CAT_COLOR.delivering} />
        <StatCard label={t("rmOnline")} value={cats?.online ?? 0} color={CAT_COLOR.online} />
        <StatCard label={t("rmNotOnline")} value={cats?.notOnline ?? 0} color={CAT_COLOR.notOnline} />
        <StatCard label={t("rmBelow")} value={cats?.below ?? 0} color={CAT_COLOR.below} />
        {isHQ
          ? <StatCard label={t("rmUnassigned")} value={data?.summary.unassigned ?? 0} color="#dc2626" />
          : <StatCard label={t("rmFinishedTotal")} value={data?.summary.finishedTotal ?? 0} color={CAT_COLOR.delivering} />}
      </div>

      {(() => {
        // Franchise/station sessions get THEIR OWN real-time KPI (aggregated
        // per-rider with Eastwind's formulas); HQ keeps the city-wide row.
        const scopeKpiRow = data?.scopeKpi ?? null;
        const kpiRow = scopeKpiRow ?? kpi;
        if (!kpiRow) return null;
        return (
          <div className="mt-3 flex flex-wrap gap-2">
            <KpiPill label="AR" value={pct(kpiRow.ar)} />
            <KpiPill label="CAA" value={pct(kpiRow.caa)} />
            <KpiPill label={t("rmAcceptCnt")} value={String(kpiRow.acceptCnt ?? "—")} />
            <KpiPill label="Overtime" value={pct(kpiRow.overtime)} />
            <KpiPill label="%TSH" value={pct(kpiRow.tsh)} />
            <KpiPill label={t("rmFinishedCnt")} value={String(kpiRow.finishedCnt ?? "—")} />
            <span className="ml-auto self-center text-[10px] text-[var(--muted)]">{scopeKpiRow ? t("rmKpiScopeNote") : t("rmKpiCityNote")}</span>
          </div>
        );
      })()}

      <div className="mt-5">
        <div className="mb-2 flex items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">{t("rmMap")}</span>
          <span className="text-[11px] text-[var(--muted)]">{mapRiders.length} {t("rmRidersUnit")}{noGpsCount > 0 ? ` · ${t("rmNoGps", { n: noGpsCount })}` : ""}</span>
          {scopeFranchise && visibleZones.length === 0 ? (
            <span className="text-[11px] font-bold text-[var(--danger-ink)]">{t("rmZoneNone")}</span>
          ) : null}
          {isHQ ? (
            <button
              onClick={() => setShowZonePanel((v) => !v)}
              className={`ml-auto h-7 rounded-full border px-3 text-[11px] font-bold transition-colors ${showZonePanel ? "border-[var(--accent)] bg-[rgba(255,209,0,0.12)] text-[var(--accent)]" : "border-[var(--line)] text-[var(--muted-strong)] hover:border-[var(--accent)]"}`}
            >
              {t("rmZoneAssign")}
            </button>
          ) : null}
        </div>

        {isHQ && showZonePanel ? (
          <div className="mb-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">{t("rmZoneAssignHint")}</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {HOT_ZONES.map((z) => {
                const assigned = zoneAssign[z.id] ?? [];
                const addable = franchiseOptions.filter((f) => !assigned.includes(f));
                return (
                  <div key={z.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: z.color }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-bold text-[var(--text)]">{z.group}</div>
                        <div className="text-[10px] text-[var(--muted)]">{z.hotZone ?? z.id}</div>
                      </div>
                      <select
                        value=""
                        onChange={(e) => addZoneFranchise(z.id, e.target.value)}
                        className="h-8 max-w-[45%] rounded-[6px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-xs font-bold text-[var(--text)] outline-none focus:border-[var(--accent)]"
                      >
                        <option value="">{t("rmZoneAdd")}</option>
                        {addable.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {assigned.length === 0 ? (
                        <span className="text-[10px] text-[var(--muted)]">{t("rmZoneUnassigned")}</span>
                      ) : (
                        assigned.map((f) => (
                          <span key={f} className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-raised)] px-2 py-0.5 text-[11px] font-bold text-[var(--text)]">
                            {f}
                            <button
                              onClick={() => removeZoneFranchise(z.id, f)}
                              aria-label={`${t("rmZoneUnassigned")}: ${f}`}
                              className="text-[var(--muted)] transition-colors hover:text-[var(--danger-ink)]"
                            >
                              <X size={11} />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <RiderMap
          riders={mapRiders}
          zones={visibleZones}
          zoneLabel={(zoneId) => (zoneAssign[zoneId]?.length ? zoneAssign[zoneId].join(" · ") : null)}
          focusKey={detailKey}
          onSelect={setDetailKey}
        />
      </div>

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
        {/* 模式二: 池筛选 chip —— 三级后台共用,加盟商/站点会话自动只见自己域内 */}
        {(["", "pro", "standard"] as const).map((p) => (
          <button
            key={p || "all"}
            type="button"
            onClick={() => setPoolFilter(p)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-black transition ${
              poolFilter === p
                ? p === "pro" ? "bg-[#eda100] text-[#171b33]" : "bg-[var(--text)] text-[var(--bg)]"
                : "border border-[var(--line)] text-[var(--muted-strong)]"
            }`}
          >
            {p === "" ? t("rmPoolAll") : p === "pro" ? "PRO" : t("rmPoolStandard")}
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
          <button key="n" onClick={() => setDetailKey(riderKey(r))} className="flex flex-col text-left" title={t("rmDetailTitle")}>
            <span className="flex items-center gap-1.5">
              <span className="font-bold text-[var(--text)] underline decoration-[var(--line)] decoration-dotted underline-offset-4 transition-colors hover:text-[var(--accent)] hover:decoration-[var(--accent)]">{r.name || "—"}</span>
              {r.pool === "pro" && (
                <span className="shrink-0 rounded-full bg-[#eda100] px-1.5 py-[1px] text-[9px] font-black text-[#171b33]">PRO</span>
              )}
            </span>
            <span className="text-[11px] text-[var(--muted)]">{r.phone || "—"}</span>
          </button>,
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

      {detail ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setDetailKey(null)}>
          <aside
            className="h-full w-full max-w-md overflow-y-auto border-l border-[var(--line)] bg-[var(--surface)] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={t("rmDetailTitle")}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{t("rmDetailTitle")}</div>
                <h2 className="mt-1 text-xl font-extrabold text-[var(--text)] font-[family-name:var(--font-outfit)]">{detail.name || "—"}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-strong)]">
                  {detail.riderExtId ? <span className="font-mono">{detail.riderExtId}</span> : null}
                  <span className="inline-flex items-center gap-1"><Bike size={13} />{detail.vehicle || "—"}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold" style={{ borderColor: CAT_COLOR[detail.cat], color: CAT_COLOR[detail.cat] }}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: CAT_COLOR[detail.cat] }} />
                    {catLabel(detail)}
                  </span>
                </div>
              </div>
              <button onClick={() => setDetailKey(null)} aria-label={t("rmClose")}
                className="rounded-[6px] border border-[var(--line)] p-1.5 text-[var(--muted-strong)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
                <X size={16} />
              </button>
            </div>

            <div className="mt-4">
              <InfoRow label={t("rmPhone")} value={detail.phone ? <span className="inline-flex items-center gap-1.5"><Phone size={13} />{detail.phone}</span> : "—"} />
              <InfoRow label={t("rmColShift")} value={detail.shift || "—"} />
              <InfoRow label={t("rmColZone")} value={detail.hotZone || "—"} />
              <InfoRow label={t("rmScopeFranchise")} value={detail.franchise || t("rmUnassigned")} />
              <InfoRow label={t("rmScopePonto")} value={detail.ponto || "—"} />
              <InfoRow label={t("rmLeader")} value={detail.leader || "—"} />
              {detail.lat != null && detail.lng != null ? (
                <InfoRow
                  label={t("rmViewMap")}
                  value={
                    <a href={`https://www.google.com/maps?q=${detail.lat},${detail.lng}`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 font-bold text-[var(--accent)] hover:underline">
                      <MapPin size={13} />{detail.lat.toFixed(5)}, {detail.lng.toFixed(5)}
                    </a>
                  }
                />
              ) : null}
            </div>

            <div className="mt-5 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">{t("rmPerfShift")}</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <DetailStat label="AR" value={naPct(detail.perf?.ar)} />
              <DetailStat label="CAA" value={naPct(detail.perf?.caa)} />
              <DetailStat label="Overtime" value={naPct(detail.perf?.overtime)} />
              <DetailStat label="%TSH" value={naPct(detail.perf?.tsh)} />
              <DetailStat label={t("rmOnlineHours")} value={na(detail.onlineMins, ` ${t("rmMins")}`)} />
              <DetailStat label={t("rmFinishedCnt")} value={na(detail.finishedCnt)} />
              <DetailStat label={t("rmAcceptCnt")} value={na(detail.perf?.acceptCnt)} />
              <DetailStat label={t("rmDeclinedCnt")} value={na(detail.perf?.declinedCnt)} />
              <DetailStat label={t("rmCancelledCnt")} value={na(detail.perf?.cancelledCnt)} />
              <DetailStat label={t("rmDelayedCnt")} value={na(detail.perf?.delayedCnt)} />
              <DetailStat label={t("rmRestTime")} value={na(detail.restMins, ` ${t("rmMins")}`)} />
              <DetailStat label={t("rmJoinTime")} value={na(detail.perf?.joinTime)} />
            </div>
            <p className="mt-3 text-[11px] text-[var(--muted)]">{t("rmPerfNote")}</p>
          </aside>
        </div>
      ) : null}
    </AppShell>
  );
}
