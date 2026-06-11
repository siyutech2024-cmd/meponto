"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, TrendingUp, XCircle } from "lucide-react";
import { readSession } from "../../lib/session";
import type { DispatchShift, ShiftSignup } from "../../lib/dispatch";

type MySignup = ShiftSignup & { shift: DispatchShift | null };
type MyKpi = { date: string; completedOrders: number; tsh: number | null; ar: number | null; settle?: number };

const statusInfo: Record<string, { text: string; cls: string; icon: "ok" | "wait" | "no" }> = {
  approved: { text: "Confirmado", cls: "text-[var(--ok-ink)]", icon: "ok" },
  submitted: { text: "Em análise", cls: "text-[var(--warning-ink)]", icon: "wait" },
  reported: { text: "Enviado à 99", cls: "text-[var(--accent)]", icon: "ok" },
  rejected: { text: "Recusado", cls: "text-[var(--danger-ink)]", icon: "no" },
  cancelled: { text: "Cancelado", cls: "text-[var(--muted)]", icon: "no" },
};

const weekday = (date: string) => {
  const names = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  return names[new Date(`${date}T12:00:00Z`).getUTCDay()] ?? "";
};

export default function RiderAgendaPage() {
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Rider" }), [session]);

  const [signups, setSignups] = useState<MySignup[]>([]);
  const [kpi, setKpi] = useState<MyKpi | null>(null);
  const [ranking, setRanking] = useState<Array<{ name: string; orders: number; isMe?: boolean }>>([]);

  const load = useCallback(async () => {
    if (!session?.name) return;
    const response = await fetch(`/api/dispatch?mine=${encodeURIComponent(session.name)}`, { headers, cache: "no-store" });
    if (response.ok) setSignups((await response.json()).data.signups);
    const perf = await fetch(`/api/performance?mine=${encodeURIComponent(session.name)}`, { headers, cache: "no-store" });
    if (perf.ok) {
      const payload = await perf.json();
      setKpi(payload.data ?? null);
    }
    const rank = await fetch("/api/performance?ranking=1", { headers, cache: "no-store" });
    if (rank.ok) {
      const payload = await rank.json();
      setRanking((payload.data?.top ?? []).map((row: { name: string; orders: number }) => ({ ...row, isMe: row.name === session.name })));
    }
  }, [headers, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = signups.filter((s) => (s.shift?.date ?? "") >= today && (s.status === "approved" || s.status === "reported" || s.status === "submitted"));
  const past = signups.filter((s) => (s.shift?.date ?? "") < today).slice(0, 10);

  return (
    <main className="min-h-screen bg-[#101010]">
      <div className="rider-light mx-auto min-h-screen w-full max-w-[430px] space-y-4 bg-[#f3f2ee] p-4 pb-10">
      <div className="flex items-center gap-3">
        <Link href="/" className="tag inline-flex items-center gap-1"><ArrowLeft size={13} /> Voltar</Link>
        <h1 className="flex items-center gap-2 text-lg font-black"><CalendarDays size={18} className="text-[var(--accent)]" /> Minha Agenda</h1>
      </div>

      {kpi && (
        <div className="panel p-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase text-[var(--muted)]"><TrendingUp size={12} /> Seu desempenho · {kpi.date}</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-2xl font-black text-[var(--accent)]">{kpi.completedOrders}</div>
              <div className="text-[10px] font-bold uppercase text-[var(--muted)]">Pedidos</div>
            </div>
            <div>
              <div className={`text-2xl font-black ${kpi.ar !== null && kpi.ar < 95 ? "text-[var(--danger-ink)]" : "text-[var(--ok-ink)]"}`}>{kpi.ar !== null ? `${kpi.ar}%` : "—"}</div>
              <div className="text-[10px] font-bold uppercase text-[var(--muted)]">AR</div>
            </div>
            <div>
              <div className="text-2xl font-black">{kpi.tsh !== null ? `${kpi.tsh}%` : "—"}</div>
              <div className="text-[10px] font-bold uppercase text-[var(--muted)]">TSH</div>
            </div>
          </div>
          {kpi.ar !== null && kpi.ar < 95 && (
            <div className="mt-2 rounded-[8px] bg-[var(--danger-bg)] px-3 py-2 text-[11px] font-black text-[var(--danger-ink)]">
              Atenção: AR abaixo de 95%. Aceite mais pedidos para manter sua meta.
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs font-black uppercase text-[var(--muted)]">Próximos turnos（{upcoming.length}）</div>
        {upcoming.length === 0 && (
          <div className="panel p-5 text-center text-sm font-bold text-[var(--muted)]">
            Nenhum turno confirmado. <Link href="/shifts" className="text-[var(--accent)] underline">Inscreva-se aqui</Link>.
          </div>
        )}
        {upcoming.map((signup) => {
          const info = statusInfo[signup.status] ?? statusInfo.submitted;
          return (
            <div key={signup.id} className={`panel flex items-center gap-3 p-4 ${signup.status === "approved" || signup.status === "reported" ? "border-[var(--ok)]" : ""}`}>
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[10px] bg-[var(--accent-glow)] text-center">
                <div>
                  <div className="text-[9px] font-black uppercase text-[var(--accent)]">{signup.shift ? weekday(signup.shift.date) : ""}</div>
                  <div className="text-sm font-black text-[var(--accent)]">{signup.shift?.date.slice(8) ?? "--"}</div>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-black"><Clock3 size={13} className="text-[var(--accent)]" /> {signup.shift?.timeRange ?? signup.shiftId}</div>
                <div className="text-[11px] font-bold text-[var(--muted)]">{signup.shift?.hotzone ?? ""} ｜ {signup.station}</div>
              </div>
              <span className={`inline-flex items-center gap-1 text-xs font-black ${info.cls}`}>
                {info.icon === "ok" ? <CheckCircle2 size={13} /> : info.icon === "no" ? <XCircle size={13} /> : <Clock3 size={13} />}
                {info.text}
              </span>
            </div>
          );
        })}
      </div>

      {ranking.length > 0 && (
        <div className="panel p-4" data-i18n-skip>
          <div className="text-[10px] font-black uppercase text-[var(--muted)]">🏆 Ranking · pedidos acumulados</div>
          <div className="mt-2 space-y-1">
            {ranking.map((row, index) => (
              <div key={row.name} className={`flex items-center justify-between rounded-[6px] px-2 py-1 text-[12px] font-bold ${row.isMe ? "bg-[var(--accent-glow)] font-black text-[var(--accent)]" : ""}`}>
                <span className="min-w-0 truncate">
                  {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`} {row.name}{row.isMe && "（você）"}
                </span>
                <span className="shrink-0 pl-2">{row.orders}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-black uppercase text-[var(--muted)]">Histórico</div>
          {past.map((signup) => {
            const info = statusInfo[signup.status] ?? statusInfo.submitted;
            return (
              <div key={signup.id} className="flex items-center justify-between rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-[12px] font-bold">
                <span>{signup.shift?.date} {signup.shift?.timeRange}</span>
                <span className={info.cls}>{info.text}</span>
              </div>
            );
          })}
        </div>
      )}
      </div>
    </main>
  );
}
