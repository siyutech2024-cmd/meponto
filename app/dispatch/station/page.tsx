"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, RefreshCcw, Star } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../../components/ui";
import { readSession } from "../../lib/session";
import type { DispatchShift, ShiftQuota, ShiftSignup } from "../../lib/dispatch";
import { ShiftRiderPicker } from "../../components/shift-rider-picker";

type Board = { shifts: DispatchShift[]; quotas: ShiftQuota[]; signups: ShiftSignup[] };

const signupLabel: Record<string, string> = {
  submitted: "待审核",
  approved: "已通过",
  rejected: "已驳回",
  reported: "已填报",
  cancelled: "已取消",
};

export default function StationDispatchPage() {
  const session = useMemo(() => readSession(), []);
  // SERVER session wins — stale localStorage must not point at another station.
  const [identity, setIdentity] = useState({ station: session?.station || "", franchise: session?.franchise || "" });
  // HQ / franchise sessions without a station binding → supervisor picker.
  const [pickerMode, setPickerMode] = useState(false);
  const [stationOptions, setStationOptions] = useState<Array<{ name: string; franchise?: string }>>([]);
  useEffect(() => {
    void fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const user = payload?.data?.user ?? payload?.user;
        if (user?.station) {
          setIdentity({ station: user.station, franchise: user.franchise || "" });
        } else if (user?.portal === "ponto" && user?.organization) {
          setIdentity({ station: user.organization, franchise: user.franchise || "" });
        } else {
          setPickerMode(true);
          void fetch("/api/network", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((net) => {
              const all = (net?.data?.stations ?? []) as Array<{ name: string; franchise?: string }>;
              const mine = user?.franchise ? all.filter((item) => item.franchise === user.franchise) : all;
              setStationOptions(mine);
              setIdentity((current) => current.station ? current : { station: mine[0]?.name ?? "", franchise: mine[0]?.franchise ?? user?.franchise ?? "" });
            })
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }, []);
  const station = identity.station;
  const franchise = identity.franchise;
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Ponto Manager" }), [session]);

  const [board, setBoard] = useState<Board>({ shifts: [], quotas: [], signups: [] });
  const [message, setMessage] = useState<{ tone: "ok" | "err" | "warn"; text: string } | null>(null);
  const [shiftId, setShiftId] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/dispatch?station=${encodeURIComponent(station)}&franchise=${encodeURIComponent(franchise)}`, { headers, cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setBoard(payload.data);
  }, [headers, station, franchise]);

  useEffect(() => {
    void load();
  }, [load]);

  // Shifts that have a station-level quota for us.
  const myRows = board.shifts
    .map((shift) => {
      const quota = board.quotas.find((item) => item.shiftId === shift.id && item.level === "station" && item.station === station);
      const signups = board.signups.filter((item) => item.shiftId === shift.id);
      return { shift, quota, signups };
    })
    .filter((row) => row.quota);

  const openShifts = myRows.filter((row) => row.shift.status === "scheduling");

  return (
    <AppShell>
      <PageTitle
        title="排班提报"
        eyebrow={`站点工作台 · ${station}（${franchise}）`}
        action={
          <div className="flex items-center gap-2">
            {pickerMode && (
              <select
                className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-xs font-black text-[var(--text)] outline-none focus:border-[var(--accent)]"
                value={station}
                onChange={(e) => {
                  const next = stationOptions.find((item) => item.name === e.target.value);
                  setIdentity({ station: e.target.value, franchise: next?.franchise ?? "" });
                }}
              >
                {stationOptions.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
              </select>
            )}
            <button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> 刷新</button>
          </div>
        }
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : message.tone === "warn" ? "border-[var(--warning)] bg-[var(--warning-bg)] text-[var(--warning-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="panel p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]">
            <ClipboardList size={14} /> 本站班次与报名状态
          </div>
          {myRows.length === 0 ? (
            <div className="text-sm font-bold text-[var(--muted)]">加盟商还没有给 {station} 分配班次配额。</div>
          ) : (
            <div className="space-y-3">
              {myRows.map(({ shift, quota, signups }) => {
                const approved = signups.filter((item) => item.status === "approved" || item.status === "reported").length;
                const active = shiftId === shift.id;
                return (
                  <div
                    key={shift.id}
                    onClick={() => shift.status === "scheduling" && setShiftId(shift.id)}
                    className={`rounded-[8px] border p-3 transition-colors ${shift.status === "scheduling" ? "cursor-pointer" : ""} ${active ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] bg-[var(--surface-raised)] hover:border-[var(--muted)]"}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-black">
                        {shift.isCritical && <Star size={13} className="text-[var(--accent)]" />}
                        {shift.date} {shift.timeRange}
                      </div>
                      <div className="text-xs font-black">
                        配额 <span className="text-[var(--accent)]">{quota?.quota}</span> ｜ 已通过 {approved} ｜ 已提报 {signups.length}
                      </div>
                    </div>
                    {signups.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {signups.map((signup) => (
                          <span key={signup.id} className="tag">
                            {signup.riderName || signup.rider99Id} <Badge value={signupLabel[signup.status] ?? signup.status} />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <ShiftRiderPicker
          shift={openShifts.find((row) => row.shift.id === shiftId)?.shift ?? null}
          franchise={franchise}
          fixedStation={station}
          headers={headers}
          signups={board.signups}
          onDone={(text) => { setMessage({ tone: "ok", text }); void load(); }}
          onError={(text) => { setMessage({ tone: "err", text }); void load(); }}
        />
      </div>
    </AppShell>
  );
}
