"use client";

import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { BarChart3, Building2, CircleDollarSign, FileSpreadsheet, MapPin, RefreshCcw, Upload, Users } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
import { Chip, DataTable, Drawer, Pager, SearchInput, SectionCard, Stat, StatusBadge, TodoCard, Toolbar, type BadgeTone, type DataColumn, type SortState } from "../components/kit";
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
  trend?: Array<{ date: string; orders: number; proOrders?: number; settle: number }>;
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

const fmtPct = (value: number | null | undefined) => (value === null || value === undefined ? "N/A" : `${value.toFixed(1)}%`);

function pctTone(value: number | null | undefined, good: "high" | "low" = "high", threshold = good === "high" ? 80 : 10): BadgeTone {
  if (value === null || value === undefined) return "neutral";
  return (good === "high" ? value >= threshold : value <= threshold) ? "success" : "danger";
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

function toggleSort(setSort: React.Dispatch<React.SetStateAction<SortState>>) {
  return (key: string) => setSort((prev) => (prev?.key === key ? (prev.dir === -1 ? { key, dir: 1 } : null) : { key, dir: -1 }));
}

function DetailRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-2 text-sm">
      <span className="text-[11px] font-bold uppercase text-[var(--muted)]">{label}</span>
      <span className="text-right font-black">{value}</span>
    </div>
  );
}

