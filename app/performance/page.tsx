"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Building2, CircleDollarSign, FileSpreadsheet, MapPin, RefreshCcw, Upload, Users } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import { downloadCsv } from "../lib/csv";
import { readSession } from "../lib/session";
import { readXlsxRows, rowsToObjects } from "../lib/xlsx-lite";
import type { EarningAggregate, KpiAggregate, RiderDailyEarning, RiderDailyKpi } from "../lib/performance";

type EnrichedKpi = RiderDailyKpi & { franchise: string; station: string; riderId: string | null };
type EnrichedEarning = RiderDailyEarning & { franchise: string; station: string; riderId: string | null };
type GroupRow = KpiAggregate & { franchise?: string };
type EarningGroupRow = EarningAggregate & { franchise?: string };
type Payload = {
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
  { id: "franchises", label: "按加盟商", icon: Building2 },
  { id: "stations", label: "按站点", icon: MapPin },
  { id: "riders", label: "按骑手", icon: Users },
  { id: "earnings", label: "收入结算", icon: CircleDollarSign },
  { id: "import", label: "导入报表", icon: Upload },
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

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function weekdayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : WEEKDAYS[d.getUTCDay()];
}

function normalizeDate(value: string): string {
  const match = value.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function mapRecords(rows: Array<Record<string, string>>, mapping: Record<string, string>) {
  return rows
    .map((row) => {
      const record: Record<string, string> = {};
      for (const [header, field] of Object.entries(mapping)) {
        if (row[header] !== undefined) record[field] = row[header];
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

export default function PerformancePage() {
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
        title="T+1 考核看板"
        eyebrow={scopeStation ? `站点视角 · ${scopeStation}` : scopeFranchise ? `加盟商视角 · ${scopeFranchise}` : "Eastwind T+1 · 骑手/站点/加盟商三级 KPI"}
        action={
          <div className="flex gap-2">
            <button
              type="button"
              className="tag inline-flex items-center gap-1"
              onClick={() => {
                if (!data) return;
                downloadCsv(
                  `kpi-${data.date ?? "all"}`,
                  ["骑手", "99ID", "加盟商", "站点", "完单", "TSH", "AR%", "CAA", "超时", "报名时长"],
                  data.riders.map((r) => [r.riderName, r.rider99Id, r.franchise, r.station, r.completedOrders, r.tsh, r.ar, r.caa, r.overtime, r.signedShiftHours]),
                );
              }}
            >
              导出KPI
            </button>
            <button
              type="button"
              className="tag inline-flex items-center gap-1"
              onClick={() => {
                if (!data) return;
                downloadCsv(
                  `settlement-${data.date ?? "all"}`,
                  ["骑手", "99ID", "加盟商", "站点", "今日统计R$", "行程收入", "奖励", "小费", "完单", "结算金额R$"],
                  data.earnings.riders.map((r) => [r.riderName, r.rider99Id, r.franchise, r.station, r.total, r.tripIncome, r.bonus, r.tips, r.orders, r.settleAmount]),
                );
              }}
            >
              导出结算
            </button>
            <button type="button" onClick={() => void load(date)} className="tag inline-flex items-center gap-1">
              <RefreshCcw size={13} /> 刷新
            </button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-2 overflow-x-auto">
          {visibleTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-[8px] border px-4 text-xs font-black uppercase ${tab === id ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted-strong)]"}`}
            >
              <Icon size={15} />
              {label}
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
              <option key={item} value={item}>{item} {weekdayOf(item)}</option>
            ))}
          </select>
        )}
      </div>

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      {total && tab !== "import" && (
        <div className="mb-4 grid gap-3 md:grid-cols-7">
          {[
            ["骑手数", String(total.riders)],
            ["在线时长", total.onlineHours.toFixed(1)],
            ["完单", String(total.completedOrders)],
            ["报名时长", total.signedShiftHours.toFixed(1)],
          ].map(([label, value]) => (
            <div key={label} className="panel p-3 text-center">
              <div className="text-[10px] font-black uppercase text-[var(--muted)]">{label}</div>
              <div className="text-xl font-black">{value}</div>
            </div>
          ))}
          <div className="panel p-3 text-center"><div className="text-[10px] font-black uppercase text-[var(--muted)]">%TSH</div><div className="text-xl">{pct(total.tsh)}</div></div>
          <div className="panel p-3 text-center"><div className="text-[10px] font-black uppercase text-[var(--muted)]">AR</div><div className="text-xl">{pct(total.ar, "high", 95)}</div></div>
          <div className="panel p-3 text-center"><div className="text-[10px] font-black uppercase text-[var(--muted)]">CAA / 超时</div><div className="text-sm">{pct(total.caa, "low", 5)} / {pct(total.overtime, "low", 10)}</div></div>
        </div>
      )}

      {tab !== "import" && (!data || data.riders.length === 0) && (
        <div className="panel p-6 text-sm font-bold text-[var(--muted)]">
          还没有 T+1 数据。请到「导入 T+1 报表」粘贴 Eastwind 骑手报表。
        </div>
      )}

      {(tab === "franchises" || tab === "stations") && data && data.riders.length > 0 && (
        <GroupTable rows={tab === "franchises" ? data.franchises : data.stations} label={tab === "franchises" ? "加盟商" : "站点"} showFranchise={tab === "stations" && !scopeFranchise} />
      )}

      {tab === "riders" && data && data.riders.length > 0 && <RiderTable rows={data.riders} />}

      {tab === "earnings" && data && (
        <EarningsTab earnings={data.earnings} scopeFranchise={scopeFranchise} scopeStation={scopeStation} />
      )}

      {tab === "import" && <ImportTab headers={headers} onDone={(text) => { setMessage({ tone: "ok", text }); void load(); }} onError={(text) => setMessage({ tone: "err", text })} />}
    </AppShell>
  );
}

