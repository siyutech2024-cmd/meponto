"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Send, UserCheck } from "lucide-react";
import type { DispatchShift, ShiftSignup } from "../lib/dispatch";

/**
 * Right-hand rider picker: select a shift on the left, tick riders here and
 * submit their signups in one click. Franchise mode lists every rider of the
 * franchise (grouped by station); station mode lists only that station.
 */

type RiderRow = { id: string; name: string; ninetyNineId?: string; cpf: string; franchise?: string; ponto: string; status: string };

export function ShiftRiderPicker({
  shift,
  franchise,
  fixedStation,
  headers,
  signups,
  onDone,
  onError,
}: {
  shift: DispatchShift | null;
  franchise: string;
  fixedStation?: string;
  headers: Record<string, string>;
  signups: ShiftSignup[];
  onDone: (text: string) => void;
  onError: (text: string) => void;
}) {
  const [riders, setRiders] = useState<RiderRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/riders", { headers, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => payload && setRiders(payload.data as RiderRow[]))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Riders eligible for this picker: bound to the franchise (and station when
  // fixed), with a 99 ID (required by Eastwind reporting).
  const pool = useMemo(() => {
    const term = query.trim().toLowerCase();
    return riders
      .filter((rider) => rider.ninetyNineId)
      .filter((rider) => !franchise || rider.franchise === franchise)
      .filter((rider) => !fixedStation || rider.ponto === fixedStation)
      .filter((rider) => !term || rider.name.toLowerCase().includes(term) || String(rider.ninetyNineId).includes(term))
      .sort((a, b) => a.ponto.localeCompare(b.ponto) || a.name.localeCompare(b.name));
  }, [riders, franchise, fixedStation, query]);

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
        </div>
        <span className="tag">{selected.size} / {selectable.length} 可选</span>
      </div>

      <div className="relative mb-2">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索骑手姓名 / 99ID"
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
        {pool.length === 0 && <div className="py-6 text-center text-sm font-bold text-[var(--muted)]">没有可提报的骑手（需要绑定 99ID{fixedStation ? " 且属于本站" : ""}）。</div>}
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
              <span className="shrink-0 font-mono text-[10px] font-bold text-[var(--muted)]">{rider.ninetyNineId}</span>
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
        <Send size={15} /> 提报 {selected.size} 名骑手
      </button>
    </div>
  );
}
