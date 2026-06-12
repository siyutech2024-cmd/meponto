"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCcw, Send, Star, XCircle } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../../components/ui";
import { readSession } from "../../lib/session";
import type { DispatchShift, ShiftQuota, ShiftSignup } from "../../lib/dispatch";

type Board = { shifts: DispatchShift[]; quotas: ShiftQuota[]; signups: ShiftSignup[] };

const statusLabel: Record<string, string> = { scheduling: "排班中", executing: "执行中", finished: "已结束" };

export default function FranchiseDispatchPage() {
  const session = useMemo(() => readSession(), []);
  // SERVER session is the source of truth for identity — localStorage can be
  // stale after account switches and would query the wrong franchise.
  const [franchise, setFranchise] = useState(session?.franchise || "");
  // HQ sessions have no franchise binding → supervisor mode with a picker.
  const [hqMode, setHqMode] = useState(false);
  const [allFranchises, setAllFranchises] = useState<string[]>([]);
  useEffect(() => {
    void fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const user = payload?.data?.user ?? payload?.user;
        if (user?.franchise) {
          setFranchise(user.franchise);
        } else if (user?.portal === "franchise" && user?.organization) {
          setFranchise(user.organization);
        } else {
          setHqMode(true);
        }
      })
      .catch(() => undefined);
  }, []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Franchise Admin" }), [session]);

  const [board, setBoard] = useState<Board>({ shifts: [], quotas: [], signups: [] });
  const [myStations, setMyStations] = useState<string[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "err" | "warn"; text: string } | null>(null);
  const [stationInputs, setStationInputs] = useState<Record<string, string>>({}); // `${shiftId}|${station}` -> quota
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!franchise) return;
    const response = await fetch(`/api/dispatch?franchise=${encodeURIComponent(franchise)}`, { headers, cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setBoard(payload.data);
  }, [headers, franchise]);

  useEffect(() => {
    void load();
  }, [load]);

  // Network: franchise list (HQ picker default) + this franchise's stations.
  useEffect(() => {
    void fetch("/api/network", { headers, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const franchises = (payload?.data?.franchises ?? []) as Array<{ name: string }>;
        const stations = (payload?.data?.stations ?? []) as Array<{ name: string; franchise?: string }>;
        setAllFranchises(franchises.map((item) => item.name));
        setFranchise((current) => current || franchises[0]?.name || "");
        if (franchise) setMyStations(stations.filter((item) => item.franchise === franchise).map((item) => item.name));
      })
      .catch(() => undefined);
  }, [franchise, headers]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/dispatch", { method: "POST", headers, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? `请求失败 (${response.status})` });
      return null;
    }
    void load();
    return payload.data ?? {};
  }

  // Shifts where HQ allocated a franchise-level quota to us.
  const myShifts = board.shifts
    .map((shift) => {
      const franchiseQuota = board.quotas.find((quota) => quota.shiftId === shift.id && quota.level === "franchise" && quota.franchise === franchise);
      const stationQuotas = board.quotas.filter((quota) => quota.shiftId === shift.id && quota.level === "station" && quota.franchise === franchise);
      return { shift, franchiseQuota, stationQuotas };
    })
    .filter((row) => row.franchiseQuota);

  const pending = board.signups.filter((signup) => signup.status === "submitted");
  const knownStations = [...new Set(board.quotas.filter((q) => q.level === "station" && q.franchise === franchise).map((q) => q.station))];

  return (
    <AppShell>
      <PageTitle
        title="排班配额与审核"
        eyebrow={hqMode ? `总部督导视角 · ${franchise || "选择加盟商"}` : `加盟商工作台 · ${franchise}`}
        action={
          <div className="flex items-center gap-2">
            {hqMode && (
              <select
                className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-xs font-black text-[var(--text)] outline-none focus:border-[var(--accent)]"
                value={franchise}
                onChange={(e) => setFranchise(e.target.value)}
              >
                {allFranchises.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            )}
            <button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> 刷新</button>
          </div>
        }
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      <FranchiseOverview franchise={franchise} headers={headers} />

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="panel p-4">
          <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">总部分配给我的班次配额 → 拆分给站点</div>
          {myShifts.length === 0 ? (
            <div className="text-sm font-bold text-[var(--muted)]">总部还没有给 {franchise} 分配班次配额。</div>
          ) : (
            <div className="space-y-3">
              {myShifts.map(({ shift, franchiseQuota, stationQuotas }) => {
                const allocated = stationQuotas.reduce((sum, quota) => sum + quota.quota, 0);
                return (
                  <div key={shift.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-black">
                        {shift.isCritical && <Star size={13} className="text-[var(--accent)]" />}
                        {shift.date} {shift.timeRange}
                        <span className="text-[10px] font-bold text-[var(--muted)]">{shift.hotzone}</span>
                        <Badge value={statusLabel[shift.status] ?? shift.status} />
                      </div>
                      <div className="text-xs font-black">
                        我的配额 <span className="text-[var(--accent)]">{franchiseQuota?.quota}</span> ｜ 已拆 <span className={allocated > (franchiseQuota?.quota ?? 0) ? "text-[var(--danger-ink)]" : ""}>{allocated}</span>
                      </div>
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      {(myStations.length > 0 ? myStations : knownStations).map((station) => {
                        const existing = stationQuotas.find((quota) => quota.station === station);
                        const key = `${shift.id}|${station}`;
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <span className="w-32 truncate text-xs font-bold">{station}</span>
                            <input
                              inputMode="numeric"
                              className="h-9 w-20 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] text-center text-sm font-black outline-none focus:border-[var(--accent)]"
                              value={stationInputs[key] ?? String(existing?.quota ?? "")}
                              onChange={(e) => setStationInputs({ ...stationInputs, [key]: e.target.value.replace(/\D/g, "") })}
                            />
                            <button
                              type="button"
                              className="tag"
                              onClick={async () => {
                                const quota = Number(stationInputs[key] ?? existing?.quota ?? 0);
                                const result = await post({ action: "quota", shiftId: shift.id, level: "station", franchise, station, quota });
                                if (result) setMessage({ tone: "ok", text: `${station} 配额已更新为 ${quota}。` });
                              }}
                            >
                              保存
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="panel p-4">
          <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">待审核报名（{pending.length}）· 以站点为准</div>
          {(() => {
            const stations = [...new Set(board.signups.map((x) => x.station))];
            const rows = stations.map((name) => ({
              name,
              pending: board.signups.filter((x) => x.station === name && x.status === "submitted").length,
              total: board.signups.filter((x) => x.station === name).length,
            }));
            return rows.length > 0 ? (
              <div className="mb-3 grid gap-2 sm:grid-cols-2">
                {rows.map((row) => (
                  <div key={row.name} className={`flex items-center justify-between rounded-[8px] border px-3 py-2 text-[12px] font-bold ${row.pending > 0 ? "border-[var(--warning)] bg-[var(--warning-bg)]" : "border-[var(--line)] bg-[var(--surface-raised)]"}`}>
                    <span className="font-black">{row.name}</span>
                    <span className="flex items-center gap-2">
                      待审 {row.pending} / {row.total}
                      {row.pending > 0 && (
                        <button
                          type="button"
                          className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-black uppercase text-[var(--accent-ink)]"
                          onClick={async () => {
                            const result = await post({ action: "nudge", scope: "station", name: row.name });
                            if (result) setMessage({ tone: "ok", text: `已催办站点 ${row.name}。` });
                          }}
                        >
                          催审核
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ) : null;
          })()}
          {pending.length === 0 ? (
            <div className="text-sm font-bold text-[var(--muted)]">暂无待审核报名。</div>
          ) : (
            <>
              <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
                {pending.map((signup) => {
                  const shift = board.shifts.find((item) => item.id === signup.shiftId);
                  return (
                    <label key={signup.id} className="flex cursor-pointer items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-2">
                      <input
                        type="checkbox"
                        checked={selected.has(signup.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(signup.id);
                          else next.delete(signup.id);
                          setSelected(next);
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-black">{signup.riderName || signup.rider99Id}</div>
                        <div className="truncate text-[11px] font-bold text-[var(--muted)]">
                          {signup.station} ｜ {shift ? `${shift.date} ${shift.timeRange}` : signup.shiftId} ｜ 99ID {signup.rider99Id}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={selected.size === 0}
                  onClick={async () => {
                    const result = await post({ action: "review", signupIds: [...selected], status: "approved" });
                    if (result) {
                      setMessage({ tone: "ok", text: `已通过 ${selected.size} 条报名。` });
                      setSelected(new Set());
                    }
                  }}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-[8px] bg-[var(--accent)] text-xs font-black uppercase text-[var(--accent-ink)] disabled:opacity-40"
                >
                  <CheckCircle2 size={14} /> 批量通过
                </button>
                <button
                  type="button"
                  disabled={selected.size === 0}
                  onClick={async () => {
                    const result = await post({ action: "review", signupIds: [...selected], status: "rejected" });
                    if (result) {
                      setMessage({ tone: "ok", text: `已驳回 ${selected.size} 条报名。` });
                      setSelected(new Set());
                    }
                  }}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-[8px] border border-[var(--line)] text-xs font-black uppercase text-[var(--danger-ink)] disabled:opacity-40"
                >
                  <XCircle size={14} /> 批量驳回
                </button>
              </div>
              <div className="mt-2 flex items-center gap-1 text-[11px] font-bold text-[var(--muted)]">
                <Send size={12} /> 审核通过后由总部运营统一填报 Eastwind。
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

/** Franchise identity card + this-week KPI strip (own data only). */
function FranchiseOverview({ franchise, headers }: { franchise: string; headers: Record<string, string> }) {
  const [info, setInfo] = useState<{ owner?: string; phone?: string; city?: string; depositBalance?: number; stations: number; riders: number } | null>(null);
  const [kpi, setKpi] = useState<{ orders: number; settle: number; ar: number | null; reportDate: string } | null>(null);
  const [week, setWeek] = useState<{ from: string; to: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const [networkResponse, ridersResponse, weeklyResponse, perfResponse] = await Promise.all([
        fetch("/api/network", { headers, cache: "no-store" }),
        fetch("/api/riders", { headers, cache: "no-store" }),
        fetch("/api/wallet?view=weekly", { headers, cache: "no-store" }),
        fetch("/api/performance", { headers, cache: "no-store" }),
      ]);
      if (networkResponse.ok) {
        const network = (await networkResponse.json()).data as { franchises: Array<{ name: string; owner?: string; phone?: string; city?: string; depositBalance?: number }>; stations: Array<{ franchise?: string }> };
        const mine = network.franchises.find((f) => f.name === franchise);
        const stations = network.stations.filter((s) => s.franchise === franchise).length;
        setInfo({ owner: mine?.owner, phone: mine?.phone, city: mine?.city, depositBalance: mine?.depositBalance, stations, riders: 0 });
      }
      if (ridersResponse.ok) {
        const riders = (await ridersResponse.json()).data as Array<{ franchise?: string }>;
        setInfo((current) => (current ? { ...current, riders: riders.length } : current));
      }
      if (weeklyResponse.ok) {
        const weekly = (await weeklyResponse.json()).data as { week: { from: string; to: string }; franchises: Array<{ franchise: string; settle: number; riders: Array<{ orders: number }> }> };
        setWeek(weekly.week);
        const mine = weekly.franchises.find((g) => g.franchise === franchise);
        setKpi((current) => ({ orders: mine?.riders.reduce((sum, r) => sum + r.orders, 0) ?? 0, settle: mine?.settle ?? 0, ar: current?.ar ?? null, reportDate: current?.reportDate ?? "" }));
      }
      if (perfResponse.ok) {
        const perf = (await perfResponse.json()).data as { date: string | null; riders: Array<{ ar: number | null }> };
        const ars = perf.riders.map((r) => r.ar).filter((v): v is number => v !== null && Number.isFinite(v));
        const avg = ars.length ? Math.round((ars.reduce((sum, v) => sum + v, 0) / ars.length) * 10) / 10 : null;
        setKpi((current) => ({ orders: current?.orders ?? 0, settle: current?.settle ?? 0, ar: avg, reportDate: perf.date ?? "" }));
      }
    })();
  }, [franchise, headers]);

  const md = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

  return (
    <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <div className="panel p-3 md:col-span-2">
        <div className="text-[10px] font-black uppercase text-[var(--muted)]">加盟商档案</div>
        <div className="mt-1 text-sm font-black">{franchise}</div>
        <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">
          {info ? `${info.owner || "—"}${info.phone ? ` ｜ ${info.phone}` : ""} ｜ ${info.city || "São Paulo"}` : "加载中..."}
        </div>
      </div>
      {[
        ["下属站点", info ? String(info.stations) : "—"],
        ["骑手数", info ? String(info.riders) : "—"],
        ["预存余额", info ? `R$ ${(info.depositBalance ?? 0).toFixed(2)}` : "—"],
        [week ? `本周完单（${md(week.from)}–${md(week.to)}）` : "本周完单", kpi ? String(kpi.orders) : "—"],
      ].map(([label, value]) => (
        <div key={label} className="panel p-3 text-center">
          <div className="text-[10px] font-black uppercase text-[var(--muted)]">{label}</div>
          <div className="mt-1 text-lg font-black">{value}</div>
        </div>
      ))}
      <div className="panel border-[var(--accent)] p-3 text-center">
        <div className="text-[10px] font-black uppercase text-[var(--accent)]">本周应结{kpi?.ar !== null && kpi?.ar !== undefined ? ` ｜ AR ${kpi.ar}%` : ""}</div>
        <div className="mt-1 text-lg font-black text-[var(--accent)]">{kpi ? `R$ ${kpi.settle.toFixed(2)}` : "—"}</div>
      </div>
    </div>
  );
}
