"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Pencil, RefreshCcw } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../../components/ui";
import { downloadCsv } from "../../lib/csv";

type RiderRow = {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  pix: string;
  bairro: string;
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

type DailyRow = { date: string; orders: number; onlineHours: number | null; ar: number | null; settleAmount: number };
type Network = { franchises: Array<{ id: string; name: string }>; stations: Array<{ id: string; name: string; franchise?: string }> };

const HEADERS = { "Content-Type": "application/json" };
const money = (v: number) => `R$ ${v.toFixed(2)}`;
const input = "h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--accent)]";

function Field({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
      <div className="text-[10px] font-black uppercase text-[var(--muted)]">{label}</div>
      <div className={`mt-1 text-sm font-black ${mono ? "font-mono" : ""}`}>{value === "" || value === undefined ? "—" : value}</div>
    </div>
  );
}

export default function RiderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [rider, setRider] = useState<RiderRow | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [network, setNetwork] = useState<Network>({ franchises: [], stations: [] });
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", cpf: "", phone: "", pix: "", bairro: "", status: "Active" });
  const [assign, setAssign] = useState({ franchise: "", ponto: "" });
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const reveal = revealed ? "&reveal=1" : "";
    const [ridersResponse, networkResponse] = await Promise.all([
      fetch(`/api/riders?detail=1${reveal}`, { headers: revealed ? { ...HEADERS, "x-vento-reveal": "1" } : HEADERS, cache: "no-store" }),
      fetch("/api/network", { headers: HEADERS, cache: "no-store" }),
    ]);
    if (ridersResponse.ok) {
      const all = (await ridersResponse.json()).data as RiderRow[];
      const found = all.find((item) => item.id === id) ?? null;
      setRider(found);
      if (found) {
        setForm({ name: found.name, cpf: found.cpf, phone: found.phone, pix: found.pix, bairro: found.bairro ?? "", status: found.status });
        setAssign({ franchise: found.franchise && found.franchise !== "Unassigned" ? found.franchise : "", ponto: found.ponto !== "Unassigned" ? found.ponto : "" });
      }
    }
    if (networkResponse.ok) {
      const payload = (await networkResponse.json()).data;
      setNetwork({ franchises: payload.franchises, stations: payload.stations });
    }
    setLoaded(true);
  }, [id, revealed]);

  useEffect(() => {
    void load();
  }, [load]);

  // Last 14 days of settle rows for this rider (from the statement endpoint).
  useEffect(() => {
    if (!rider?.ninetyNineId) return;
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10);
    void fetch(`/api/wallet?statement=all&from=${from}&to=${to}`, { headers: HEADERS, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (!payload) return;
        const rows = (payload.data.rows as Array<DailyRow & { rider99Id: string }>).filter((row) => row.rider99Id === rider.ninetyNineId);
        setDaily(rows.sort((a, b) => b.date.localeCompare(a.date)));
      });
  }, [rider?.ninetyNineId]);

  async function post(body: Record<string, unknown>, okText: string) {
    const response = await fetch("/api/riders", { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? `操作失败 (${response.status})` });
      return false;
    }
    setMessage({ tone: "ok", text: okText });
    void load();
    return true;
  }

  const stationOptions = useMemo(
    () => network.stations.filter((s) => !assign.franchise || s.franchise === assign.franchise),
    [network.stations, assign.franchise],
  );

  if (loaded && !rider) {
    return (
      <AppShell>
        <PageTitle title="骑手不存在" eyebrow="骑手详情" action={<Link className="tag" href="/riders">返回骑手列表</Link>} />
        <div className="panel p-4 text-sm font-bold text-[var(--muted)]">找不到该骑手档案，可能已被删除。</div>
      </AppShell>
    );
  }
  if (!rider) {
    return (
      <AppShell>
        <div className="panel p-6 text-sm font-bold text-[var(--muted)]">加载中...</div>
      </AppShell>
    );
  }

  const totalSettle = daily.reduce((sum, row) => sum + row.settleAmount, 0);

  return (
    <AppShell>
      <PageTitle
        title={rider.name}
        eyebrow={`骑手详情 · 99ID ${rider.ninetyNineId ?? "—"}`}
        action={
          <div className="flex gap-2">
            <Link className="tag inline-flex items-center gap-1" href="/riders"><ArrowLeft size={13} /> 返回列表</Link>
            <button type="button" className="tag inline-flex items-center gap-1" onClick={() => void load()}><RefreshCcw size={13} /> 刷新</button>
          </div>
        }
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        {/* 基本信息 + 编辑 */}
        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-black">基本信息</h2>
            <div className="flex gap-2">
              <button type="button" className="tag inline-flex items-center gap-1" onClick={() => setRevealed((v) => !v)}>
                {revealed ? <EyeOff size={14} /> : <Eye size={14} />} {revealed ? "隐藏" : "显示敏感"}
              </button>
              <button type="button" className="tag inline-flex items-center gap-1" onClick={() => setEditing((v) => !v)}>
                <Pencil size={13} /> {editing ? "取消编辑" : "编辑资料"}
              </button>
            </div>
          </div>
          {editing ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <input className={input} placeholder="姓名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className={input} placeholder="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
              <input className={input} placeholder="电话" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <input className={input} placeholder="PIX" value={form.pix} onChange={(e) => setForm({ ...form, pix: e.target.value })} />
              <input className={input} placeholder="街区" value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
              <select className={input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {["Active", "Night Shift", "Risk", "Inactive"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-[8px] bg-[var(--accent)] px-4 text-sm font-black uppercase text-[var(--accent-ink)] sm:col-span-2"
                onClick={async () => {
                  const ok = await post({ action: "updateProfile", riderId: rider.id, ...form }, "资料已保存。");
                  if (ok) setEditing(false);
                }}
              >
                保存资料
              </button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="CPF" value={rider.cpf || "—"} mono />
              <Field label="PIX" value={rider.pix || "—"} mono />
              <Field label="电话" value={rider.phone || "—"} mono />
              <Field label="街区" value={rider.bairro || "—"} />
              <Field label="注册日期" value={rider.joinDate || "—"} />
              <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                <div className="text-[10px] font-black uppercase text-[var(--muted)]">状态</div>
                <div className="mt-1"><Badge value={rider.status} /></div>
              </div>
            </div>
          )}
        </div>

        {/* 归属与调整 */}
        <div className="panel p-4">
          <h2 className="mb-3 text-lg font-black">归属</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase text-[var(--muted)]">加盟商</span>
              <select className={input} value={assign.franchise} onChange={(e) => setAssign({ franchise: e.target.value, ponto: "" })}>
                <option value="">未绑定</option>
                {network.franchises.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase text-[var(--muted)]">站点</span>
              <select className={input} value={assign.ponto} onChange={(e) => setAssign({ ...assign, ponto: e.target.value })}>
                <option value="">未绑定</option>
                {stationOptions.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-[8px] bg-[var(--accent)] px-4 text-sm font-black uppercase text-[var(--accent-ink)]"
            onClick={() => void post({ action: "assign", riderId: rider.id, franchise: assign.franchise, ponto: assign.ponto }, "归属已更新。")}
          >
            保存归属
          </button>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="积分余额" value={`${rider.pointsBalance} pts`} />
            <Field label="邀请人" value={rider.source === "report" ? "Eastwind 日报" : "—"} />
          </div>
        </div>

        {/* 表现 */}
        <div className="panel p-4 lg:col-span-2">
          <h2 className="mb-3 text-lg font-black">表现</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="AR（最近上报）" value={rider.reportAr !== null ? `${rider.reportAr}%` : "—"} />
            <Field label="累计完单" value={rider.totalOrders} />
            <Field label="最近上报日期" value={rider.lastReportDate || "—"} />
            <Field label="近14天结算" value={money(totalSettle)} />
          </div>
        </div>
      </section>

      {/* 近14天逐日明细 */}
      <section className="panel mt-4 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-black">近 14 天逐日明细</h2>
          {daily.length > 0 && (
            <button
              type="button"
              className="tag"
              onClick={() =>
                downloadCsv(
                  `rider-${rider.ninetyNineId}-daily`,
                  ["日期", "完单", "在线时长", "AR%", "结算金额"],
                  daily.map((row) => [row.date, String(row.orders), row.onlineHours ?? "", row.ar ?? "", row.settleAmount.toFixed(2)]),
                )
              }
            >
              导出 CSV
            </button>
          )}
        </div>
        {daily.length === 0 ? (
          <div className="text-sm font-bold text-[var(--muted)]">近 14 天没有日报数据{rider.ninetyNineId ? "" : "（该骑手未绑定 99ID）"}。</div>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[10px] font-black uppercase text-[var(--muted)]">
                  <th className="pb-2">日期</th><th className="pb-2 text-right">完单</th><th className="pb-2 text-right">在线时长</th><th className="pb-2 text-right">AR</th><th className="pb-2 text-right">结算金额</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((row) => (
                  <tr key={row.date} className="border-t border-[var(--line)]">
                    <td className="py-2 font-mono font-bold">{row.date}</td>
                    <td className="py-2 text-right font-black">{row.orders}</td>
                    <td className="py-2 text-right">{row.onlineHours ?? "—"}</td>
                    <td className="py-2 text-right">{row.ar !== null ? `${row.ar}%` : "—"}</td>
                    <td className="py-2 text-right font-black">{money(row.settleAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
