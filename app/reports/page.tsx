"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Download, FileBarChart2, MapPin, RefreshCcw, Users } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
import { Chip, DataTable, Pager, SectionCard, Stat, Toolbar, type DataColumn, type SortState } from "../components/kit";
import { downloadCsv } from "../lib/csv";
import { readSession } from "../lib/session";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";

/**
 * Operations report center — REAL data from the T+1 statement endpoint.
 * HQ sees the whole network (franchise / station / rider dimensions);
 * a franchise login is automatically scoped to its own riders.
 */

type Row = {
  date: string;
  riderName: string;
  rider99Id: string;
  cpf: string;
  pix: string;
  phone: string;
  franchise: string;
  station: string;
  orders: number;
  kpiOrders: number | null;
  onlineHours: number | null;
  ar: number | null;
  tsh: number | null;
  total: number;
  tripIncome: number;
  bonus: number;
  tips: number;
  cashDebt: number;
  mealDeduction: number;
  settleAmount: number;
  paid: boolean;
};

type GroupedRow = {
  key: string;
  sub: string;
  riderCount: number;
  orders: number;
  kpiOrders: number;
  settle: number;
  paid: number;
  pending: number;
  ar: number | null;
};

const HEADERS = { "Content-Type": "application/json" };
const money = (v: number) => `R$ ${v.toFixed(2)}`;
const r2 = (v: number) => Math.round(v * 100) / 100;
const input = "h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--accent)]";

function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mondayOf(date: Date): string {
  const d = new Date(date);
  const back = (d.getDay() - 1 + 7) % 7;
  d.setDate(d.getDate() - back);
  return localDateString(d);
}

