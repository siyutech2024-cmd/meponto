"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, Star } from "lucide-react";
import { readSession } from "../../lib/session";
import type { DispatchShift, ShiftSignup } from "../../lib/dispatch";

type Board = { shifts: DispatchShift[]; signups: ShiftSignup[] };

const signupLabel: Record<string, string> = {
  submitted: "待审核",
  approved: "已通过",
  rejected: "已驳回",
  reported: "已填报",
  cancelled: "已取消",
};

export default function RiderShiftsPage() {
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Rider" }), [session]);

  const [board, setBoard] = useState<Board>({ shifts: [], signups: [] });
  const [name, setName] = useState(session?.name ?? "");
  const [rider99Id, setRider99Id] = useState("");
  const [station, setStation] = useState("Santo Amaro");
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busyShift, setBusyShift] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("mePontoRider99Id");
      if (saved) setRider99Id(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    const response = await fetch("/api/dispatch?view=open", { headers, cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setBoard(payload.data);
  }, [headers]);

  useEffect(() => {
    void load();
  }, [load]);

  const mySignups = board.signups.filter((signup) => rider99Id && signup.rider99Id === rider99Id);
  const myShiftIds = new Set(mySignups.filter((signup) => signup.status !== "rejected" && signup.status !== "cancelled").map((signup) => signup.shiftId));

  async function signup(shift: DispatchShift) {
    if (!name.trim() || !/^\d{6,}$/.test(rider99Id.trim())) {
      setMessage({ tone: "err", text: "请先填写姓名和有效的 99 骑手 ID。" });
      return;
    }
    setBusyShift(shift.id);
    setMessage(null);
    try {
      window.localStorage.setItem("mePontoRider99Id", rider99Id.trim());
    } catch {
      /* ignore */
    }
    const response = await fetch("/api/dispatch", {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: "signup",
        shiftId: shift.id,
        franchise: "自报名",
        station,
        riders: [{ riderName: name.trim(), rider99Id: rider99Id.trim() }],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusyShift("");
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? `报名失败 (${response.status})` });
      return;
    }
    const skipped = (payload.data.skipped ?? []) as string[];
    setMessage(skipped.length > 0 ? { tone: "err", text: `未报名：${skipped.join("、")}` } : { tone: "ok", text: `已报名 ${shift.date} ${shift.timeRange}，等待站点/加盟商审核。` });
    void load();
  }

  const grouped = [...new Set(board.shifts.map((shift) => shift.date))].sort().map((date) => ({
    date,
    shifts: board.shifts.filter((shift) => shift.date === date).sort((a, b) => a.timeRange.localeCompare(b.timeRange)),
  }));

  return (
    <div className="mx-auto min-h-screen max-w-md space-y-4 p-4">
      <div className="flex items-center gap-3">
        <Link href="/rider-app" className="tag inline-flex items-center gap-1"><ArrowLeft size={13} /> 返回</Link>
        <h1 className="flex items-center gap-2 text-lg font-black"><CalendarDays size={18} className="text-[var(--accent)]" /> 班次报名</h1>
      </div>

      <div className="panel space-y-2 p-4">
        <div className="text-[10px] font-black uppercase text-[var(--muted)]">我的信息（用于报名）</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="姓名" className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
        <div className="grid grid-cols-2 gap-2">
          <input value={rider99Id} onChange={(e) => setRider99Id(e.target.value.replace(/\D/g, ""))} placeholder="99 骑手 ID" className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
          <input value={station} onChange={(e) => setStation(e.target.value)} placeholder="所属站点" className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
        </div>
      </div>

      {message && (
        <div className={`rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      {mySignups.length > 0 && (
        <div className="panel p-4">
          <div className="mb-2 text-[10px] font-black uppercase text-[var(--muted)]">我的报名</div>
          <div className="space-y-1">
            {mySignups.map((signup) => {
              const shift = board.shifts.find((item) => item.id === signup.shiftId);
              return (
                <div key={signup.id} className="flex items-center justify-between text-sm font-bold">
                  <span>{shift ? `${shift.date} ${shift.timeRange}` : signup.shiftId}</span>
                  <span className="tag">{signupLabel[signup.status] ?? signup.status}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {grouped.length === 0 && <div className="panel p-6 text-center text-sm font-bold text-[var(--muted)]">当前没有开放报名的班次。</div>}

      {grouped.map(({ date, shifts }) => (
        <div key={date} className="panel p-4">
          <div className="mb-2 text-sm font-black">{date}</div>
          <div className="space-y-2">
            {shifts.map((shift) => {
              const joined = myShiftIds.has(shift.id);
              return (
                <div key={shift.id} className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                  <div>
                    <div className="flex items-center gap-1 text-sm font-black">
                      {shift.isCritical && <Star size={12} className="text-[var(--accent)]" />}
                      {shift.timeRange}
                    </div>
                    <div className="text-[11px] font-bold text-[var(--muted)]">{shift.hotzone} ｜ 计划 {shift.plannedCount} 人</div>
                  </div>
                  {joined ? (
                    <span className="inline-flex items-center gap-1 text-xs font-black text-[var(--ok-ink)]"><CheckCircle2 size={14} /> 已报名</span>
                  ) : (
                    <button
                      type="button"
                      disabled={busyShift === shift.id}
                      onClick={() => void signup(shift)}
                      className="h-9 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"
                    >
                      {busyShift === shift.id ? "..." : "报名"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
