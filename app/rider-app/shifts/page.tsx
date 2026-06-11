"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, Star } from "lucide-react";
import { readSession } from "../../lib/session";
import type { DispatchShift, ShiftSignup } from "../../lib/dispatch";

type Board = { shifts: DispatchShift[]; signups: ShiftSignup[] };

const signupLabel: Record<string, string> = {
  submitted: "Em análise",
  approved: "Aprovado",
  rejected: "Recusado",
  reported: "Reportado",
  cancelled: "Cancelado",
};

export default function RiderShiftsPage() {
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Rider" }), [session]);

  const [board, setBoard] = useState<Board>({ shifts: [], signups: [] });
  const [name, setName] = useState(session?.name ?? "");
  const [rider99Id, setRider99Id] = useState("");
  const [station, setStation] = useState("Santo Amaro");
  const [profileLocked, setProfileLocked] = useState(false);
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

  // Auto-fill from the registered rider profile: name / 99 ID / station come
  // from registration, so the rider doesn't have to type them every time.
  useEffect(() => {
    if (!session?.name) return;
    let cancelled = false;
    fetch("/api/riders", { headers: { "x-vento-role": session.role ?? "Rider" }, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload?.data) return;
        const me = (payload.data as Array<{ name: string; ninetyNineId?: string; ponto?: string }>).find(
          (rider) => rider.name === session.name,
        );
        if (me) {
          setName(me.name);
          if (me.ninetyNineId) setRider99Id(me.ninetyNineId);
          if (me.ponto) setStation(me.ponto);
          if (me.ninetyNineId) setProfileLocked(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session]);

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
      setMessage({ tone: "err", text: "Preencha o nome e um ID 99 válido." });
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
        franchise: "Autoinscrição",
        station,
        riders: [{ riderName: name.trim(), rider99Id: rider99Id.trim() }],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusyShift("");
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? `Falha na inscrição (${response.status})` });
      return;
    }
    const skipped = (payload.data.skipped ?? []) as string[];
    setMessage(skipped.length > 0 ? { tone: "err", text: `Não inscrito: ${skipped.join(", ")}` } : { tone: "ok", text: `Inscrito em ${shift.date} ${shift.timeRange} — aguardando análise da estação/franquia.` });
    void load();
  }

  const grouped = [...new Set(board.shifts.map((shift) => shift.date))].sort().map((date) => ({
    date,
    shifts: board.shifts.filter((shift) => shift.date === date).sort((a, b) => a.timeRange.localeCompare(b.timeRange)),
  }));

  return (
    <div className="mx-auto min-h-screen max-w-md space-y-4 p-4">
      <div className="flex items-center gap-3">
        <Link href="/rider-app" className="tag inline-flex items-center gap-1"><ArrowLeft size={13} /> Voltar</Link>
        <h1 className="flex items-center gap-2 text-lg font-black"><CalendarDays size={18} className="text-[var(--accent)]" /> Inscrição de Turnos</h1>
      </div>

      {profileLocked ? (
        <div className="panel flex items-center justify-between p-4">
          <div>
            <div className="text-[10px] font-black uppercase text-[var(--muted)]">Identidade de inscrição (do cadastro)</div>
            <div className="mt-1 text-sm font-black">{name}</div>
            <div className="text-[11px] font-bold text-[var(--muted)]">99 ID {rider99Id} ｜ {station}</div>
          </div>
          <CheckCircle2 size={20} className="text-[var(--ok-ink)]" />
        </div>
      ) : (
        <div className="panel space-y-2 p-4">
          <div className="text-[10px] font-black uppercase text-[var(--muted)]">Meus dados (cadastro não vinculado — preencha)</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
          <div className="grid grid-cols-2 gap-2">
            <input value={rider99Id} onChange={(e) => setRider99Id(e.target.value.replace(/\D/g, ""))} placeholder="ID 99 do entregador" className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
            <input value={station} onChange={(e) => setStation(e.target.value)} placeholder="Estação" className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
          </div>
        </div>
      )}

      {message && (
        <div className={`rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      {mySignups.length > 0 && (
        <div className="panel p-4">
          <div className="mb-2 text-[10px] font-black uppercase text-[var(--muted)]">Minhas inscrições</div>
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

      {grouped.length === 0 && <div className="panel p-6 text-center text-sm font-bold text-[var(--muted)]">Nenhum turno aberto no momento.</div>}

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
                    <div className="text-[11px] font-bold text-[var(--muted)]">{shift.hotzone} ｜ Vagas: {shift.plannedCount}</div>
                  </div>
                  {joined ? (
                    <span className="inline-flex items-center gap-1 text-xs font-black text-[var(--ok-ink)]"><CheckCircle2 size={14} /> Inscrito</span>
                  ) : (
                    <button
                      type="button"
                      disabled={busyShift === shift.id}
                      onClick={() => void signup(shift)}
                      className="h-9 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"
                    >
                      {busyShift === shift.id ? "..." : "Inscrever"}
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