/** Generic client-side sort keyed by a flat row field (numbers first, strings as fallback). */
function sortRows<T>(rows: T[], sort: SortState): T[] {
  if (!sort) return rows;
  const { key, dir } = sort;
  const val = (row: T) => (row as unknown as Record<string, unknown>)[key];
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

export default function ReportsPage() {
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
  const FULL_HEADERS = [t("wlCsvDate"), t("rdColRider"), "99ID", "CPF", "PIX", t("rdPhPhone"), t("rdColFranchise"), t("wlColStation"), t("rpOrdersSettle"), t("rpOrdersKpi"), t("wlCsvOnlineH"), "AR%", "%TSH", t("rpToday"), t("wlCsvTripInc"), t("wlCsvBonus"), t("wlCsvTips"), t("wlCsvCashDebt"), t("wlCsvMeal"), t("wlCsvSettle"), t("rpPayStatus")];
  const fullRow = (r: Row) => [r.date, r.riderName, r.rider99Id, r.cpf, r.pix, r.phone, r.franchise, r.station, String(r.orders), r.kpiOrders ?? "", r.onlineHours ?? "", r.ar ?? "", r.tsh ?? "", r.total.toFixed(2), r.tripIncome.toFixed(2), r.bonus.toFixed(2), r.tips.toFixed(2), r.cashDebt.toFixed(2), r.mealDeduction.toFixed(2), r.settleAmount.toFixed(2), r.paid ? t("rpPaid") : t("rpPending")];
  const session = useMemo(() => readSession(), []);
  const scopeFranchise = session?.portal === "franchise" ? session.franchise || session.organization : "";

  const [from, setFrom] = useState(() => mondayOf(new Date()));
  const [to, setTo] = useState(() => localDateString(new Date()));
  const [rows, setRows] = useState<Row[]>([]);
  const [dim, setDim] = useState<"franchise" | "station" | "rider">(scopeFranchise ? "station" : "franchise");
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    const target = scopeFranchise || "all";
    const response = await fetch(`/api/wallet?statement=${encodeURIComponent(target)}&from=${from}&to=${to}`, { headers: HEADERS, cache: "no-store" });
    if (response.ok) setRows((await response.json()).data.rows as Row[]);
    setLoading(false);
  }, [from, to, scopeFranchise]);

  useEffect(() => {
    void load();
  }, [load]);

  // ---- Aggregations -------------------------------------------------------
  const summary = useMemo(() => {
    const riders = new Set(rows.map((r) => r.rider99Id)).size;
    const orders = rows.reduce((s, r) => s + r.orders, 0);
    const kpiOrders = rows.reduce((s, r) => s + (r.kpiOrders ?? 0), 0);
    const settle = r2(rows.reduce((s, r) => s + r.settleAmount, 0));
    const paid = r2(rows.filter((r) => r.paid).reduce((s, r) => s + r.settleAmount, 0));
    const ars = rows.map((r) => r.ar).filter((v): v is number => v !== null);
    const ar = ars.length ? Math.round((ars.reduce((s, v) => s + v, 0) / ars.length) * 10) / 10 : null;
    return { riders, orders, kpiOrders, settle, paid, pending: r2(settle - paid), ar };
  }, [rows]);

  const grouped = useMemo<GroupedRow[]>(() => {
    const keyOf = (r: Row) => (dim === "franchise" ? r.franchise : dim === "station" ? r.station : `${r.riderName}|${r.rider99Id}`);
    const map = new Map<string, { key: string; sub: string; riders: Set<string>; orders: number; kpiOrders: number; settle: number; paid: number; arSum: number; arN: number }>();
    for (const r of rows) {
      const key = keyOf(r);
      const cur = map.get(key) ?? { key: dim === "rider" ? r.riderName : key, sub: dim === "rider" ? `${r.rider99Id} · ${r.station}` : dim === "station" ? r.franchise : "", riders: new Set<string>(), orders: 0, kpiOrders: 0, settle: 0, paid: 0, arSum: 0, arN: 0 };
      cur.riders.add(r.rider99Id);
      cur.orders += r.orders;
      cur.kpiOrders += r.kpiOrders ?? 0;
      cur.settle = r2(cur.settle + r.settleAmount);
      if (r.paid) cur.paid = r2(cur.paid + r.settleAmount);
      if (r.ar !== null) { cur.arSum += r.ar; cur.arN += 1; }
      map.set(key, cur);
    }
    return [...map.values()]
      .map(({ riders, arSum, arN, ...g }) => ({ ...g, riderCount: riders.size, pending: r2(g.settle - g.paid), ar: arN ? Math.round((arSum / arN) * 10) / 10 : null }))
      .sort((a, b) => b.settle - a.settle);
  }, [rows, dim]);

  const sorted = useMemo(() => sortRows(grouped, sort), [grouped, sort]);

  useEffect(() => {
    setPage(1);
  }, [dim, sort, rows]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageRows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const onSort = (key: string) => setSort((prev) => (prev?.key === key ? (prev.dir === -1 ? { key, dir: 1 } : null) : { key, dir: -1 }));

  const dims = (scopeFranchise ? [["station", t("rpByStation"), MapPin], ["rider", t("rpByRider"), Users]] : [["franchise", t("rpByFranchise"), Building2], ["station", t("rpByStation"), MapPin], ["rider", t("rpByRider"), Users]]) as Array<["franchise" | "station" | "rider", string, typeof Building2]>;
  const dimLabel = dims.find(([key]) => key === dim)?.[1] ?? "";

  const columns: Array<DataColumn<GroupedRow>> = [
    {
      key: "key",
      label: dim === "franchise" ? t("rdColFranchise") : dim === "station" ? t("wlColStation") : t("rdColRider"),
      sortKey: "key",
      render: (g) => (
        <div>
          <div className="font-black">{g.key}</div>
          {g.sub && <div className="text-[10px] font-bold text-[var(--muted)]">{g.sub}</div>}
        </div>
      ),
    },
    { key: "riderCount", label: t("rpRiders"), sortKey: "riderCount", align: "right", render: (g) => g.riderCount },
    { key: "orders", label: t("rpOrdersSettle"), sortKey: "orders", align: "right", render: (g) => <span className="font-black">{g.orders}</span> },
    { key: "kpiOrders", label: t("rpOrdersKpi"), sortKey: "kpiOrders", align: "right", render: (g) => g.kpiOrders },
    { key: "ar", label: t("rpAvgAr"), sortKey: "ar", align: "right", render: (g) => (g.ar !== null ? `${g.ar}%` : "—") },
    { key: "settle", label: t("rpSettle"), sortKey: "settle", align: "right", render: (g) => <span className="font-black text-[var(--accent)]">{money(g.settle)}</span> },
    { key: "paid", label: t("rpPaid"), sortKey: "paid", align: "right", render: (g) => <span className="text-[var(--ok-ink)]">{money(g.paid)}</span> },
    { key: "pending", label: t("rpPending"), sortKey: "pending", align: "right", render: (g) => <span className={`font-black ${g.pending > 0 ? "text-[var(--warning-ink)]" : "text-[var(--muted)]"}`}>{money(g.pending)}</span> },
  ];

  return (
    <AppShell>
      <PageTitle
        title={t("rpTitle")}
        eyebrow={scopeFranchise ? t("rpEyebrowFr", { f: scopeFranchise }) : t("rpEyebrowHq")}
        action={
          <div className="flex gap-2">
            <button type="button" className="tag inline-flex items-center gap-1" onClick={() => downloadCsv(`report-${from}_${to}`, FULL_HEADERS, rows.map(fullRow))} title={t("rpExportRowsTitle")}>
              <Download size={13} /> {t("rpExportRows")}
            </button>
            <button type="button" className="tag inline-flex items-center gap-1" onClick={() => void load()}><RefreshCcw size={13} /> {t("rpRefresh")}</button>
          </div>
        }
      />

      {/* Stat row */}
      <section className="mb-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label={t("rpRiders")} value={String(summary.riders)} />
        <Stat label={t("rpOrdersSettle")} value={String(summary.orders)} />
        <Stat label={t("rpOrdersKpi")} value={String(summary.kpiOrders)} />
        <Stat label={t("rpAvgAr")} value={summary.ar !== null ? `${summary.ar}%` : "—"} />
        <Stat label={t("rpPaid")} value={money(summary.paid)} />
        <div className="panel border-[var(--accent)] p-4">
          <div className="text-[11px] font-bold uppercase text-[var(--accent)]">{t("rpSettleTotal", { pending: money(summary.pending) })}</div>
          <div className="mt-1 text-2xl font-black text-[var(--accent)]">{money(summary.settle)}</div>
        </div>
      </section>

      {/* Toolbar — date range + quick ranges + dimension switch */}
      <div className="mb-4" data-i18n-skip>
        <Toolbar
          right={
            <div className="flex items-center gap-1.5">
              {dims.map(([key, label, Icon]) => (
                <Chip key={key} active={dim === key} onClick={() => setDim(key)}>
                  <span className="inline-flex items-center gap-1.5"><Icon size={13} /> {label}</span>
                </Chip>
              ))}
            </div>
          }
        >
          <FileBarChart2 size={16} className="text-[var(--accent)]" />
          <label className="flex items-center gap-2 text-xs font-black uppercase text-[var(--muted)]">
            {t("rpFrom")} <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-xs font-black uppercase text-[var(--muted)]">
            {t("rpTo")} <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <Chip onClick={() => { setFrom(mondayOf(new Date())); setTo(localDateString(new Date())); }}>{t("rpThisWeek")}</Chip>
          <Chip onClick={() => { const d = new Date(); d.setDate(d.getDate() - 7); const start = mondayOf(d); const end = new Date(`${start}T12:00:00`); end.setDate(end.getDate() + 6); setFrom(start); setTo(localDateString(end)); }}>{t("rpLastWeek")}</Chip>
          <Chip onClick={() => { const d = new Date(); d.setDate(d.getDate() - 29); setFrom(localDateString(d)); setTo(localDateString(new Date())); }}>{t("rp30d")}</Chip>
          {loading && <span className="text-xs font-bold text-[var(--muted)]">{t("rpLoading")}</span>}
        </Toolbar>
      </div>

      {/* Report table */}
      <SectionCard
        title={dimLabel}
        desc={`${from} → ${to}`}
        right={
          <button
            type="button"
            className="tag inline-flex items-center gap-1"
            onClick={() =>
              downloadCsv(
                `report-${dim}-${from}_${to}`,
                [t("rpColObject"), t("rpColSub"), t("rpRiders"), t("rpOrdersSettle"), t("rpOrdersKpi"), t("rpAvgAr"), t("rpSettle"), t("rpPaid"), t("rpPending")],
                grouped.map((g) => [g.key, g.sub, String(g.riderCount), String(g.orders), String(g.kpiOrders), g.ar ?? "", g.settle.toFixed(2), g.paid.toFixed(2), g.pending.toFixed(2)]),
              )
            }
          >
            <Download size={13} /> {t("rpExportTable")}
          </button>
        }
      >
        <DataTable<GroupedRow>
          columns={columns}
          rows={pageRows}
          rowKey={(g) => g.key + g.sub}
          sort={sort}
          onSort={onSort}
          minWidth={760}
          empty={loading ? t("rpLoading") : t("rpNoData")}
        />
        {pages > 1 && (
          <div className="mt-3 flex justify-end" data-i18n-skip>
            <Pager page={safePage} pages={pages} total={sorted.length} onPage={setPage} />
          </div>
        )}
      </SectionCard>
    </AppShell>
  );
}
