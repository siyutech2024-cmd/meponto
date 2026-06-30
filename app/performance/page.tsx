"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Building2, CircleDollarSign, FileSpreadsheet, MapPin, RefreshCcw, Upload, Users } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import { downloadCsv } from "../lib/csv";
import { useDialog } from "../components/dialog";
import { readSession } from "../lib/session";
import { readXlsxRows, rowsToObjects } from "../lib/xlsx-lite";
import type { EarningAggregate, KpiAggregate, RiderDailyEarning, RiderDailyKpi } from "../lib/performance";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";

function useT() {
  const language = useVentoStore((s) => s.language);
  return (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
}

type EnrichedKpi = RiderDailyKpi & { franchise: string; station: string; riderId: string | null };
type EnrichedEarning = RiderDailyEarning & { franchise: string; station: string; riderId: string | null };
type GroupRow = KpiAggregate & { franchise?: string };
type EarningGroupRow = EarningAggregate & { franchise?: string };
type Payload = {
  trend?: Array<{ date: string; orders: number; settle: number }>;
  date: string | null;
  dates: string[];
  riders: EnrichedKpi[];
  stations: GroupRow[];
  franchises: GroupRow[];
  total: KpiAggregate;
  earnings: {
    riders: EnrichedEarning[];
    stations: EarningGroupRow[];
    franchises: EarningGroupRow[];
    total: EarningAggregate;
  };
};

const tabs = [
  { id: "franchises", labelKey: "pfTabFranchises", icon: Building2 },
  { id: "stations", labelKey: "pfTabStations", icon: MapPin },
  { id: "riders", labelKey: "pfTabRiders", icon: Users },
  { id: "earnings", labelKey: "pfTabEarnings", icon: CircleDollarSign },
  { id: "import", labelKey: "pfTabImport", icon: Upload },
] as const;

/** Header → field mappings for the two Eastwind exports. */
const KPI_HEADERS: Record<string, string> = {
  "骑手ID": "rider99Id",
  "骑手的身份证": "cpf",
  "骑手姓名": "riderName",
  "电话号码": "phone",
  "城市": "city",
  "在线时长": "onlineHours",
  "完单数量": "completedOrders",
  "报名的班次数量": "signedShifts",
  "报名的班次总时长": "signedShiftHours",
  "班次内实际在线时长": "inShiftOnlineHours",
  "%TSH": "tsh",
  "%TSH in Critical Shifts": "tshCritical",
  "AR": "ar",
  "CAA": "caa",
  "Overtime": "overtime",
  "日期": "date",
};

const EARNING_HEADERS: Record<string, string> = {
  "城市": "city",
  "骑手ID": "rider99Id",
  "骑手姓名": "riderName",
  "骑手电话": "phone",
  "骑手身份证号": "cpf",
  "今日统计(R$)": "total",
  "行程收入(R$)": "tripIncome",
  "现金单欠款(R$)": "cashDebt",
  "餐损扣款(R$)": "mealDeduction",
  "奖励(R$)": "bonus",
  "其他(R$)": "other",
  "小费(R$)": "tips",
  "人工调整(R$)": "manualAdjust",
  "推荐奖励(R$)": "referralBonus",
  "日期": "date",
  "pix": "pix",
  "order": "orders",
  "金额": "settleAmount",
};

/** Fallback header matching — tolerates variants like 完单/order数/金额(R$)/Pedidos. */
const EARNING_PATTERNS: Array<[string, RegExp]> = [
  ["referralBonus", /推荐奖励/],
  ["bonus", /奖励/],
  ["tripIncome", /行程收入|total di[aá]rio/i],
  ["total", /今日统计/],
  ["cashDebt", /现金/],
  ["mealDeduction", /餐损/],
  ["tips", /小费|gorjeta/i],
  ["manualAdjust", /人工调整/],
  ["other", /其他/],
  ["orders", /order|完单|pedido/i],
  ["settleAmount", /^金额|结算金额|^valor/i],
  ["pix", /pix/i],
  ["date", /日期|^data/i],
  ["rider99Id", /骑手ID|司机ID/i],
  ["riderName", /骑手姓名|^nome/i],
  ["phone", /电话|telefone/i],
  ["cpf", /身份证|cpf/i],
  ["city", /城市|cidade/i],
];

const KPI_PATTERNS: Array<[string, RegExp]> = [
  ["inShiftOnlineHours", /实际在线/],
  ["signedShiftHours", /班次总时长/],
  ["signedShifts", /班次数量/],
  ["onlineHours", /在线时长/],
  ["completedOrders", /完单/],
  ["tshCritical", /critical/i],
  ["tsh", /tsh/i],
  ["ar", /^\s*ar\s*$/i],
  ["caa", /caa/i],
  ["overtime", /overtime|超时/i],
  ["date", /日期|^data/i],
  ["rider99Id", /骑手ID/i],
  ["riderName", /骑手姓名/i],
  ["phone", /电话/],
  ["cpf", /身份证/],
  ["city", /城市/],
];

const WEEKDAY_KEYS = ["pfWdSun", "pfWdMon", "pfWdTue", "pfWdWed", "pfWdThu", "pfWdFri", "pfWdSat"] as const;

function weekdayKeyOf(date: string): TranslationKey | "" {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : WEEKDAY_KEYS[d.getUTCDay()];
}

function normalizeDate(value: string): string {
  const match = value.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function mapRecords(rows: Array<Record<string, string>>, mapping: Record<string, string>, patterns: Array<[string, RegExp]>) {
  return rows
    .map((row) => {
      const record: Record<string, string> = {};
      for (const [header, value] of Object.entries(row)) {
        const trimmed = header.trim();
        let field = mapping[trimmed];
        if (!field) {
          field = patterns.find(([target, re]) => record[target] === undefined && re.test(trimmed))?.[0] ?? "";
        }
        if (field && record[field] === undefined) record[field] = value;
      }
      return record;
    })
    .map((record) => {
      // Excel re-saves can turn 15-digit ids into 6.50911E+14 or 650911...0 floats.
      const raw = record.rider99Id ?? "";
      if (raw && !/^\d{6,}$/.test(raw)) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed > 1e5) record.rider99Id = parsed.toFixed(0);
      }
      return record;
    })
    .filter((record) => /^\d{6,}$/.test(record.rider99Id ?? ""));
}