function TrendChart({ trend }: { trend: Array<{ date: string; orders: number; proOrders?: number; settle: number }> }) {
  const t = useT();
  if (!trend || trend.length < 2) return null;
  const W = 720;
  const H = 120;
  const PAD = 6;
  // PRO 数据没进来之前不画金线、不占图例 —— 一条贴着 0 的线只会引人来问。
  const hasPro = trend.some((point) => (point.proOrders ?? 0) > 0);
  const maxOrders = Math.max(...trend.map((t) => t.orders), 1);
  const maxSettle = Math.max(...trend.map((t) => t.settle), 1);
  const x = (i: number) => PAD + (i / (trend.length - 1)) * (W - PAD * 2);
  const yo = (v: number) => H - PAD - (v / maxOrders) * (H - PAD * 2);
  const ys = (v: number) => H - PAD - (v / maxSettle) * (H - PAD * 2);
  // PRO 曲线与总完单共用同一坐标轴(maxOrders):PRO 是总数的**其中一部分**,
  // 同轴才能直接读出占比;单独一根轴会把两条线画得一样高,反而误导。
  const line = (fn: (v: number) => number, pick: (p: (typeof trend)[number]) => number) =>
    trend.map((point, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${fn(pick(point)).toFixed(1)}`).join(" ");
  const last = trend[trend.length - 1];
  return (
    <div className="panel mb-4 p-4">
      <div className="mb-1 flex items-center justify-between text-[10px] font-black uppercase text-[var(--muted)]">
        <span>{t("pfTrendDays", { n: trend.length })}</span>
        <span>
          <span className="text-[var(--accent)]">―</span> {t("pfTrendOrders")}
          {hasPro && <> ｜ <span style={{ color: "#eda100" }}>―</span> PRO</>}
          {" ｜ "}<span className="text-[#4dd9ff]">―</span> {t("pfTrendSettle")}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full">
        <path d={line(yo, (p) => p.orders)} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
        <path d={line(ys, (p) => p.settle)} fill="none" stroke="#4dd9ff" strokeWidth="2" strokeDasharray="1 0" opacity="0.85" strokeLinejoin="round" />
        {hasPro && (
          <path d={line(yo, (p) => p.proOrders ?? 0)} fill="none" stroke="#eda100" strokeWidth="2.5" strokeLinejoin="round" />
        )}
        {trend.map((point, i) => (
          <circle key={point.date} cx={x(i)} cy={yo(point.orders)} r="3" fill="var(--accent)" />
        ))}
        {hasPro && trend.map((point, i) => (
          <circle key={`pro-${point.date}`} cx={x(i)} cy={yo(point.proOrders ?? 0)} r="2.5" fill="#eda100" />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] font-bold text-[var(--muted)]">
        <span>{trend[0].date.slice(5)}</span>
        <span>
          {last.date.slice(5)}{t("pfTrendLastLabel", { o: last.orders, s: last.settle.toFixed(0) })}
          {hasPro && <span className="font-black" style={{ color: "#eda100" }}> ｜ PRO {last.proOrders ?? 0}</span>}
        </span>
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
  /**
   * 模式二 · KPI 看板分池。"" = 全部(与改动前完全一致)。
   * PRO 行金额为 0,混在一起看会把加盟商/站点的人均收入拉垮 —— 分开看才是真数。
   */
  const [account, setAccount] = useState<"" | "main" | "pro">("");
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
      if (account) params.set("account", account);
      const response = await fetch(`/api/performance?${params}`, { headers, cache: "no-store" });
      const payload = await response.json();
      if (response.ok) {
        setData(payload.data);
        setDate(payload.data.date ?? "");
      }
    },
    [headers, scopeFranchise, scopeStation, account],
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

  // 当日 PRO 小计。从已按视角过滤过的骑手行现算 —— 加盟商/站点登录时

  // 服务端已只返回自家骑手,这里不用再判断 scope。

  const proDay = useMemo(() => {

    const rows = (data?.riders ?? []).filter((row) => row.account === "pro");

    return { riders: rows.length, orders: rows.reduce((sum, row) => sum + (row.completedOrders ?? 0), 0) };

  }, [data]);
  const caaTone = total ? pctTone(total.caa, "low", 5) : "neutral";
  const otTone = total ? pctTone(total.overtime, "low", 10) : "neutral";
  const comboTone: BadgeTone = caaTone === "danger" || otTone === "danger" ? "danger" : caaTone === "neutral" && otTone === "neutral" ? "neutral" : "success";

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

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      {/* Stat row — day totals。PRO 有数据时在卡片里金色单列一行 ——
          "其中 PRO 多少",不另开卡:PRO 是总数的一部分,拆成第八张卡
          会让人把两个数相加。加盟商/站点视角走同一段代码,自动同步。 */}
      {total && tab !== "import" && (
        <section className="mb-4 grid gap-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
          <Stat
            label={t("pfRiders")}
            value={String(total.riders)}
            hint={proDay.riders > 0 ? <span className="font-black" style={{ color: "#eda100" }}>PRO {proDay.riders}</span> : undefined}
          />
          <Stat label={t("pfOnlineHours")} value={total.onlineHours.toFixed(1)} />
          <Stat
            label={t("pfCompleted")}
            value={String(total.completedOrders)}
            hint={proDay.riders > 0 ? <span className="font-black" style={{ color: "#eda100" }}>PRO {proDay.orders}</span> : undefined}
          />
          <Stat label={t("pfSignedHours")} value={total.signedShiftHours.toFixed(1)} />
          <TodoCard label="%TSH" value={fmtPct(total.tsh)} tone={pctTone(total.tsh)} />
          <TodoCard label="AR" value={fmtPct(total.ar)} tone={pctTone(total.ar, "high", 95)} />
          <TodoCard label={t("pfCaaOvertime")} value={`${fmtPct(total.caa)} / ${fmtPct(total.overtime)}`} tone={comboTone} />
        </section>
      )}

      {data?.trend && <TrendChart trend={data.trend} />}

      {/* Toolbar — tab chips + business-date switch */}
      <div className="mb-4" data-i18n-skip>
        <Toolbar
          right={
            data && data.dates.length > 0 ? (
              <select
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  void load(e.target.value);
                }}
                className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-black outline-none"
              >
                {data.dates.map((item) => (
                  <option key={item} value={item}>{item} {(() => { const wk = weekdayKeyOf(item); return wk ? t(wk) : ""; })()}</option>
                ))}
              </select>
            ) : undefined
          }
        >
          {visibleTabs.map(({ id, labelKey, icon: Icon }) => (
            <Chip key={id} active={tab === id} onClick={() => setTab(id)}>
              <span className="inline-flex items-center gap-1.5"><Icon size={13} /> {t(labelKey)}</span>
            </Chip>
          ))}
          {/* 模式二 · 分池看数。和 tab 同一行,不新增菜单也不新增卡片。
              导入 tab 上没有意义(那里有自己的来源选择器),所以隐藏。 */}
          {tab !== "import" && (
            <span className="ml-2 inline-flex items-center gap-1.5 border-l border-[var(--line)] pl-3">
              {([["", "fmChipAll"], ["pro", null], ["main", "rdPoolStandard"]] as const).map(([value, key]) => (
                <Chip key={value || "all"} active={account === value} onClick={() => setAccount(value)}>
                  {key ? t(key) : "PRO"}
                </Chip>
              ))}
            </span>
          )}
        </Toolbar>
      </div>

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

function GroupTable({ rows, label, showFranchise }: { rows: GroupRow[]; label: string; showFranchise: boolean }) {
  const t = useT();
  const [sort, setSort] = useState<SortState>(null);
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const columns: Array<DataColumn<GroupRow>> = [
    { key: "key", label, sortKey: "key", render: (row) => <span className="font-black">{row.key}</span> },
    ...(showFranchise ? ([{ key: "franchise", label: t("pfBelongFranchise"), render: (row) => <span className="tag">{row.franchise}</span> }] as Array<DataColumn<GroupRow>>) : []),
    // PRO 小计随行显示(金色),站点/加盟商两个 tab 共用这张表 —— 一处改,两处生效。
    { key: "riders", label: t("pfRiders"), sortKey: "riders", align: "right", render: (row) => (
      <span className="font-bold">{row.riders}{row.proRiders > 0 && <span className="ml-1 text-[10px] font-black" style={{ color: "#eda100" }}>PRO {row.proRiders}</span>}</span>
    ) },
    { key: "onlineHours", label: t("pfOnlineHours"), sortKey: "onlineHours", align: "right", render: (row) => row.onlineHours.toFixed(1) },
    { key: "completedOrders", label: t("pfCompleted"), sortKey: "completedOrders", align: "right", render: (row) => (
      <span className="font-black">{row.completedOrders}{row.proOrders > 0 && <span className="ml-1 text-[10px] font-black" style={{ color: "#eda100" }}>PRO {row.proOrders}</span>}</span>
    ) },
    { key: "signedShifts", label: t("pfHSignedShifts"), sortKey: "signedShifts", align: "right", render: (row) => row.signedShifts },
    { key: "signedShiftHours", label: t("pfSignedHours"), sortKey: "signedShiftHours", align: "right", render: (row) => row.signedShiftHours.toFixed(1) },
    { key: "inShiftOnlineHours", label: t("pfHActualOnline"), sortKey: "inShiftOnlineHours", align: "right", render: (row) => row.inShiftOnlineHours.toFixed(1) },
    { key: "tsh", label: "%TSH", sortKey: "tsh", align: "right", render: (row) => pct(row.tsh) },
    { key: "ar", label: "AR", sortKey: "ar", align: "right", render: (row) => pct(row.ar, "high", 95) },
    { key: "caa", label: "CAA", sortKey: "caa", align: "right", render: (row) => pct(row.caa, "low", 5) },
    { key: "overtime", label: t("pfCsvOvertime"), sortKey: "overtime", align: "right", render: (row) => pct(row.overtime, "low", 10) },
  ];
  return <DataTable<GroupRow> columns={columns} rows={sorted} rowKey={(row) => row.key} sort={sort} onSort={toggleSort(setSort)} minWidth={900} empty={t("pfNoData")} />;
}

function RiderTable({ rows }: { rows: EnrichedKpi[] }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<EnrichedKpi | null>(null);
  const PAGE_SIZE = 20;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const base = term
      ? rows.filter((row) => [row.riderName, row.rider99Id, row.cpf, row.phone, row.franchise, row.station].some((v) => String(v ?? "").toLowerCase().includes(term)))
      : rows;
    return sortRows(base, sort);
  }, [rows, query, sort]);

  useEffect(() => {
    setPage(1);
  }, [query, sort, rows]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const columns: Array<DataColumn<EnrichedKpi>> = [
    {
      key: "riderName",
      label: t("pfRider"),
      sortKey: "riderName",
      className: "max-w-[220px]",
      render: (row) => (
        <span className="inline-flex items-center gap-1.5">
          {/* 模式二: PRO 行按行自带的 account 判定 —— 这条数据出自哪份日报,
              而不是骑手"现在"属于哪个池(转池后历史行不该被追溯改色)。 */}
          <span className={`truncate font-black ${row.account === "pro" ? "text-[#eda100]" : ""}`}>{row.riderName}</span>
          {row.account === "pro" && (
            <span className="shrink-0 rounded-full bg-[#eda100] px-1.5 py-[1px] text-[9px] font-black text-[#171b33]">PRO</span>
          )}
          {!row.riderId && <StatusBadge tone="warn" label={t("pfUnregistered")} />}
        </span>
      ),
    },
    { key: "rider99Id", label: "99 ID", render: (row) => <span className="text-[11px] font-bold text-[var(--muted)]">{row.rider99Id}</span> },
    { key: "franchise", label: t("pfFranchise"), render: (row) => <span className="tag">{row.franchise}</span> },
    { key: "station", label: t("pfStation"), render: (row) => <span className="tag">{row.station}</span> },
    { key: "onlineHours", label: t("pfOnline"), sortKey: "onlineHours", align: "right", render: (row) => row.onlineHours.toFixed(1) },
    { key: "completedOrders", label: t("pfCompleted"), sortKey: "completedOrders", align: "right", render: (row) => <span className="font-black">{row.completedOrders}</span> },
    { key: "signedShifts", label: t("pfHSignedShifts"), sortKey: "signedShifts", align: "right", render: (row) => row.signedShifts },
    { key: "signedShiftHours", label: t("pfSignedHours"), sortKey: "signedShiftHours", align: "right", render: (row) => row.signedShiftHours.toFixed(1) },
    { key: "inShiftOnlineHours", label: t("pfHActualOnline"), sortKey: "inShiftOnlineHours", align: "right", render: (row) => row.inShiftOnlineHours.toFixed(1) },
    { key: "tsh", label: "%TSH", sortKey: "tsh", align: "right", render: (row) => pct(row.tsh) },
    { key: "tshCritical", label: t("pfTshKey"), sortKey: "tshCritical", align: "right", render: (row) => pct(row.tshCritical) },
    { key: "ar", label: "AR", sortKey: "ar", align: "right", render: (row) => pct(row.ar, "high", 95) },
    { key: "caa", label: "CAA", sortKey: "caa", align: "right", render: (row) => pct(row.caa, "low", 5) },
    { key: "overtime", label: t("pfCsvOvertime"), sortKey: "overtime", align: "right", render: (row) => pct(row.overtime, "low", 10) },
  ];

  return (
    <div className="space-y-3">
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder={t("rdSearchPh")} />
      </Toolbar>
      <DataTable<EnrichedKpi>
        columns={columns}
        rows={pageRows}
        rowKey={(row) => row.id}
        rowAccent={(row) => row.account === "pro"}
        onRowClick={setDetail}
        sort={sort}
        onSort={toggleSort(setSort)}
        minWidth={1100}
        empty={t("pfNoData")}
      />
      {pages > 1 && (
        <div className="flex justify-end" data-i18n-skip>
          <Pager page={safePage} pages={pages} total={filtered.length} onPage={setPage} />
        </div>
      )}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        ariaLabel={detail?.riderName}
        title={
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-black">{detail?.riderName}</span>
            {detail && !detail.riderId && <StatusBadge tone="warn" label={t("pfUnregistered")} />}
          </div>
        }
      >
        {detail && (
          <div>
            <DetailRow label={t("pfCsvDate")} value={detail.date} />
            <DetailRow label="99 ID" value={detail.rider99Id} />
            <DetailRow label="CPF" value={detail.cpf || "—"} />
            <DetailRow label={t("pfCsvPhone")} value={detail.phone || "—"} />
            <DetailRow label={t("pfCsvCity")} value={detail.city || "—"} />
            <DetailRow label={t("pfFranchise")} value={<span className="tag">{detail.franchise}</span>} />
            <DetailRow label={t("pfStation")} value={<span className="tag">{detail.station}</span>} />
            <DetailRow label={t("pfOnlineHours")} value={detail.onlineHours.toFixed(1)} />
            <DetailRow label={t("pfCompleted")} value={detail.completedOrders} />
            <DetailRow label={t("pfHSignedShifts")} value={detail.signedShifts} />
            <DetailRow label={t("pfSignedHours")} value={detail.signedShiftHours.toFixed(1)} />
            <DetailRow label={t("pfHActualOnline")} value={detail.inShiftOnlineHours.toFixed(1)} />
            <DetailRow label="%TSH" value={pct(detail.tsh)} />
            <DetailRow label={t("pfTshKey")} value={pct(detail.tshCritical)} />
            <DetailRow label="AR" value={pct(detail.ar, "high", 95)} />
            <DetailRow label="CAA" value={pct(detail.caa, "low", 5)} />
            <DetailRow label={t("pfCsvOvertime")} value={pct(detail.overtime, "low", 10)} />
          </div>
        )}
      </Drawer>
    </div>
  );
}

function EarningGroupTable({ rows, showFranchise, v2Board = false }: { rows: EarningGroupRow[]; showFranchise: boolean; v2Board?: boolean }) {
  const t = useT();
  const [sort, setSort] = useState<SortState>(null);
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const columns: Array<DataColumn<EarningGroupRow>> = [
    { key: "key", label: t("pfHObject"), sortKey: "key", render: (row) => <span className="font-black">{row.key}</span> },
    ...(showFranchise ? ([{ key: "franchise", label: t("pfBelongFranchise"), render: (row) => <span className="tag">{row.franchise}</span> }] as Array<DataColumn<EarningGroupRow>>) : []),
    { key: "riders", label: t("pfRiders"), sortKey: "riders", align: "right", render: (row) => row.riders },
    { key: "orders", label: t("pfCompleted"), sortKey: "orders", align: "right", render: (row) => <span className="font-black">{row.orders}</span> },
    { key: "total", label: t("pfEarnTotal"), sortKey: "total", align: "right", render: (row) => money(row.total) },
    { key: "tripIncome", label: t("pfTripIncome"), sortKey: "tripIncome", align: "right", render: (row) => money(row.tripIncome) },
    { key: "cashDebt", label: t("pfHCashDebt"), sortKey: "cashDebt", align: "right", render: (row) => (row.cashDebt ? <span className="text-[var(--danger-ink)]">{money(row.cashDebt)}</span> : "-") },
    { key: "mealDeduction", label: t("pfHDeduction"), sortKey: "mealDeduction", align: "right", render: (row) => (row.mealDeduction ? money(row.mealDeduction) : "-") },
    { key: "bonus", label: t("pfHBonus"), sortKey: "bonus", align: "right", render: (row) => (row.bonus ? money(row.bonus) : "-") },
    { key: "tips", label: t("pfHTips"), sortKey: "tips", align: "right", render: (row) => (row.tips ? money(row.tips) : "-") },
    { key: "settleAmount", label: v2Board ? t("wlColPayableV2") : t("pfHSettle"), sortKey: "settleAmount", align: "right", render: (row) => <span className="font-black text-[var(--accent)]">{money(row.settleAmount)}</span> },
  ];
  return <DataTable<EarningGroupRow> columns={columns} rows={sorted} rowKey={(row) => row.key} sort={sort} onSort={toggleSort(setSort)} minWidth={860} empty={t("pfNoEarnings")} />;
}

function EarningsTab({ earnings, scopeFranchise, scopeStation, date, headers }: { earnings: Payload["earnings"]; scopeFranchise: string; scopeStation: string; date: string; headers: Record<string, string> }) {
  const t = useT();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paidNames, setPaidNames] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<EnrichedEarning | null>(null);
  const PAGE_SIZE = 20;

  // Riders already marked paid for this date (daily payment records).
  const loadPaid = useCallback(async () => {
    if (!date) return;
    const response = await fetch(`/api/wallet?payments=1&from=${date}&to=${date}`, { headers, cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    // 已付识别:优先 99ID(新记录都带),回退姓名(历史记录)。两种键都放进集合。
    setPaidNames(
      new Set(
        (payload.data as Array<{ target: string; refName: string; rider99Id?: string }>)
          .filter((p) => p.target === "rider")
          .flatMap((p) => [`name:${p.refName}`, ...(p.rider99Id ? [`id:${p.rider99Id}`] : [])]),
      ),
    );
  }, [date, headers]);

  useEffect(() => {
    setSelected(new Set());
    void loadPaid();
  }, [loadPaid]);

  const isPaid = (r: { riderName: string; rider99Id?: string }) => paidNames.has(`name:${r.riderName}`) || (!!r.rider99Id && paidNames.has(`id:${r.rider99Id}`));
  // 结算口径 v2:接口对 v2 日期的普通行已把 settleAmount 换成"今日统计"(应付),列名随之切换。
  const v2Board = earnings.riders.some((r) => (r as { v2?: boolean }).v2);

  async function markPaid() {
    // PRO 行的结算额是"完单×费率"的展示推导 —— PRO 的钱走加盟商整体转账
    // (钱包周结,净额口径),不逐骑手日结,这里必须排除,防止重复记账。
    const rows = earnings.riders.filter((r) => selected.has(r.id) && !isPaid(r) && r.settleAmount > 0 && r.account !== "pro");
    const zero = earnings.riders.filter((r) => selected.has(r.id) && !isPaid(r) && (r.settleAmount <= 0 || r.account === "pro")).length;
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
        // amount = 接口给的展示结算额(v2 = 今日统计),与钱包周板 / 付款守卫同源;带 99ID 落账。
        body: JSON.stringify({ action: "recordPayment", target: "rider", refName: row.riderName, rider99Id: row.rider99Id, franchise: row.franchise, amount: row.settleAmount, period: "daily", weekFrom: date, weekTo: date, note: t("pfPayNote", { date }) }),
      });
      if (!response.ok) failed += 1;
    }
    setBusy(false);
    setSelected(new Set());
    void loadPaid();
    setNote(failed ? { tone: "err", text: t("pfMarkedFailed", { ok: rows.length - failed, failed }) } : { tone: "ok", text: t("pfMarkedPaid", { n: rows.length, date, zero: zero ? t("pfMarkedSkip", { n: zero }) : "" }) });
  }

  const toggle = (id: string) => setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const base = term
      ? earnings.riders.filter((row) => [row.riderName, row.rider99Id, row.pix, row.franchise, row.station].some((v) => String(v ?? "").toLowerCase().includes(term)))
      : earnings.riders;
    return sortRows(base, sort);
  }, [earnings.riders, query, sort]);

  useEffect(() => {
    setPage(1);
  }, [query, sort, earnings.riders]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const selectableRows = filtered.filter((r) => !isPaid(r));
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.id));

  if (earnings.riders.length === 0) {
    return <div className="panel p-6 text-sm font-bold text-[var(--muted)]">{t("pfNoEarnings")}</div>;
  }
  const total = earnings.total;
  const brokenSettle = total.settleAmount === 0 && total.total > 0;
  const groups: Array<{ title: string; rows: EarningGroupRow[]; showFranchise: boolean }> = [];
  if (!scopeFranchise && !scopeStation) groups.push({ title: t("pfGroupByFranchise"), rows: earnings.franchises, showFranchise: false });
  if (!scopeStation) groups.push({ title: t("pfGroupByStation"), rows: earnings.stations, showFranchise: !scopeFranchise });

  const columns: Array<DataColumn<EnrichedEarning>> = [
    {
      key: "select",
      label: (
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--accent)]"
          checked={allSelected}
          onChange={(e) => setSelected(e.target.checked ? new Set(selectableRows.map((r) => r.id)) : new Set())}
        />
      ),
      render: (row) => (
        <span onClick={(e) => e.stopPropagation()}>
          {isPaid(row) ? (
            <StatusBadge tone="success" label={t("pfPaid")} />
          ) : (
            <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
          )}
        </span>
      ),
    },
    {
      key: "riderName",
      label: t("pfRider"),
      sortKey: "riderName",
      className: "max-w-[200px]",
      render: (row) => (
        <span className="inline-flex items-center gap-1.5">
          {/* 模式二: PRO 行按行自带的 account 判定 —— 这条数据出自哪份日报,
              而不是骑手"现在"属于哪个池(转池后历史行不该被追溯改色)。 */}
          <span className={`truncate font-black ${row.account === "pro" ? "text-[#eda100]" : ""}`}>{row.riderName}</span>
          {row.account === "pro" && (
            <span className="shrink-0 rounded-full bg-[#eda100] px-1.5 py-[1px] text-[9px] font-black text-[#171b33]">PRO</span>
          )}
          {!row.riderId && <StatusBadge tone="warn" label={t("pfUnregistered")} />}
        </span>
      ),
    },
    { key: "rider99Id", label: "99 ID", render: (row) => <span className="text-[11px] font-bold text-[var(--muted)]">{row.rider99Id}</span> },
    { key: "pix", label: "PIX", render: (row) => <span className="text-[11px] font-bold">{row.pix || "-"}</span> },
    { key: "franchise", label: t("pfFranchise"), render: (row) => <span className="tag">{row.franchise}</span> },
    { key: "station", label: t("pfStation"), render: (row) => <span className="tag">{row.station}</span> },
    { key: "orders", label: t("pfCompleted"), sortKey: "orders", align: "right", render: (row) => <span className="font-black">{row.orders}</span> },
    { key: "total", label: t("pfEarnTotal"), sortKey: "total", align: "right", render: (row) => money(row.total) },
    { key: "tripIncome", label: t("pfTripIncome"), sortKey: "tripIncome", align: "right", render: (row) => money(row.tripIncome) },
    { key: "cashDebt", label: t("pfHCashDebt"), sortKey: "cashDebt", align: "right", render: (row) => (row.cashDebt ? <span className="text-[var(--danger-ink)]">{money(row.cashDebt)}</span> : "-") },
    { key: "mealDeduction", label: t("pfHMeal"), sortKey: "mealDeduction", align: "right", render: (row) => (row.mealDeduction ? money(row.mealDeduction) : "-") },
    { key: "bonus", label: t("pfHBonus"), sortKey: "bonus", align: "right", render: (row) => (row.bonus ? money(row.bonus) : "-") },
    { key: "tips", label: t("pfHTips"), sortKey: "tips", align: "right", render: (row) => (row.tips ? money(row.tips) : "-") },
    { key: "manualAdjust", label: t("pfHAdjust"), sortKey: "manualAdjust", align: "right", render: (row) => (row.manualAdjust ? money(row.manualAdjust) : "-") },
    { key: "referralBonus", label: t("pfHReferral"), sortKey: "referralBonus", align: "right", render: (row) => (row.referralBonus ? money(row.referralBonus) : "-") },
    { key: "settleAmount", label: v2Board ? t("wlColPayableV2") : t("pfHSettle"), sortKey: "settleAmount", align: "right", render: (row) => <span className="font-black text-[var(--accent)]">{money(row.settleAmount)}</span> },
  ];

  return (
    <div className="space-y-4">
      {brokenSettle && (
        <div className="rounded-[8px] border border-[var(--warning)] bg-[var(--warning-bg)] px-4 py-3 text-sm font-black text-[var(--warning-ink)]">
          {t("pfBrokenSettle")}
        </div>
      )}

      {/* Stat row — earnings totals */}
      <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <Stat label={t("pfRiders")} value={String(total.riders)} />
        <Stat label={t("pfCompleted")} value={String(total.orders)} />
        <Stat label={t("pfEarnTotal")} value={money(total.total)} />
        <Stat label={t("pfTripIncome")} value={money(total.tripIncome)} />
        <Stat label={t("pfBonusTips")} value={money(total.bonus + total.tips)} />
        <div className="panel border-[var(--accent)] p-4">
          <div className="text-[11px] font-bold uppercase text-[var(--accent)]">{t("pfSettleSum")}</div>
          <div className="mt-1 text-2xl font-black text-[var(--accent)]">{money(total.settleAmount)}</div>
        </div>
      </section>

      {groups.map(({ title, rows, showFranchise }) => (
        <div key={title}>
          <div className="mb-2 text-xs font-black uppercase text-[var(--accent)]">{title}</div>
          <EarningGroupTable rows={rows} showFranchise={showFranchise} v2Board={v2Board} />
        </div>
      ))}

      {/* Toolbar — rider settlement detail */}
      <Toolbar
        right={
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
        }
      >
        <span className="text-xs font-black uppercase text-[var(--accent)]">{t("pfDetailTitle", { date: date || t("pfAllDates") })}</span>
        <SearchInput value={query} onChange={setQuery} placeholder={t("rdSearchPh")} />
      </Toolbar>

      {note && (
        <div className={`rounded-[8px] border px-3 py-2 text-xs font-black ${note.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>{note.text}</div>
      )}

      <DataTable<EnrichedEarning>
        columns={columns}
        rows={pageRows}
        rowKey={(row) => row.id}
        onRowClick={setDetail}
        sort={sort}
        onSort={toggleSort(setSort)}
        minWidth={1280}
        empty={t("pfNoEarnings")}
      />
      {pages > 1 && (
        <div className="flex justify-end" data-i18n-skip>
          <Pager page={safePage} pages={pages} total={filtered.length} onPage={setPage} />
        </div>
      )}

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        ariaLabel={detail?.riderName}
        title={
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-black">{detail?.riderName}</span>
            {detail && (paidNames.has(detail.riderName)
              ? <StatusBadge tone="success" label={t("pfPaid")} />
              : <StatusBadge tone="neutral" label={t("pfUnpaid")} />)}
            {detail && !detail.riderId && <StatusBadge tone="warn" label={t("pfUnregistered")} />}
          </div>
        }
      >
        {detail && (
          <div>
            <DetailRow label={t("pfCsvDate")} value={date || t("pfAllDates")} />
            <DetailRow label="99 ID" value={detail.rider99Id} />
            <DetailRow label="CPF" value={detail.cpf || "—"} />
            <DetailRow label="PIX" value={detail.pix || "—"} />
            <DetailRow label={t("pfCsvPhone")} value={detail.phone || "—"} />
            <DetailRow label={t("pfFranchise")} value={<span className="tag">{detail.franchise}</span>} />
            <DetailRow label={t("pfStation")} value={<span className="tag">{detail.station}</span>} />
            <DetailRow label={t("pfCompleted")} value={detail.orders} />
            <DetailRow label={t("pfEarnTotal")} value={money(detail.total)} />
            <DetailRow label={t("pfTripIncome")} value={money(detail.tripIncome)} />
            <DetailRow label={t("pfHCashDebt")} value={detail.cashDebt ? <span className="text-[var(--danger-ink)]">{money(detail.cashDebt)}</span> : "-"} />
            <DetailRow label={t("pfHMeal")} value={detail.mealDeduction ? money(detail.mealDeduction) : "-"} />
            <DetailRow label={t("pfHBonus")} value={detail.bonus ? money(detail.bonus) : "-"} />
            <DetailRow label={t("pfHTips")} value={detail.tips ? money(detail.tips) : "-"} />
            <DetailRow label={t("pfHAdjust")} value={detail.manualAdjust ? money(detail.manualAdjust) : "-"} />
            <DetailRow label={t("pfHReferral")} value={detail.referralBonus ? money(detail.referralBonus) : "-"} />
            <DetailRow label={t("pfCsvOther")} value={detail.other ? money(detail.other) : "-"} />
            <DetailRow label={t("pfHSettle")} value={<span className="font-black text-[var(--accent)]">{money(detail.settleAmount)}</span>} />
          </div>
        )}
      </Drawer>
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
  /**
   * 模式二 T2 · 报表来源账号。
   *
   * 两个 Eastwind OL 账号各出一份日报:旧账号 = 普通池(main),新账号 = PRO 池。
   * 幂等键是「账号+日期+骑手」,所以选错来源会写进另一个池的行 —— 这个选择器
   * 是唯一的判定入口,没有它运营在界面上根本导不了 PRO 报表(T2 的服务端早就
   * 支持,缺的一直是这个开关)。
   *
   * PRO 行落库时所有金额字段强制为 0(v3.0 R6),单价永不进系统。
   */
  const [account, setAccount] = useState<"main" | "pro">("main");

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
          body: JSON.stringify({ action: isEarnings ? "importEarnings" : "importKpiRecords", date, records, account }),
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
      <SectionCard title={<span className="inline-flex items-center gap-2"><FileSpreadsheet size={15} /> {t("pfImpUploadTitle")}</span>} desc={t("pfImpDesc")}>
        <div className="space-y-3">
          {/* 模式二 T2 · 报表来源账号 —— 必须在选文件之前选,放在上传框正上方。
              选错池的后果不是报错而是「数据静静地进了另一个池」,所以 PRO 时
              整块变金色高亮 + 明确写出零金额规则,让人不容易选错。 */}
          <div className={`rounded-[8px] border p-3 ${account === "pro" ? "border-[#eda100] bg-[#eda100]/10" : "border-[var(--line)]"}`}>
            <div className="text-[11px] font-black uppercase text-[var(--muted)]">{t("pfImpAccount")}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAccount("main")}
                className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-black ${account === "main" ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "border border-[var(--line)] text-[var(--muted-strong)]"}`}
              >
                {t("pfImpAccountMain")}
              </button>
              <button
                type="button"
                onClick={() => setAccount("pro")}
                className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-black ${account === "pro" ? "bg-[#eda100] text-[#171b33]" : "border border-[var(--line)] text-[var(--muted-strong)]"}`}
              >
                {t("pfImpAccountPro")}
              </button>
            </div>
            <div className="mt-2 text-[11px] font-bold text-[var(--muted)]">
              {account === "pro" ? t("pfImpAccountProHint") : t("pfImpAccountMainHint")}
            </div>
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
              className="tag disabled:opacity-50"
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
      </SectionCard>

      <SectionCard title={<span className="inline-flex items-center gap-2"><BarChart3 size={15} /> {t("pfImpPasteTitle")}</span>}>
        <div className="space-y-3">
          <label className="block text-xs font-black uppercase text-[var(--muted)]">
            {t("pfImpReportDate")}
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="mt-1 block h-11 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
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
      </SectionCard>
    </div>
  );
}