const money = (value: number) => `R$ ${value.toFixed(2)}`;

function EarningsTab({ earnings, scopeFranchise, scopeStation }: { earnings: Payload["earnings"]; scopeFranchise: string; scopeStation: string }) {
  if (earnings.riders.length === 0) {
    return <div className="panel p-6 text-sm font-bold text-[var(--muted)]">还没有收入数据。请到「导入报表」上传 Eastwind「Ganhos do entregador parceiro」表。</div>;
  }
  const total = earnings.total;
  const groups: Array<{ title: string; rows: EarningGroupRow[]; showFranchise: boolean }> = [];
  if (!scopeFranchise && !scopeStation) groups.push({ title: "按加盟商汇总（结算口径）", rows: earnings.franchises, showFranchise: false });
  if (!scopeStation) groups.push({ title: "按站点汇总", rows: earnings.stations, showFranchise: !scopeFranchise });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-6">
        {[
          ["骑手数", String(total.riders)],
          ["完单", String(total.orders)],
          ["今日统计", money(total.total)],
          ["行程收入", money(total.tripIncome)],
          ["奖励+小费", money(total.bonus + total.tips)],
        ].map(([label, value]) => (
          <div key={label} className="panel p-3 text-center">
            <div className="text-[10px] font-black uppercase text-[var(--muted)]">{label}</div>
            <div className="text-lg font-black">{value}</div>
          </div>
        ))}
        <div className="panel border-[var(--accent)] p-3 text-center">
          <div className="text-[10px] font-black uppercase text-[var(--accent)]">结算合计</div>
          <div className="text-lg font-black text-[var(--accent)]">{money(total.settleAmount)}</div>
        </div>
      </div>

      {groups.map(({ title, rows, showFranchise }) => (
        <div key={title} className="panel overflow-x-auto p-4">
          <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">{title}</div>
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="text-left text-[10px] font-black uppercase text-[var(--muted)]">
                <th className="pb-2">对象</th>
                {showFranchise && <th className="pb-2">所属加盟商</th>}
                <th className="pb-2 text-center">骑手数</th>
                <th className="pb-2 text-center">完单</th>
                <th className="pb-2 text-right">今日统计</th>
                <th className="pb-2 text-right">行程收入</th>
                <th className="pb-2 text-right">现金欠款</th>
                <th className="pb-2 text-right">扣款</th>
                <th className="pb-2 text-right">奖励</th>
                <th className="pb-2 text-right">小费</th>
                <th className="pb-2 text-right">结算金额</th>
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
        <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">骑手收入明细（结算金额取自源表「金额」列）</div>
        <table className="w-full min-w-[1150px] text-sm">
          <thead>
            <tr className="text-left text-[10px] font-black uppercase text-[var(--muted)]">
              <th className="pb-2">骑手</th>
              <th className="pb-2">99 ID</th>
              <th className="pb-2">PIX</th>
              <th className="pb-2">加盟商</th>
              <th className="pb-2">站点</th>
              <th className="pb-2 text-center">完单</th>
              <th className="pb-2 text-right">今日统计</th>
              <th className="pb-2 text-right">行程收入</th>
              <th className="pb-2 text-right">现金欠款</th>
              <th className="pb-2 text-right">餐损</th>
              <th className="pb-2 text-right">奖励</th>
              <th className="pb-2 text-right">小费</th>
              <th className="pb-2 text-right">调整</th>
              <th className="pb-2 text-right">推荐</th>
              <th className="pb-2 text-right">结算金额</th>
            </tr>
          </thead>
          <tbody>
            {earnings.riders.map((row) => (
              <tr key={row.id} className="border-t border-[var(--line)]">
                <td className="py-2 font-black">{row.riderName}{!row.riderId && <span className="ml-1"><Badge value="未建档" /></span>}</td>
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
  return (
    <div className="panel overflow-x-auto p-4">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="text-left text-[10px] font-black uppercase text-[var(--muted)]">
            <th className="pb-2">{label}</th>
            {showFranchise && <th className="pb-2">所属加盟商</th>}
            <th className="pb-2 text-center">骑手数</th>
            <th className="pb-2 text-center">在线时长</th>
            <th className="pb-2 text-center">完单</th>
            <th className="pb-2 text-center">报名班次</th>
            <th className="pb-2 text-center">报名时长</th>
            <th className="pb-2 text-center">实际在线</th>
            <th className="pb-2 text-center">%TSH</th>
            <th className="pb-2 text-center">AR</th>
            <th className="pb-2 text-center">CAA</th>
            <th className="pb-2 text-center">超时</th>
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
  return (
    <div className="panel overflow-x-auto p-4">
      <table className="w-full min-w-[1100px] text-sm">
        <thead>
          <tr className="text-left text-[10px] font-black uppercase text-[var(--muted)]">
            <th className="pb-2">骑手</th>
            <th className="pb-2">99 ID</th>
            <th className="pb-2">加盟商</th>
            <th className="pb-2">站点</th>
            <th className="pb-2 text-center">在线</th>
            <th className="pb-2 text-center">完单</th>
            <th className="pb-2 text-center">报名班次</th>
            <th className="pb-2 text-center">报名时长</th>
            <th className="pb-2 text-center">实际在线</th>
            <th className="pb-2 text-center">%TSH</th>
            <th className="pb-2 text-center">%TSH 重点</th>
            <th className="pb-2 text-center">AR</th>
            <th className="pb-2 text-center">CAA</th>
            <th className="pb-2 text-center">超时</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-[var(--line)]">
              <td className="py-2 font-black">{row.riderName}{row.riderId ? "" : " "}{!row.riderId && <Badge value="未建档" />}</td>
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
  const [raw, setRaw] = useState("");
  const [reportDate, setReportDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [busy, setBusy] = useState(false);
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
        const isEarnings = headerRow.some((cell) => cell.includes("行程收入"));
        const isKpi = headerRow.some((cell) => cell.includes("%TSH"));
        if (!isEarnings && !isKpi) {
          log.push(`✕ ${file.name}：无法识别表头（需要 Eastwind 骑手报表或收入表）`);
          continue;
        }
        const mapping = isEarnings ? EARNING_HEADERS : KPI_HEADERS;
        const records = mapRecords(objects, mapping);
        if (records.length === 0) {
          log.push(`✕ ${file.name}：没有可导入的骑手行`);
          continue;
        }
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
        log.push(`✓ ${file.name} → ${isEarnings ? "收入结算" : "KPI 绩效"} ${date}：${payload.data.parsed} 名骑手（新增 ${payload.data.created}，更新 ${payload.data.updated}）`);
      }
    } catch (error) {
      log.push(`✕ 解析失败：${(error as Error).message}`);
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
          <FileSpreadsheet size={15} /> 上传 Eastwind 表格（自动识别绩效表 / 收入表，可多选）
        </div>
        <div className="text-sm font-bold leading-6 text-[var(--muted-strong)]">
          支持「Desempenho do entregador parceiro」（绩效 KPI）与「Ganhos do entregador parceiro」（收入）两类 .xlsx，可同时选择两个文件一起上传。
          业务日期自动读取表内「日期」列；同一天重复上传会按骑手覆盖更新。结算金额直接取自表内「金额」列（按源数据显示，不做任何换算）。
        </div>
        <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-[8px] border-2 border-dashed border-[var(--line)] text-sm font-black text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]">
          <Upload size={20} />
          {busy ? "解析导入中..." : "点击选择 .xlsx 文件（可多选）"}
          <input type="file" accept=".xlsx" multiple className="hidden" disabled={busy} onChange={(e) => void importFiles(e.target.files)} />
        </label>
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
          <BarChart3 size={15} /> 或粘贴 Eastwind 骑手报表（网页整页复制）
        </div>
        <label className="block text-xs font-black uppercase text-[var(--muted)]">
          报表日期
          <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="mt-1 h-11 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
        </label>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={8}
          placeholder="粘贴 Eastwind 骑手报表内容..."
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
              onError(payload.error ?? `导入失败 (${response.status})`);
              return;
            }
            setRaw("");
            onDone(`已导入 ${reportDate}：解析 ${payload.data.parsed} 名骑手（新增 ${payload.data.created}，更新 ${payload.data.updated}）。`);
          }}
          className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-6 text-sm font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
        >
          <Upload size={16} /> {busy ? "导入中..." : "解析并导入"}
        </button>
      </div>
    </div>
  );
}
