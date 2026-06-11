"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Building2, MapPin, RefreshCcw, Upload, Users } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import { readSession } from "../lib/session";
import type { KpiAggregate, RiderDailyKpi } from "../lib/performance";

type EnrichedKpi = RiderDailyKpi & { franchise: string; station: string; riderId: string | null };
type GroupRow = KpiAggregate & { franchise?: string };
type Payload = {
  date: string | null;
  dates: string[];
  riders: EnrichedKpi[];
  stations: GroupRow[];
  franchises: GroupRow[];
  total: KpiAggregate;
};

const tabs = [
  { id: "franchises", label: "按加盟商", icon: Building2 },
  { id: "stations", label: "按站点", icon: MapPin },
  { id: "riders", label: "按骑手", icon: Users },
  { id: "import", label: "导入 T+1 报表", icon: Upload },
] as const;

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
          <button type="button" onClick={() => void load(date)} className="tag inline-flex items-center gap-1">
            <RefreshCcw size={13} /> 刷新
          </button>
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
              <option key={item} value={item}>{item}</option>
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
          <div className="panel p-3 text-center"><div className="text-[10px] font-black uppercase text-[var(--muted)]">AR</div><div className="text-xl">{pct(total.ar, "high", 60)}</div></div>
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

      {tab === "import" && <ImportTab headers={headers} onDone={(text) => { setMessage({ tone: "ok", text }); void load(); }} onError={(text) => setMessage({ tone: "err", text })} />}
    </AppShell>
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
              <td className="py-2 text-center">{pct(row.ar, "high", 60)}</td>
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
              <td className="py-2 text-center">{pct(row.ar, "high", 60)}</td>
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

  return (
    <div className="panel space-y-4 p-5">
      <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]">
        <BarChart3 size={15} /> 从 Eastwind 导入 T+1 骑手报表
      </div>
      <div className="text-sm font-bold leading-6 text-[var(--muted-strong)]">
        Eastwind → 报表 → 骑手报表 → 按骑手 → 选择日期查询后，全选复制整页内容（或「下载数据」后打开文件全选复制），粘贴到下方。重复导入同一天会按骑手覆盖更新。
      </div>
      <label className="block text-xs font-black uppercase text-[var(--muted)]">
        报表日期（T+1 报表对应的业务日期）
        <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="mt-1 h-11 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
      </label>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={12}
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
  );
}