type TabId = (typeof tabs)[number]["id"];

function pct(value: number | null | undefined, good: "high" | "low" = "high", threshold = good === "high" ? 80 : 10): React.ReactElement {
  if (value === null || value === undefined) return <span className="text-[var(--muted)]">N/A</span>;
  const ok = good === "high" ? value >= threshold : value <= threshold;
  const cls = ok ? "text-[var(--ok-ink)]" : "text-[var(--danger-ink)]";
  return <span className={`font-black ${cls}`}>{value.toFixed(1)}%</span>;
}


function TrendChart({ trend }: { trend: Array<{ date: string; orders: number; settle: number }> }) {
  const t = useT();
  if (!trend || trend.length < 2) return null;
  const W = 720;
  const H = 120;
  const PAD = 6;
  const maxOrders = Math.max(...trend.map((t) => t.orders), 1);
  const maxSettle = Math.max(...trend.map((t) => t.settle), 1);
  const x = (i: number) => PAD + (i / (trend.length - 1)) * (W - PAD * 2);
  const yo = (v: number) => H - PAD - (v / maxOrders) * (H - PAD * 2);
  const ys = (v: number) => H - PAD - (v / maxSettle) * (H - PAD * 2);
  const line = (fn: (v: number) => number, key: "orders" | "settle") => trend.map((t, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${fn(t[key]).toFixed(1)}`).join(" ");
  return (
    <div className="panel mb-4 p-4">
      <div className="mb-1 flex items-center justify-between text-[10px] font-black uppercase text-[var(--muted)]">
        <span>{t("pfTrendDays", { n: trend.length })}</span>
        <span><span className="text-[var(--accent)]">―</span> {t("pfTrendOrders")} ｜ <span className="text-[#4dd9ff]">―</span> {t("pfTrendSettle")}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full">
        <path d={line(yo, "orders")} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
        <path d={line(ys, "settle")} fill="none" stroke="#4dd9ff" strokeWidth="2" strokeDasharray="1 0" opacity="0.85" strokeLinejoin="round" />
        {trend.map((t, i) => (
          <circle key={t.date} cx={x(i)} cy={yo(t.orders)} r="3" fill="var(--accent)" />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] font-bold text-[var(--muted)]">
        <span>{trend[0].date.slice(5)}</span>
        <span>{trend[trend.length - 1].date.slice(5)}{t("pfTrendLastLabel", { o: trend[trend.length - 1].orders, s: trend[trend.length - 1].settle.toFixed(0) })}</span>
      </div>
    </div>
  );
}

export default function PerformancePage() {
  const t = useT();
  const session = useMemo(() => readSession(), []);
  const scopeFranchise = session?.portal === "franchise" ? session.franchise || session.organization : "";
  const scopeStation = session?.portal === "ponto" ? session.station || session.organization : "";

  const [tab, setTab] = useState<TabId>(scopeStation ? "riders" : "franchises");
  const [data, setData] = useState<Payload | null>(null);
  const [date, setDate] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const headers = useMemo(
    () => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Super Admin" }),
    [session],
  );

  const load = useCallback(
    async (targetDate?: string) => {
      const params = new URLSearchParams();
      if (targetDate) params.set("date", targetDate);
      if (scopeFranchise) params.set("franchise", scopeFranchise);
      if (scopeStation) params.set("station", scopeStation);
      const response = await fetch(`/api/performance?${params}`, { headers, cache: "no-store" });
      const payload = await response.json();
      if (response.ok) {
        setData(payload.data);
        setDate(payload.data.date ?? "");
      }
    },
    [headers, scopeFranchise, scopeStation],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const visibleTabs = tabs.filter((item) => {
    if (item.id === "import" && (scopeFranchise || scopeStation)) return false; // 导入仅总部
    if (item.id === "franchises" && (scopeFranchise || scopeStation)) return false;
    if (item.id === "stations" && scopeStation) return false;
    return true;
  });

  const total = data?.total;

  return (
    <AppShell>
      <PageTitle
        title={t("pfTitle")}
        eyebrow={scopeStation ? t("pfEyebrowStation", { x: scopeStation }) : scopeFranchise ? t("pfEyebrowFranchise", { x: scopeFranchise }) : t("pfEyebrowDefault")}
        action={
          <div className="flex gap-2">
            <button
              type="button"
              className="tag inline-flex items-center gap-1"
              onClick={() => {
                if (!data) return;
                downloadCsv(
                  `kpi-${data.date ?? "all"}`,
                  [t("pfCsvDate"), t("pfCsvRider"), "99ID", "CPF", t("pfCsvPhone"), t("pfCsvCity"), t("pfCsvFranchise"), t("pfCsvStation"), t("pfCsvCompleted"), t("pfCsvOnlineH"), t("pfCsvSignedShifts"), t("pfCsvSignedH"), t("pfCsvInShift"), "%TSH", t("pfCsvTshKey"), "AR%", "CAA", t("pfCsvOvertime")],
                  data.riders.map((r) => [r.date, r.riderName, r.rider99Id, r.cpf ?? "", r.phone ?? "", r.city ?? "", r.franchise, r.station, r.completedOrders, r.onlineHours, r.signedShifts, r.signedShiftHours, r.inShiftOnlineHours, r.tsh, r.tshCritical, r.ar, r.caa, r.overtime]),
                );
              }}
            >
              {t("pfExportKpi")}
            </button>
            <button
              type="button"
              className="tag inline-flex items-center gap-1"
              onClick={() => {
                if (!data) return;
                downloadCsv(
                  `settlement-${data.date ?? "all"}`,
                  [t("pfCsvDate"), t("pfCsvRider"), "99ID", "CPF", "PIX", t("pfCsvPhone"), t("pfCsvFranchise"), t("pfCsvStation"), t("pfCsvCompleted"), t("pfCsvTodayR"), t("pfCsvTripInc"), t("pfCsvCashDebt"), t("pfCsvMeal"), t("pfCsvBonus"), t("pfCsvTips"), t("pfCsvManualAdj"), t("pfCsvReferral"), t("pfCsvOther"), t("pfCsvSettleR")],
                  data.earnings.riders.map((r) => [r.date, r.riderName, r.rider99Id, r.cpf ?? "", r.pix ?? "", r.phone ?? "", r.franchise, r.station, r.orders, r.total, r.tripIncome, r.cashDebt, r.mealDeduction, r.bonus, r.tips, r.manualAdjust, r.referralBonus, r.other, r.settleAmount]),
                );
              }}
            >
              {t("pfExportSettle")}
            </button>
            <button type="button" onClick={() => void load(date)} className="tag inline-flex items-center gap-1">
              <RefreshCcw size={13} /> {t("pfRefresh")}
            </button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-2 overflow-x-auto">
          {visibleTabs.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-[8px] border px-4 text-xs font-black uppercase ${tab === id ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted-strong)]"}`}
            >
              <Icon size={15} />
              {t(labelKey)}
            </button>
          ))}
        </div>
        {data && data.dates.length > 0 && (
          <select
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              void load(e.target.value);
            }}
            className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-black outline-none"
          >
            {data.dates.map((item) => (
              <option key={item} value={item}>{item} {(() => { const wk = weekdayKeyOf(item); return wk ? t(wk) : ""; })()}</option>
            ))}
          </select>
        )}
      </div>

      {data?.trend && <TrendChart trend={data.trend} />}

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      {total && tab !== "import" && (
        <div className="mb-4 grid gap-3 md:grid-cols-7">
          {[
            [t("pfRiders"), String(total.riders)],
            [t("pfOnlineHours"), total.onlineHours.toFixed(1)],
            [t("pfCompleted"), String(total.completedOrders)],
            [t("pfSignedHours"), total.signedShiftHours.toFixed(1)],
          ].map(([label, value]) => (
            <div key={label} className="panel p-3 text-center">
              <div className="text-[10px] font-black uppercase text-[var(--muted)]">{label}</div>
              <div className="text-xl font-black">{value}</div>
            </div>
          ))}
          <div className="panel p-3 text-center"><div className="text-[10px] font-black uppercase text-[var(--muted)]">%TSH</div><div className="text-xl">{pct(total.tsh)}</div></div>
          <div className="panel p-3 text-center"><div className="text-[10px] font-black uppercase text-[var(--muted)]">AR</div><div className="text-xl">{pct(total.ar, "high", 95)}</div></div>
          <div className="panel p-3 text-center"><div className="text-[10px] font-black uppercase text-[var(--muted)]">{t("pfCaaOvertime")}</div><div className="text-sm">{pct(total.caa, "low", 5)} / {pct(total.overtime, "low", 10)}</div></div>
        </div>
      )}

      {tab !== "import" && (!data || data.riders.length === 0) && (
        <div className="panel p-6 text-sm font-bold text-[var(--muted)]">
          {t("pfNoData")}
        </div>
      )}

      {(tab === "franchises" || tab === "stations") && data && data.riders.length > 0 && (
        <GroupTable rows={tab === "franchises" ? data.franchises : data.stations} label={tab === "franchises" ? t("pfFranchise") : t("pfStation")} showFranchise={tab === "stations" && !scopeFranchise} />
      )}

      {tab === "riders" && data && data.riders.length > 0 && <RiderTable rows={data.riders} />}

      {tab === "earnings" && data && (
        <EarningsTab earnings={data.earnings} scopeFranchise={scopeFranchise} scopeStation={scopeStation} date={data.date ?? ""} headers={headers} />
      )}

      {tab === "import" && <ImportTab headers={headers} onDone={(text) => { setMessage({ tone: "ok", text }); void load(); }} onError={(text) => setMessage({ tone: "err", text })} />}
    </AppShell>
  );
}

