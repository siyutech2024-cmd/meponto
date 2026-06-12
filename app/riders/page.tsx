"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Filter, Plus, RefreshCcw, Search, UserPlus } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import { downloadCsv } from "../lib/csv";
import { useDialog } from "../components/dialog";

type RiderRow = {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  pix: string;
  ponto: string;
  franchise?: string;
  status: string;
  ar: number;
  joinDate: string;
  ninetyNineId?: string;
  pointsBalance: number;
  totalOrders: number;
  lastReportDate: string;
  reportAr: number | null;
  source: "profile" | "report";
};

type Network = { franchises: Array<{ id: string; name: string }>; stations: Array<{ id: string; name: string; franchise?: string }> };

const HEADERS = { "Content-Type": "application/json", "x-vento-role": "Super Admin" };
const isUnassigned = (value?: string) => !value || value === "Unassigned";

export default function RidersPage() {
  const dialog = useDialog();
  const [riders, setRiders] = useState<RiderRow[]>([]);
  const [network, setNetwork] = useState<Network>({ franchises: [], stations: [] });
  const [query, setQuery] = useState("");
  const [stationFilter, setStationFilter] = useState("");
  const [franchiseFilter, setFranchiseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busyId, setBusyId] = useState("");
  const [form, setForm] = useState({ name: "", ninetyNineId: "", phone: "", cpf: "", ponto: "", franchise: "" });
  // Assignment edits are staged here and saved to the DB only after 确认保存.
  const [pending, setPending] = useState<Record<string, { name: string; ponto?: string; franchise?: string }>>({});
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    const [ridersResponse, networkResponse] = await Promise.all([
      fetch("/api/riders", { headers: HEADERS, cache: "no-store" }),
      fetch("/api/network", { headers: HEADERS, cache: "no-store" }),
    ]);
    if (ridersResponse.ok) setRiders((await ridersResponse.json()).data);
    if (networkResponse.ok) {
      const payload = (await networkResponse.json()).data;
      setNetwork({ franchises: payload.franchises, stations: payload.stations });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign(rider: RiderRow, fields: { ponto?: string; franchise?: string; status?: string }) {
    setBusyId(rider.id);
    const response = await fetch("/api/riders", { method: "POST", headers: HEADERS, body: JSON.stringify({ action: "assign", riderId: rider.id, ...fields }) });
    const payload = await response.json().catch(() => ({}));
    setBusyId("");
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? `操作失败 (${response.status})` });
      return;
    }
    setMessage({ tone: "ok", text: `${rider.name} 已更新${fields.ponto ? ` → ${fields.ponto}` : ""}${fields.franchise ? ` / ${fields.franchise}` : ""}` });
    void load();
  }

  /** Stage a franchise/station edit (saved only after 确认保存). */
  function stage(rider: RiderRow, fields: { ponto?: string; franchise?: string }) {
    setPending((current) => {
      const entry = { ...current[rider.id], ...fields, name: rider.name };
      // Cascade: picking a station locks its parent franchise; switching
      // franchise clears a station that doesn't belong to it.
      if (fields.ponto) {
        const station = network.stations.find((s) => s.name === fields.ponto);
        if (station?.franchise) entry.franchise = station.franchise;
      }
      if (fields.franchise !== undefined && fields.ponto === undefined) {
        const effectivePonto = entry.ponto ?? (isUnassigned(rider.ponto) ? undefined : rider.ponto);
        const station = effectivePonto ? network.stations.find((s) => s.name === effectivePonto) : undefined;
        if (station?.franchise && station.franchise !== fields.franchise) entry.ponto = "";
      }
      return { ...current, [rider.id]: entry };
    });
  }

  async function savePending() {
    const entries = Object.entries(pending);
    if (entries.length === 0) return;
    if (!(await dialog.confirm(`确认保存 ${entries.length} 项分配调整？`, { message: entries.map(([, e]) => `· ${e.name} → ${e.franchise ?? "（不变）"} / ${e.ponto || "（待定）"}`).join("\n"), confirmText: "确认保存" }))) return;
    setSaving(true);
    let failed = 0;
    for (const [riderId, entry] of entries) {
      const response = await fetch("/api/riders", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ action: "assign", riderId, ...(entry.ponto !== undefined ? { ponto: entry.ponto } : {}), ...(entry.franchise !== undefined ? { franchise: entry.franchise } : {}) }),
      });
      if (!response.ok) failed += 1;
    }
    setSaving(false);
    setPending({});
    setMessage(failed ? { tone: "err", text: `${entries.length - failed} 项已保存，${failed} 项失败。` } : { tone: "ok", text: `${entries.length} 项分配已保存入库。` });
    void load();
  }

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return riders
      .filter((rider) => {
        const haystack = [rider.name, rider.cpf, rider.phone, rider.ninetyNineId].map((value) => String(value ?? "").toLowerCase());
        if (term && !haystack.some((value) => value.includes(term))) return false;
        if (stationFilter && rider.ponto !== stationFilter) return false;
        if (franchiseFilter && rider.franchise !== franchiseFilter) return false;
        if (statusFilter && rider.status !== statusFilter) return false;
        if (onlyUnassigned && !(isUnassigned(rider.ponto) || isUnassigned(rider.franchise))) return false;
        return true;
      })
      .sort((a, b) => {
        // Unassigned first, then by lifetime orders.
        const aUn = isUnassigned(a.ponto) || isUnassigned(a.franchise) ? 0 : 1;
        const bUn = isUnassigned(b.ponto) || isUnassigned(b.franchise) ? 0 : 1;
        return aUn - bUn || b.totalOrders - a.totalOrders;
      });
  }, [riders, query, stationFilter, franchiseFilter, statusFilter, onlyUnassigned]);

  const unassignedCount = riders.filter((rider) => isUnassigned(rider.ponto) || isUnassigned(rider.franchise)).length;
  const reportOnlyCount = riders.filter((rider) => rider.source === "report").length;

  // Pagination keeps the table short even with hundreds of riders.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  useEffect(() => {
    setPage(1);
  }, [query, stationFilter, franchiseFilter, statusFilter, onlyUnassigned]);

  const input = "h-11 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--accent)]";

  return (
    <AppShell>
      <PageTitle
        title="骑手管理"
        eyebrow={`共 ${riders.length} 人 · 日报覆盖全量`}
        action={
          <div className="flex gap-2">
            <button
              type="button"
              className="tag"
              onClick={() => downloadCsv(`riders-${new Date().toISOString().slice(0, 10)}`, ["姓名", "99ID", "CPF", "电话", "加盟商", "站点", "状态", "累计完单", "最近日报", "积分"], filtered.map((r) => [r.name, r.ninetyNineId ?? "", r.cpf, r.phone, r.franchise ?? "", r.ponto, r.status, String(r.totalOrders), r.lastReportDate, String(r.pointsBalance)]))}
            >
              导出
            </button>
            <button type="button" className="tag inline-flex items-center gap-1" onClick={() => void load()}><RefreshCcw size={13} /> 刷新</button>
            <button type="button" onClick={() => setAddOpen(!addOpen)} className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)]">
              <Plus size={14} /> 添加骑手
            </button>
          </div>
        }
      />

      {message && (
        <div className={`mb-3 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      {/* Quick stats — unassigned is the call to action. */}
      <section className="grid gap-3 md:grid-cols-4">
        <div className="panel p-4"><div className="text-[10px] font-black uppercase text-[var(--muted)]">骑手总数</div><div className="mt-1 text-2xl font-black">{riders.length}</div></div>
        <div className="panel p-4"><div className="text-[10px] font-black uppercase text-[var(--muted)]">已建档</div><div className="mt-1 text-2xl font-black text-[var(--ok-ink)]">{riders.length - reportOnlyCount}</div></div>
        <button type="button" onClick={() => setOnlyUnassigned(!onlyUnassigned)} className={`panel p-4 text-left ${onlyUnassigned ? "border-[var(--danger)]" : unassignedCount > 0 ? "border-[var(--warning)]" : ""}`}>
          <div className="text-[10px] font-black uppercase text-[var(--danger-ink)]">未分配（点击筛选）</div>
          <div className="mt-1 text-2xl font-black text-[var(--danger-ink)]">{unassignedCount}</div>
        </button>
        <div className="panel p-4"><div className="text-[10px] font-black uppercase text-[var(--muted)]">日报新面孔（未建档）</div><div className="mt-1 text-2xl font-black text-[var(--warning-ink)]">{reportOnlyCount}</div></div>
      </section>

      {/* Inline add form */}
      {addOpen && (
        <section className="panel mt-4 grid gap-2 p-4 md:grid-cols-3 xl:grid-cols-6">
          <input className={input} placeholder="姓名 *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={input} placeholder="99 ID" value={form.ninetyNineId} onChange={(e) => setForm({ ...form, ninetyNineId: e.target.value.replace(/\D/g, "") })} />
          <input className={input} placeholder="电话" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className={input} placeholder="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
          <select className={input} value={form.franchise} onChange={(e) => setForm({ ...form, franchise: e.target.value })}>
            <option value="">加盟商（可选）</option>
            {network.franchises.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
          </select>
          <select className={input} value={form.ponto} onChange={(e) => setForm({ ...form, ponto: e.target.value })}>
            <option value="">站点（可选）</option>
            {network.stations.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
          <button
            type="button"
            disabled={!form.name.trim()}
            onClick={async () => {
              const response = await fetch("/api/riders", { method: "POST", headers: HEADERS, body: JSON.stringify(form) });
              const payload = await response.json().catch(() => ({}));
              if (!response.ok) {
                setMessage({ tone: "err", text: payload.error ?? `添加失败 (${response.status})` });
                return;
              }
              setMessage({ tone: "ok", text: `骑手 ${form.name} 已添加。` });
              setForm({ name: "", ninetyNineId: "", phone: "", cpf: "", ponto: "", franchise: "" });
              setAddOpen(false);
              void load();
            }}
            className="inline-flex h-11 items-center justify-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] disabled:opacity-50 md:col-span-3 xl:col-span-6"
          >
            <UserPlus size={14} /> 保存骑手
          </button>
        </section>
      )}

      {/* Filters */}
      <section className="panel mt-4 grid gap-2 p-3 md:grid-cols-[1fr_170px_170px_150px]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} className={`${input} w-full pl-9`} placeholder="搜索姓名 / 99ID / CPF / 电话" />
        </label>
        <label className="relative">
          <Filter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={14} />
          <select value={franchiseFilter} onChange={(e) => setFranchiseFilter(e.target.value)} className={`${input} w-full pl-8`}>
            <option value="">全部加盟商</option>
            <option value="Unassigned">未分配</option>
            {network.franchises.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
          </select>
        </label>
        <select value={stationFilter} onChange={(e) => setStationFilter(e.target.value)} className={input}>
          <option value="">全部站点</option>
          <option value="Unassigned">未分配</option>
          {network.stations.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={input}>
          <option value="">全部状态</option>
          <option>Active</option>
          <option>Inactive</option>
          <option>Risk</option>
          <option>Night Shift</option>
        </select>
      </section>

      {/* Riders table */}
      <section className="panel mt-4 overflow-x-auto p-4">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="text-left text-[10px] font-black uppercase text-[var(--muted)]">
              <th className="pb-2">骑手</th>
              <th className="pb-2">99 ID</th>
              <th className="pb-2">加盟商</th>
              <th className="pb-2">站点</th>
              <th className="pb-2 text-right">累计完单</th>
              <th className="pb-2 text-right">AR</th>
              <th className="pb-2 text-right">积分</th>
              <th className="pb-2">最近日报</th>
              <th className="pb-2">状态</th>
              <th className="pb-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((rider) => {
              const unassigned = isUnassigned(rider.ponto) || isUnassigned(rider.franchise);
              const ar = rider.reportAr ?? rider.ar;
              const staged = pending[rider.id];
              const effectiveFranchise = staged?.franchise ?? (isUnassigned(rider.franchise) ? "" : rider.franchise!);
              const effectivePonto = staged?.ponto ?? (isUnassigned(rider.ponto) ? "" : rider.ponto);
              // Cascade: station options follow the (staged) franchise.
              const stationOptions = effectiveFranchise ? network.stations.filter((s) => s.franchise === effectiveFranchise) : network.stations;
              return (
                <tr key={rider.id} className={`border-t border-[var(--line)] ${staged ? "bg-[var(--warning-bg)]" : unassigned ? "bg-[var(--danger-bg)]" : ""}`}>
                  <td className="max-w-[220px] py-2 pr-2">
                    <div className="truncate font-black">{rider.name}</div>
                    {rider.source === "report" && <span className="text-[10px] font-black uppercase text-[var(--warning-ink)]">日报 · 未建档</span>}
                    {staged && <span className="text-[10px] font-black uppercase text-[var(--warning-ink)]">待保存</span>}
                  </td>
                  <td className="py-2 pr-2 font-bold text-[var(--muted-strong)]">{rider.ninetyNineId || "—"}</td>
                  <td className="py-2 pr-2">
                    <select
                      disabled={saving}
                      value={effectiveFranchise}
                      onChange={(e) => stage(rider, { franchise: e.target.value })}
                      className={`h-9 max-w-[150px] rounded-[8px] border bg-[var(--surface-raised)] px-2 text-xs font-bold outline-none ${staged ? "border-[var(--warning)]" : isUnassigned(rider.franchise) ? "border-[var(--danger)] text-[var(--danger-ink)]" : "border-[var(--line)] text-[var(--text)]"}`}
                    >
                      <option value="">未分配</option>
                      {network.franchises.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      disabled={saving}
                      value={effectivePonto}
                      onChange={(e) => stage(rider, { ponto: e.target.value })}
                      className={`h-9 max-w-[170px] rounded-[8px] border bg-[var(--surface-raised)] px-2 text-xs font-bold outline-none ${staged ? "border-[var(--warning)]" : isUnassigned(rider.ponto) ? "border-[var(--danger)] text-[var(--danger-ink)]" : "border-[var(--line)] text-[var(--text)]"}`}
                    >
                      <option value="">未分配</option>
                      {stationOptions.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-2 text-right font-black">{rider.totalOrders}</td>
                  <td className={`py-2 pr-2 text-right font-black ${ar !== null && ar < 95 ? "text-[var(--danger-ink)]" : ""}`}>{ar !== null ? `${ar}%` : "—"}</td>
                  <td className="py-2 pr-2 text-right font-black text-[var(--accent)]">{rider.pointsBalance}</td>
                  <td className="py-2 pr-2 text-xs font-bold text-[var(--muted)]">{rider.lastReportDate || "—"}</td>
                  <td className="py-2 pr-2"><Badge value={rider.status} /></td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      {rider.source === "profile" && <Link className="tag" href={`/riders/${rider.id}`}>详情</Link>}
                      {rider.source === "profile" && (
                        <button type="button" className="tag" disabled={busyId === rider.id} onClick={() => void assign(rider, { status: rider.status === "Inactive" ? "Active" : "Inactive" })}>
                          {rider.status === "Inactive" ? "启用" : "停用"}
                        </button>
                      )}
                      {rider.source === "report" && (
                        <button type="button" className="tag border-[var(--accent)] text-[var(--accent)]" disabled={busyId === rider.id} onClick={() => void assign(rider, {})}>
                          建档
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="py-8 text-center text-sm font-bold text-[var(--muted)]">没有符合条件的骑手。</td></tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3" data-i18n-skip>
            <span className="text-xs font-bold text-[var(--muted)]">{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} / {filtered.length}</span>
            <div className="flex gap-1.5">
              <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="tag disabled:opacity-40">←</button>
              {Array.from({ length: totalPages }).slice(0, 8).map((_, index) => (
                <button key={index} type="button" onClick={() => setPage(index + 1)} className={`tag ${safePage === index + 1 ? "border-[var(--accent)] text-[var(--accent)]" : ""}`}>{index + 1}</button>
              ))}
              {totalPages > 8 && <span className="text-xs font-bold text-[var(--muted)]">…{totalPages}</span>}
              <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} className="tag disabled:opacity-40">→</button>
            </div>
          </div>
        )}
      </section>

      {/* Sticky confirm bar: nothing is written until the user confirms. */}
      {Object.keys(pending).length > 0 && (
        <div className="sticky bottom-3 z-20 mt-4 flex items-center justify-between gap-3 rounded-[8px] border border-[var(--warning)] bg-[var(--surface)] p-3 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
          <div className="text-sm font-black text-[var(--warning-ink)]">{Object.keys(pending).length} 项分配调整待确认（尚未写入数据库）</div>
          <div className="flex gap-2">
            <button type="button" disabled={saving} className="tag" onClick={() => setPending({})}>放弃</button>
            <button type="button" disabled={saving} onClick={() => void savePending()} className="inline-flex h-9 items-center rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] disabled:opacity-50">
              {saving ? "保存中..." : "确认保存"}
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
