"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Send, UserCheck } from "lucide-react";
import type { DispatchShift, ShiftSignup } from "../lib/dispatch";
import { maskCpf } from "../lib/masking";

/**
 * Right-hand rider picker: select a shift on the left, tick riders here and
 * submit their signups in one click. Franchise mode lists every rider of the
 * franchise (grouped by station); station mode lists only that station.
 */

type RiderRow = { id: string; name: string; ninetyNineId?: string; cpf: string; franchise?: string; ponto: string; status: string; pool?: "standard" | "pro" };

export function ShiftRiderPicker({
  shift,
  franchise,
  fixedStation,
  headers,
  signups,
  onDone,
  onError,
  weekShifts = [],
}: {
  shift: DispatchShift | null;
  franchise: string;
  fixedStation?: string;
  headers: Record<string, string>;
  signups: ShiftSignup[];
  onDone: (text: string) => void;
  onError: (text: string) => void;
  /** 本周与当前班次**同池**的全部班次 —— PRO 整周一键提报用。 */
  weekShifts?: DispatchShift[];
}) {
  const [riders, setRiders] = useState<RiderRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  // CPF 搜索:客户端只有脱敏 CPF,输入 ≥4 位数字时向服务端要"命中的骑手 id"(去抖 300ms)。
  const [cpfMatchIds, setCpfMatchIds] = useState<Set<string> | null>(null);
  const queryDigits = query.replace(/\D/g, "");
  useEffect(() => {
    if (queryDigits.length < 4) {
      setCpfMatchIds(null);
      return;
    }
    const timer = setTimeout(() => {
      void fetch(`/api/riders?cpfSearch=${queryDigits}`, { headers, cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => payload && setCpfMatchIds(new Set((payload.data as RiderRow[]).map((rider) => rider.id))))
        .catch(() => undefined);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryDigits]);

  useEffect(() => {
    void fetch("/api/riders", { headers, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => payload && setRiders(payload.data as RiderRow[]))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Riders eligible for this picker: bound to the franchise (and station when
  // fixed), with a 99 ID (required by Eastwind reporting).
  // 模式二:提报列表必须按池过滤。选中 PRO 班次时只列 PRO 骑手 ——
  // 服务端本来就会拒掉混池提报,但让加盟商在 190 人里找自己的十几个 PRO、
  // 提交后再看一串"não é PRO"的拒绝理由,是把校验当成了交互。
  const shiftIsPro = shift?.pool === "pro";
  const pool = useMemo(() => {
    const term = query.trim().toLowerCase();
    // CPF 命中来自服务端(cpfMatchIds);姓名 / 99ID 仍在本地匹配。
    return riders
      .filter((rider) => rider.ninetyNineId)
      .filter((rider) => (shiftIsPro ? rider.pool === "pro" : rider.pool !== "pro"))
      .filter((rider) => !franchise || rider.franchise === franchise)
      .filter((rider) => !fixedStation || rider.ponto === fixedStation)
      .filter(
        (rider) =>
          !term ||
          rider.name.toLowerCase().includes(term) ||
          String(rider.ninetyNineId).includes(term) ||
          (cpfMatchIds?.has(rider.id) ?? false),
      )
      .sort((a, b) => a.ponto.localeCompare(b.ponto) || a.name.localeCompare(b.name));
  }, [riders, franchise, fixedStation, query, shiftIsPro, cpfMatchIds]);

  // Riders already signed up for the selected shift can't be re-submitted.
  const alreadyIn = useMemo(() => {
    if (!shift) return new Set<string>();
    return new Set(signups.filter((s) => s.shiftId === shift.id && s.status !== "rejected" && s.status !== "cancelled").map((s) => s.rider99Id));
  }, [shift, signups]);

  const selectable = pool.filter((rider) => !alreadyIn.has(rider.ninetyNineId!));
  const allSelected = selectable.length > 0 && selectable.every((rider) => selected.has(rider.id));

  useEffect(() => {
    setSelected(new Set());
  }, [shift?.id]);

  async function submit() {
    if (!shift) return;
    const chosen = selectable.filter((rider) => selected.has(rider.id));
    if (chosen.length === 0) return;
    setBusy(true);
    // Group by the rider's own station (fixed station wins).
    const byStation = new Map<string, RiderRow[]>();
    for (const rider of chosen) {
      const stationName = fixedStation || rider.ponto || "Unassigned";
      byStation.set(stationName, [...(byStation.get(stationName) ?? []), rider]);
    }
    let created = 0;
    let failed = 0;
    for (const [stationName, group] of byStation) {
      const response = await fetch("/api/dispatch", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "signup",
          shiftId: shift.id,
          franchise,
          station: stationName,
          riders: group.map((rider) => ({ riderName: rider.name, rider99Id: rider.ninetyNineId, riderCpf: rider.cpf })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) created += Number(payload.data?.created ?? group.length);
      else failed += group.length;
    }
    setBusy(false);
    setSelected(new Set());
    if (failed > 0) onError(`已提报 ${created} 人，${failed} 人失败。`);
    else onDone(`已为 ${shift.date} ${shift.timeRange} 提报 ${created} 名骑手，待审核。`);
  }

  /**
   * PRO 整周一键提报。PRO 是全职、固定排班,常态是"这批人整周全班次都上"——
   * 按班逐个提报要点 7天×3班 次。这里把选中的骑手循环提报到本周全部 PRO 班次;
   * 服务端自带去重(duplicado 跳过)、池校验和配额校验,所以重复点也安全,
   * 汇总结果一次告知。
   */
  async function submitWeek() {
    if (!shift || weekShifts.length === 0) return;
    const chosen = selectable.filter((rider) => selected.has(rider.id));
    if (chosen.length === 0) return;
    setBusy(true);
    let created = 0;
    let failed = 0;
    for (const target of weekShifts) {
      const byStation = new Map<string, RiderRow[]>();
      for (const rider of chosen) {
        const stationName = fixedStation || rider.ponto || "Unassigned";
        byStation.set(stationName, [...(byStation.get(stationName) ?? []), rider]);
      }
      for (const [stationName, group] of byStation) {
        const response = await fetch("/api/dispatch", {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: "signup",
            shiftId: target.id,
            franchise,
            station: stationName,
            riders: group.map((rider) => ({ riderName: rider.name, rider99Id: rider.ninetyNineId, riderCpf: rider.cpf })),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok) created += Number(payload.data?.created ?? 0);
        else failed += group.length;
      }
    }
    setBusy(false);
    setSelected(new Set());
    if (failed > 0) onError(`整周提报:新增 ${created} 条,部分失败(${failed})。`);
    else onDone(`已把 ${chosen.length} 名 PRO 骑手提报到本周 ${weekShifts.length} 个 PRO 班次(新增 ${created} 条,已存在的自动跳过),待审核。`);
  }

  if (!shift) {
    return (
      <div className="panel grid min-h-48 place-items-center p-6 text-center text-sm font-bold text-[var(--muted)]">
        ← 点击左侧班次，在这里勾选要提报的骑手。
      </div>
    );
  }

  return (
    <div className="panel flex flex-col p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-black uppercase text-[var(--accent)]">
          <UserCheck size={14} className="mr-1 inline" />
          提报骑手 · {shift.date} {shift.timeRange}
          {shiftIsPro && <span className="ml-1.5 rounded-full px-1.5 py-[1px] text-[9px]" style={{ background: "#eda100", color: "#171b33" }}>PRO</span>}
        </div>
        <span className="tag">{selected.size} / {selectable.length} 可选</span>
      </div>

      <div className="relative mb-2">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索骑手姓名 / 99ID / CPF"
          className="h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--accent)]"
        />
      </div>

      <label className="mb-1 flex cursor-pointer items-center gap-2 px-1 text-[11px] font-black uppercase text-[var(--muted)]">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--accent)]"
          checked={allSelected}
          onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((rider) => rider.id)) : new Set())}
        />
        全选可提报骑手
      </label>

      <div className="max-h-[380px] flex-1 space-y-1 overflow-y-auto pr-1">
        {pool.length === 0 && (
          <div className="py-6 text-center text-sm font-bold text-[var(--muted)]">
            {shiftIsPro ? "没有可提报的 PRO 骑手（PRO 班次只能提报 PRO 池骑手）。" : `没有可提报的骑手（需要绑定 99ID${fixedStation ? " 且属于本站" : ""}）。`}
          </div>
        )}
        {pool.map((rider) => {
          const taken = alreadyIn.has(rider.ninetyNineId!);
          return (
            <label
              key={rider.id}
              className={`flex items-center gap-2.5 rounded-[8px] border px-2.5 py-2 ${taken ? "cursor-default border-transparent opacity-45" : "cursor-pointer border-[var(--line)] bg-[var(--surface-raised)] hover:border-[var(--accent)]"}`}
            >
              {taken ? (
                <span className="w-4 text-center text-[10px] font-black text-[var(--ok-ink)]">✓</span>
              ) : (
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                  checked={selected.has(rider.id)}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(rider.id)) next.delete(rider.id);
                      else next.add(rider.id);
                      return next;
                    })
                  }
                />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-black">{rider.name}</span>
              {!fixedStation && <span className="tag shrink-0">{rider.ponto}</span>}
              <span className="shrink-0 font-mono text-[10px] font-bold text-[var(--muted)]" translate="no">{rider.ninetyNineId}</span>
              {rider.cpf && <span className="shrink-0 font-mono text-[10px] font-bold text-[var(--muted)]" translate="no" title="CPF">{/^\d{11}$/.test(rider.cpf.replace(/\D/g, "")) ? maskCpf(rider.cpf) : rider.cpf}</span>}
            </label>
          );
        })}
      </div>

      <button
        type="button"
        disabled={busy || selected.size === 0}
        onClick={() => void submit()}
        className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] text-sm font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
      >
        <Send size={15} /> 提报 {selected.size} 名骑手 · 本班次
      </button>
      {shiftIsPro && weekShifts.length > 1 && (
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() => void submitWeek()}
          className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] text-sm font-black uppercase disabled:opacity-50"
          style={{ background: "#eda100", color: "#171b33" }}
        >
          <Send size={15} /> 提报到本周全部 PRO 班次（{weekShifts.length} 班）
        </button>
      )}
    </div>
  );
}