const money = (value: number) => `R$ ${value.toFixed(2)}`;

function EarningsTab({ earnings, scopeFranchise, scopeStation, date, headers }: { earnings: Payload["earnings"]; scopeFranchise: string; scopeStation: string; date: string; headers: Record<string, string> }) {
  const t = useT();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paidNames, setPaidNames] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // Riders already marked paid for this date (daily payment records).
  const loadPaid = useCallback(async () => {
    if (!date) return;
    const response = await fetch(`/api/wallet?payments=1&from=${date}&to=${date}`, { headers, cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    setPaidNames(new Set((payload.data as Array<{ target: string; refName: string }>).filter((p) => p.target === "rider").map((p) => p.refName)));
  }, [date, headers]);

  useEffect(() => {
    setSelected(new Set());
    void loadPaid();
  }, [loadPaid]);

  async function markPaid() {
    const rows = earnings.riders.filter((r) => selected.has(r.id) && !paidNames.has(r.riderName) && r.settleAmount > 0);
    const zero = earnings.riders.filter((r) => selected.has(r.id) && !paidNames.has(r.riderName) && r.settleAmount <= 0).length;
    if (rows.length === 0) {
      setNote({ tone: "err", text: zero > 0 ? t("pfErrZeroSettle", { n: zero }) : t("pfErrSelectRiders") });
      return;
    }
    setBusy(true);
    let failed = 0;
    for (const row of rows) {
      const response = await fetch("/api/wallet", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "recordPayment", target: "rider", refName: row.riderName, franchise: row.franchise, amount: row.settleAmount, period: "daily", weekFrom: date, weekTo: date, note: t("pfPayNote", { date }) }),
      });
      if (!response.ok) failed += 1;
    }
    setBusy(false);
    setSelected(new Set());
    void loadPaid();
    setNote(failed ? { tone: "err", text: t("pfMarkedFailed", { ok: rows.length - failed, failed }) } : { tone: "ok", text: t("pfMarkedPaid", { n: rows.length, date, zero: zero ? t("pfMarkedSkip", { n: zero }) : "" }) });
  }

  const toggle = (id: string) => setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const selectableRows = earnings.riders.filter((r) => !paidNames.has(r.riderName));
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.id));

  if (earnings.riders.length === 0) {
    return <div className="panel p-6 text-sm font-bold text-[var(--muted)]">{t("pfNoEarnings")}</div>;
  }
  const total = earnings.total;
  const brokenSettle = total.settleAmount === 0 && total.total > 0;
  const groups: Array<{ title: string; rows: EarningGroupRow[]; showFranchise: boolean }> = [];
  if (!scopeFranchise && !scopeStation) groups.push({ title: t("pfGroupByFranchise"), rows: earnings.franchises, showFranchise: false });
  if (!scopeStation) groups.push({ title: t("pfGroupByStation"), rows: earnings.stations, showFranchise: !scopeFranchise });

  return (
    <div className="space-y-4">
      {brokenSettle && (
        <div className="rounded-[8px] border border-[var(--warning)] bg-[var(--warning-bg)] px-4 py-3 text-sm font-black text-[var(--warning-ink)]">
          {t("pfBrokenSettle")}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-6">
        {[
          [t("pfRiders"), String(total.riders)],
          [t("pfCompleted"), String(total.orders)],
          [t("pfEarnTotal"), money(total.total)],
          [t("pfTripIncome"), money(total.tripIncome)],
          [t("pfBonusTips"), money(total.bonus + total.tips)],
        ].map(([label, value]) => (
          <div key={label} className="panel p-3 text-center">
            <div className="text-[10px] font-black uppercase text-[var(--muted)]">{label}</div>
            <div className="text-lg font-black">{value}</div>
          </div>
        ))}
        <div className="panel border-[var(--accent)] p-3 text-center">
          <div className="text-[10px] font-black uppercase text-[var(--accent)]">{t("pfSettleSum")}</div>
          <div className="text-lg font-black text-[var(--accent)]">{money(total.settleAmount)}</div>
        </div>
      </div>

      {groups.map(({ title, rows, showFranchise }) => (
        <div key={title} className="panel overflow-x-auto p-4">
          <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">{title}</div>
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="text-left text-[10px] font-black uppercase text-[var(--muted)]">
                <th className="pb-2">{t("pfHObject")}</th>
                {showFranchise && <th className="pb-2">{t("pfBelongFranchise")}</th>}
                <th className="pb-2 text-center">{t("pfRiders")}</th>
                <th className="pb-2 text-center">{t("pfCompleted")}</th>
                <th className="pb-2 text-right">{t("pfEarnTotal")}</th>
                <th className="pb-2 text-right">{t("pfTripIncome")}</th>
                <th className="pb-2 text-right">{t("pfHCashDebt")}</th>
                <th className="pb-2 text-right">{t("pfHDeduction")}</th>
                <th className="pb-2 text-right">{t("pfHBonus")}</th>
                <th className="pb-2 text-right">{t("pfHTips")}</th>
                <th className="pb-2 text-right">{t("pfHSettle")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-[var(--line)]">
                  <td className="py-2 font-black">{row.key}</td>
                  {showFranchise && <td className="py-2"><span className="tag">{row.franchise}</span></td>}
                  <td className="py-2 text-center">{row.riders}</td>
                  <td className="py-2 text-center font-bold">{row.orders}</td>
                  <td className="py-2 text-right">{money(row.total)}</td>
                  <td className="py-2 text-right">{money(row.tripIncome)}</td>
                  <td className="py-2 text-right">{row.cashDebt ? <span className="text-[var(--danger-ink)]">{money(row.cashDebt)}</span> : "-"}</td>
                  <td className="py-2 text-right">{row.mealDeduction ? money(row.mealDeduction) : "-"}</td>
                  <td className="py-2 text-right">{row.bonus ? money(row.bonus) : "-"}</td>
                  <td className="py-2 text-right">{row.tips ? money(row.tips) : "-"}</td>
                  <td className="py-2 text-right font-black text-[var(--accent)]">{money(row.settleAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="panel overflow-x-auto p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-black uppercase text-[var(--accent)]">{t("pfDetailTitle", { date: date || t("pfAllDates") })}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="tag"
              onClick={() =>
                downloadCsv(
                  `pagamento-${date || "all"}`,
                  [t("pfCsvDate"), t("pfCsvRider"), "99ID", "CPF", t("pfCsvPhone"), "PIX", t("pfCsvFranchise"), t("pfCsvStation"), t("pfCsvCompleted"), t("pfCsvTodayTotal"), t("pfCsvTripInc"), t("pfCsvCashDebt"), t("pfCsvMeal"), t("pfCsvBonus"), t("pfCsvTips"), t("pfCsvManualAdj"), t("pfCsvReferral"), t("pfCsvOther"), t("pfCsvSettle"), t("pfCsvPayStatus")],
                  earnings.riders.map((r) => [date, r.riderName, r.rider99Id, r.cpf ?? "", r.phone ?? "", r.pix, r.franchise, r.station, String(r.orders), r.total.toFixed(2), r.tripIncome.toFixed(2), r.cashDebt.toFixed(2), r.mealDeduction.toFixed(2), r.bonus.toFixed(2), r.tips.toFixed(2), r.manualAdjust.toFixed(2), r.referralBonus.toFixed(2), r.other.toFixed(2), r.settleAmount.toFixed(2), paidNames.has(r.riderName) ? t("pfPaid") : t("pfUnpaid")]),
                )
              }
            >
              {t("pfExportPayment")}
            </button>
            <button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => void markPaid()}
              className="inline-flex h-9 items-center rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] disabled:opacity-40"
            >
              {t("pfMarkPaidBulk", { n: selected.size })}
            </button>
          </div>
        </div>
        {note && (
          <div className={`mb-3 rounded-[8px] border px-3 py-2 text-xs font-black ${note.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>{note.text}</div>
        )}
        <table className="w-full min-w-[1220px] text-sm">
          <thead>
            <tr className="text-left text-[10px] font-black uppercase text-[var(--muted)]">
              <th className="pb-2">
                <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? new Set(selectableRows.map((r) => r.id)) : new Set())} />
              </th>
              <th className="pb-2">{t("pfRider")}</th>
              <th className="pb-2">99 ID</th>
              <th className="pb-2">PIX</th>
              <th className="pb-2">{t("pfFranchise")}</th>
              <th className="pb-2">{t("pfStation")}</th>
              <th className="pb-2 text-center">{t("pfCompleted")}</th>
              <th className="pb-2 text-right">{t("pfEarnTotal")}</th>
              <th className="pb-2 text-right">{t("pfTripIncome")}</th>
              <th className="pb-2 text-right">{t("pfHCashDebt")}</th>
              <th className="pb-2 text-right">{t("pfHMeal")}</th>
              <th className="pb-2 text-right">{t("pfHBonus")}</th>
              <th className="pb-2 text-right">{t("pfHTips")}</th>
              <th className="pb-2 text-right">{t("pfHAdjust")}</th>
              <th className="pb-2 text-right">{t("pfHReferral")}</th>
              <th className="pb-2 text-right">{t("pfHSettle")}</th>
            </tr>
          </thead>
          <tbody>
            {earnings.riders.map((row) => (
              <tr key={row.id} className={`border-t border-[var(--line)] ${paidNames.has(row.riderName) ? "opacity-60" : ""}`}>
                <td className="py-2">
                  {paidNames.has(row.riderName) ? (
                    <span className="text-[10px] font-black uppercase text-[var(--ok-ink)]">{t("pfPaid")}</span>
                  ) : (
                    <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                  )}
                </td>
                <td className="py-2 font-black">{row.riderName}{!row.riderId && <span className="ml-1"><Badge value={t("pfUnregistered")} /></span>}</td>
                <td className="py-2 text-[11px] font-bold text-[var(--muted)]">{row.rider99Id}</td>
                <td className="py-2 text-[11px] font-bold">{row.pix || "-"}</td>
                <td className="py-2"><span className="tag">{row.franchise}</span></td>
                <td className="py-2"><span className="tag">{row.station}</span></td>
                <td className="py-2 text-center font-bold">{row.orders}</td>
                <td className="py-2 text-right">{money(row.total)}</td>
                <td className="py-2 text-right">{money(row.tripIncome)}</td>
                <td className="py-2 text-right">{row.cashDebt ? <span className="text-[var(--danger-ink)]">{money(row.cashDebt)}</span> : "-"}</td>
                <td className="py-2 text-right">{row.mealDeduction ? money(row.mealDeduction) : "-"}</td>
                <td className="py-2 text-right">{row.bonus ? money(row.bonus) : "-"}</td>
                <td className="py-2 text-right">{row.tips ? money(row.tips) : "-"}</td>
                <td className="py-2 text-right">{row.manualAdjust ? money(row.manualAdjust) : "-"}</td>
                <td className="py-2 text-right">{row.referralBonus ? money(row.referralBonus) : "-"}</td>
                <td className="py-2 text-right font-black text-[var(--accent)]">{money(row.settleAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupTable({ rows, label, showFranchise }: { rows: GroupRow[]; label: string; showFranchise: boolean }) {
  const t = useT();
  return (
    <div className="panel overflow-x-auto p-4">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="text-left text-[10px] font-black uppercase text-[var(--muted)]">
            <th className="pb-2">{label}</th>
            {showFranchise && <th className="pb-2">{t("pfBelongFranchise")}</th>}
            <th className="pb-2 text-center">{t("pfRiders")}</th>
            <th className="pb-2 text-center">{t("pfOnlineHours")}</th>
            <th className="pb-2 text-center">{t("pfCompleted")}</th>
            <th className="pb-2 text-center">{t("pfHSignedShifts")}</th>
            <th className="pb-2 text-center">{t("pfSignedHours")}</th>
            <th className="pb-2 text-center">{t("pfHActualOnline")}</th>
            <th className="pb-2 text-center">%TSH</th>
            <th className="pb-2 text-center">AR</th>
            <th className="pb-2 text-center">CAA</th>
            <th className="pb-2 text-center">{t("pfCsvOvertime")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-[var(--line)]">
              <td className="py-2 font-black">{row.key}</td>
              {showFranchise && <td className="py-2"><span className="tag">{row.franchise}</span></td>}
              <td className="py-2 text-center font-bold">{row.riders}</td>
              <td className="py-2 text-center">{row.onlineHours.toFixed(1)}</td>
              <td className="py-2 text-center font-black">{row.completedOrders}</td>
              <td className="py-2 text-center">{row.signedShifts}</td>
              <td className="py-2 text-center">{row.signedShiftHours.toFixed(1)}</td>
              <td className="py-2 text-center">{row.inShiftOnlineHours.toFixed(1)}</td>
              <td className="py-2 text-center">{pct(row.tsh)}</td>
              <td className="py-2 text-center">{pct(row.ar, "high", 95)}</td>
              <td className="py-2 text-center">{pct(row.caa, "low", 5)}</td>
              <td className="py-2 text-center">{pct(row.overtime, "low", 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RiderTable({ rows }: { rows: EnrichedKpi[] }) {
  const t = useT();
  return (
    <div className="panel overflow-x-auto p-4">
      <table className="w-full min-w-[1100px] text-sm">
        <thead>
          <tr className="text-left text-[10px] font-black uppercase text-[var(--muted)]">
            <th className="pb-2">{t("pfRider")}</th>
            <th className="pb-2">99 ID</th>
            <th className="pb-2">{t("pfFranchise")}</th>
            <th className="pb-2">{t("pfStation")}</th>
            <th className="pb-2 text-center">{t("pfOnline")}</th>
            <th className="pb-2 text-center">{t("pfCompleted")}</th>
            <th className="pb-2 text-center">{t("pfHSignedShifts")}</th>
            <th className="pb-2 text-center">{t("pfSignedHours")}</th>
            <th className="pb-2 text-center">{t("pfHActualOnline")}</th>
            <th className="pb-2 text-center">%TSH</th>
            <th className="pb-2 text-center">{t("pfTshKey")}</th>
            <th className="pb-2 text-center">AR</th>
            <th className="pb-2 text-center">CAA</th>
            <th className="pb-2 text-center">{t("pfCsvOvertime")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-[var(--line)]">
              <td className="py-2 font-black">{row.riderName}{row.riderId ? "" : " "}{!row.riderId && <Badge value={t("pfUnregistered")} />}</td>
              <td className="py-2 text-[11px] font-bold text-[var(--muted)]">{row.rider99Id}</td>
              <td className="py-2"><span className="tag">{row.franchise}</span></td>
              <td className="py-2"><span className="tag">{row.station}</span></td>
              <td className="py-2 text-center">{row.onlineHours.toFixed(1)}</td>
              <td className="py-2 text-center font-black">{row.completedOrders}</td>
              <td className="py-2 text-center">{row.signedShifts}</td>
              <td className="py-2 text-center">{row.signedShiftHours.toFixed(1)}</td>
              <td className="py-2 text-center">{row.inShiftOnlineHours.toFixed(1)}</td>
              <td className="py-2 text-center">{pct(row.tsh)}</td>
              <td className="py-2 text-center">{pct(row.tshCritical)}</td>
              <td className="py-2 text-center">{pct(row.ar, "high", 95)}</td>
              <td className="py-2 text-center">{pct(row.caa, "low", 5)}</td>
              <td className="py-2 text-center">{pct(row.overtime, "low", 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportTab({ headers, onDone, onError }: { headers: Record<string, string>; onDone: (text: string) => void; onError: (text: string) => void }) {
  const t = useT();
  const dialog = useDialog();
  const [raw, setRaw] = useState("");
  const [reportDate, setReportDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [busy, setBusy] = useState(false);
  const [pixText, setPixText] = useState("");
  const [fileLog, setFileLog] = useState<string[]>([]);

  async function importFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    const log: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const rows = await readXlsxRows(await file.arrayBuffer());
        const headerRow = rows[0] ?? [];
        const objects = rowsToObjects(rows);
        const isEarnings = headerRow.some((cell) => cell.includes("行程收入") || /ganhos de viagem|renda de viagem|corridas\s*\(r\$\)/i.test(cell));
        const isKpi = headerRow.some((cell) => cell.includes("%TSH"));
        const isPix = !isEarnings && !isKpi && headerRow.some((cell) => /pix|chave/i.test(cell));
        if (isPix) {
          // Standalone PIX sheet: any columns with 99ID/CPF/姓名 + PIX.
          const pixRecords = objects
            .map((row) => {
              const record: Record<string, string> = {};
              for (const [header, value] of Object.entries(row)) {
                const h = header.trim();
                if (/pix|chave/i.test(h) && record.pix === undefined) record.pix = value;
                else if (/骑手ID|司机ID|99/i.test(h) && record.rider99Id === undefined) record.rider99Id = value;
                else if (/cpf|身份证/i.test(h) && record.cpf === undefined) record.cpf = value;
                else if (/姓名|nome|name/i.test(h) && record.riderName === undefined) record.riderName = value;
              }
              return record;
            })
            .filter((record) => (record.pix ?? "").trim());
          if (pixRecords.length === 0) {
            log.push(t("pfLogNoPix", { file: file.name }));
            continue;
          }
          const response = await fetch("/api/performance", { method: "POST", headers, body: JSON.stringify({ action: "importPixRecords", records: pixRecords }) });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            log.push(`✕ ${file.name}：${payload.error ?? response.status}`);
            continue;
          }
          log.push(t("pfLogPixDone", { file: file.name, n: payload.data.matched, un: payload.data.unmatched.length > 0 ? t("pfImpUnmatched", { n: payload.data.unmatched.length, list: payload.data.unmatched.slice(0, 5).join("、") }) : "" }));
          continue;
        }
        if (!isEarnings && !isKpi) {
          log.push(t("pfLogUnrecognized", { file: file.name, headers: headerRow.filter(Boolean).join(" | ").slice(0, 300) }));
          continue;
        }
        const mapping = isEarnings ? EARNING_HEADERS : KPI_HEADERS;
        const records = mapRecords(objects, mapping, isEarnings ? EARNING_PATTERNS : KPI_PATTERNS);
        if (records.length === 0) {
          const sample = objects[0] ? Object.entries(objects[0]).slice(0, 6).map(([k, v]) => `${k}=${v}`).join(", ") : "(no rows)";
          log.push(t("pfLogNoRows", { file: file.name, headers: headerRow.filter(Boolean).join(" | ").slice(0, 200), sample: String(sample).slice(0, 200) }));
          continue;
        }
        // Raw Eastwind export has no 金额/order columns — the server fills
        // orders from the same-day KPI sheet and computes 金额 = 今日统计 + 完单×单价.
        const rawExport = isEarnings && records.every((r) => r.settleAmount === undefined);
        // Business date comes from the sheet's own 日期 column.
        const date = normalizeDate(records[0].date ?? "") || reportDate;
        const response = await fetch("/api/performance", {
          method: "POST",
          headers,
          body: JSON.stringify({ action: isEarnings ? "importEarnings" : "importKpiRecords", date, records }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          log.push(`✕ ${file.name}：${payload.error ?? response.status}`);
          continue;
        }
        log.push(t("pfLogImportDone", { file: file.name, kind: isEarnings ? t("pfKindEarnings") : t("pfKindKpi"), date, parsed: payload.data.parsed, created: payload.data.created, updated: payload.data.updated, note: rawExport ? t("pfRawExportNote") : "" }));
      }
    } catch (error) {
      log.push(t("pfLogImportError", { msg: (error as Error).message }));
    }
    setFileLog(log);
    setBusy(false);
    if (log.some((line) => line.startsWith("✓"))) onDone(log.filter((line) => line.startsWith("✓")).join("；"));
    else if (log.length > 0) onError(log.join("；"));
  }

  return (
    <div className="space-y-4">
      <div className="panel space-y-3 p-5">
        <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]">
          <FileSpreadsheet size={15} /> {t("pfImpUploadTitle")}
        </div>
        <div className="text-sm font-bold leading-6 text-[var(--muted-strong)]">
          {t("pfImpDesc")}
        </div>
        <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-[8px] border-2 border-dashed border-[var(--line)] text-sm font-black text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]">
          <Upload size={20} />
          {busy ? t("pfImpParsing") : t("pfImpPickFile")}
          <input type="file" accept=".xlsx" multiple className="hidden" disabled={busy} onChange={(e) => void importFiles(e.target.files)} />
        </label>
        <div className="space-y-2 border-t border-[var(--line)] pt-3">
          <div className="text-xs font-black uppercase text-[var(--accent)]">{t("pfImpPixTitle")}</div>
          <textarea
            value={pixText}
            onChange={(e) => setPixText(e.target.value)}
            placeholder={t("pfImpPixPlaceholder")}
            className="min-h-28 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-xs leading-5 outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            disabled={busy || !pixText.trim()}
            className="inline-flex h-10 items-center rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"
            onClick={async () => {
              const lines = pixText.split("\n").map((line) => line.trim()).filter(Boolean);
              const records = lines
                .map((line) => {
                  const match = line.match(/(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2})/);
                  const cpf = match ? match[1] : "";
                  const pix = line.replace(match?.[0] ?? "", "").replace(/^[\s,;|\t-]+|[\s,;|\t]+$/g, "").trim();
                  return { cpf, pix };
                })
                .filter((record) => record.cpf && record.pix);
              if (records.length === 0) {
                onError(t("pfImpPixErr"));
                return;
              }
              setBusy(true);
              const response = await fetch("/api/performance", { method: "POST", headers, body: JSON.stringify({ action: "importPixRecords", records }) });
              const payload = await response.json().catch(() => ({}));
              setBusy(false);
              if (!response.ok) {
                onError(payload.error ?? t("pfImpPixFail"));
                return;
              }
              setPixText("");
              onDone(t("pfImpPixDone", { n: payload.data.matched, un: payload.data.unmatched.length > 0 ? t("pfImpUnmatched", { n: payload.data.unmatched.length, list: payload.data.unmatched.slice(0, 5).join("、") }) : "" }));
            }}
          >
            {t("pfImpPixBtn")}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
          <button
            type="button"
            className="tag"
            disabled={busy}
            onClick={async () => {
              const response = await fetch("/api/performance", { method: "POST", headers, body: JSON.stringify({ action: "syncRiderContacts" }) });
              const payload = await response.json().catch(() => ({}));
              if (response.ok) onDone(t("pfImpBackfillDone", { n: payload.data.filled }));
              else onError(payload.error ?? t("pfImpSyncFail"));
            }}
          >
            {t("pfImpBackfill")}
          </button>
          <label className="flex items-center gap-2 text-[11px] font-bold text-[var(--muted)]">
            {t("pfImpClearDay")}
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-xs font-bold outline-none" />
          </label>
          <button
            type="button"
            className="tag text-[var(--danger-ink)]"
            disabled={busy}
            onClick={async () => {
              if (!(await dialog.confirm(t("pfImpClearConfirm", { date: reportDate }), { message: t("pfImpClearMsg"), tone: "danger", confirmText: t("pfImpClearConfirmBtn") }))) return;
              const response = await fetch("/api/performance", { method: "POST", headers, body: JSON.stringify({ action: "purgeDate", date: reportDate }) });
              const payload = await response.json().catch(() => ({}));
              if (response.ok) onDone(t("pfImpClearDone", { date: reportDate, kpi: payload.data.kpiRemoved, earn: payload.data.earningsRemoved }));
              else onError(payload.error ?? t("pfImpClearFail"));
            }}
          >
            {t("pfImpClearBtn")}
          </button>
        </div>
        {fileLog.length > 0 && (
          <div className="space-y-1 text-sm font-bold">
            {fileLog.map((line) => (
              <div key={line} className={line.startsWith("✓") ? "text-[var(--ok-ink)]" : "text-[var(--danger-ink)]"}>{line}</div>
            ))}
          </div>
        )}
      </div>

      <div className="panel space-y-3 p-5">
        <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]">
          <BarChart3 size={15} /> {t("pfImpPasteTitle")}
        </div>
        <label className="block text-xs font-black uppercase text-[var(--muted)]">
          {t("pfImpReportDate")}
          <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="mt-1 h-11 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
        </label>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={8}
          placeholder={t("pfImpPastePlaceholder")}
          className="w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-xs outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          disabled={busy || !raw.trim()}
          onClick={async () => {
            setBusy(true);
            const response = await fetch("/api/performance", { method: "POST", headers, body: JSON.stringify({ action: "import", raw, date: reportDate }) });
            const payload = await response.json().catch(() => ({}));
            setBusy(false);
            if (!response.ok) {
              onError(payload.error ?? t("pfImpImportFail", { status: response.status }));
              return;
            }
            setRaw("");
            onDone(t("pfImpImportDone", { date: reportDate, parsed: payload.data.parsed, created: payload.data.created, updated: payload.data.updated }));
          }}
          className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-6 text-sm font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
        >
          <Upload size={16} /> {busy ? t("pfImpImporting") : t("pfImpParseImport")}
        </button>
      </div>
    </div>
  );
}
