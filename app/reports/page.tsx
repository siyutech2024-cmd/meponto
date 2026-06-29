"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Download, FileBarChart2, MapPin, RefreshCcw, Users } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
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

const HEADERS = { "Content-Type": "application/json" };
const money = (v: number) => `R$ ${v.toFixed(2)}`;
const r2 = (v: number) => Math.round(v * 100) / 100;
const input = "h-11 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--accent)]";

function mondayOf(date: Date): string {
  const d = new Date(date);
  const back = (d.getDay() - 1 + 7) % 7;
  d.setDate(d.getDate() - back);
  return d.toISOString().slice(0, 10);
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
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [dim, setDim] = useState<"franchise" | "station" | "rider">(scopeFranchise ? "station" : "franchise");
  const [loading, setLoading] = useState(false);

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

  const grouped = useMemo(() => {
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
    return [...map.values()].map((g) => ({ ...g, riderCount: g.riders.size, ar: g.arN ? Math.round((g.arSum / g.arN) * 10) / 10 : null })).sort((a, b) => b.settle - a.settle);
  }, [rows, dim]);

  const dims = (scopeFranchise ? [["station", t("rpByStation"), MapPin], ["rider", t("rpByRider"), Users]] : [["franchise", t("rpByFranchise"), Building2], ["station", t("rpByStation"), MapPin], ["rider", t("rpByRider"), Users]]) as Array<["franchise" | "station" | "rider", string, typeof Building2]>;

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

      {/* Range picker */}
      <div className="panel mb-4 flex flex-wrap items-center gap-3 p-3" data-i18n-skip>
        <FileBarChart2 size={16} className="text-[var(--accent)]" />
        <label className="flex items-center gap-2 text-xs font-black uppercase text-[var(--muted)]">
          {t("rpFrom")} <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-xs font-black uppercase text-[var(--muted)]">
          {t("rpTo")} <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <div className="flex gap-1.5">
          <button type="button" className="tag" onClick={() => { setFrom(mondayOf(new Date())); setTo(new Date().toISOString().slice(0, 10)); }}>{t("rpThisWeek")}</button>
          <button type="button" className="tag" onClick={() => { const d = new Date(); d.setDate(d.getDate() - 7); const start = mondayOf(d); const end = new Date(`${start}T12:00:00`); end.setDate(end.getDate() + 6); setFrom(start); setTo(end.toISOString().slice(0, 10)); }}>{t("rpLastWeek")}</button>
          <button type="button" className="tag" onClick={() => { const d = new Date(); d.setDate(d.getDate() - 29); setFrom(d.toISOString().slice(0, 10)); setTo(new Date().toISOString().slice(0, 10)); }}>{t("rp30d")}</button>
        </div>
        {loading && <span className="text-xs font-bold text-[var(--muted)]">{t("rpLoading")}</span>}
      </div>

      {/* Summary cards */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          [t("rpRiders"), String(summary.riders)],
          [t("rpOrdersSettle"), String(summary.orders)],
          [t("rpOrdersKpi"), String(summary.kpiOrders)],
          [t("rpAvgAr"), summary.ar !== null ? `${summary.ar}%` : "—"],
          [t("rpPaid"), money(summary.paid)],
        ].map(([label, value]) => (
          <div key={label} className="panel p-3 text-center">
            <div className="text-[10px] font-black uppercase text-[var(--muted)]">{label}</div>
            <div className="mt-1 text-lg font-black">{value}</div>
          </div>
        ))}
        <div className="panel border-[var(--accent)] p-3 text-center">
          <div className="text-[10px] font-black uppercase text-[var(--accent)]">{t("rpSettleTotal", { pending: money(summary.pending) })}</div>
          <div className="mt-1 text-lg font-black text-[var(--accent)]">{money(summary.settle)}</div>
        </div>
      </div>

      {/* Dimension switch + table */}
      <div className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {dims.map(([key, label, Icon]) => (
              <button key={key} type="button" onClick={() => setDim(key)} className={`inline-flex h-9 items-center gap-1.5 rounded-[8px] border px-3 text-xs font-black uppercase ${dim === key ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted-strong)]"}`}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="tag inline-flex items-center gap-1"
            onClick={() =>
              downloadCsv(
                `report-${dim}-${from}_${to}`,
                [t("rpColObject"), t("rpColSub"), t("rpRiders"), t("rpOrdersSettle"), t("rpOrdersKpi"), t("rpAvgAr"), t("rpSettle"), t("rpPaid"), t("rpPending")],
                grouped.map((g) => [g.key, g.sub, String(g.riderCount), String(g.orders), String(g.kpiOrders), g.ar ?? "", g.settle.toFixed(2), g.paid.toFixed(2), (g.settle - g.paid).toFixed(2)]),
              )
            }
          >
            <Download size={13} /> {t("rpExportTable")}
          </button>
        </div>
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm font-bold text-[var(--muted)]">{loading ? t("rpLoading") : t("rpNoData")}</div>
        ) : (
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-[var(--surface)]">
                <tr className="text-[10px] font-black uppercase text-[var(--muted)]">
                  <th className="pb-2">{dim === "franchise" ? t("rdColFranchise") : dim === "station" ? t("wlColStation") : t("rdColRider")}</th>
                  <th className="pb-2 text-right">{t("rpRiders")}</th>
                  <th className="pb-2 text-right">{t("rpOrdersSettle")}</th>
                  <th className="pb-2 text-right">{t("rpOrdersKpi")}</th>
                  <th className="pb-2 text-right">{t("rpAvgAr")}</th>
                  <th className="pb-2 text-right">{t("rpSettle")}</th>
                  <th className="pb-2 text-right">{t("rpPaid")}</th>
                  <th className="pb-2 text-right">{t("rpPending")}</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((g) => {
                  const pending = r2(g.settle - g.paid);
                  return (
                    <tr key={g.key + g.sub} className="border-t border-[var(--line)]">
                      <td className="py-2">
                        <div className="font-black">{g.key}</div>
                        {g.sub && <div className="text-[10px] font-bold text-[var(--muted)]">{g.sub}</div>}
                      </td>
                      <td className="py-2 text-right">{g.riderCount}</td>
                      <td className="py-2 text-right font-black">{g.orders}</td>
                      <td className="py-2 text-right">{g.kpiOrders}</td>
                      <td className="py-2 text-right">{g.ar !== null ? `${g.ar}%` : "—"}</td>
                      <td className="py-2 text-right font-black text-[var(--accent)]">{money(g.settle)}</td>
                      <td className="py-2 text-right text-[var(--ok-ink)]">{money(g.paid)}</td>
                      <td className={`py-2 text-right font-black ${pending > 0 ? "text-[var(--warning-ink)]" : "text-[var(--muted)]"}`}>{money(pending)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
