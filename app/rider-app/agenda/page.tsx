"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, TrendingUp, XCircle } from "lucide-react";
import { readSession } from "../../lib/session";
import type { DispatchShift, ShiftSignup } from "../../lib/dispatch";

type MySignup = ShiftSignup & { shift: DispatchShift | null };
type MyKpi = {
  date: string;
  completedOrders: number;
  onlineHours?: number | null;
  tsh: number | null;
  ar: number | null;
  caa?: number | null;
  overtime?: number | null;
  settle?: number;
};

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
  const [kpiLoading, setKpiLoading] = useState(true);
  const [ranking, setRanking] = useState<Array<{ name: string; orders: number; isMe?: boolean }>>([]);

  const load = useCallback(async () => {
    if (!session?.name) return;
    // Progressive first paint: each section lands as its request resolves —
    // the KPI card shows a skeleton meanwhile instead of blocking the page.
    void fetch(`/api/dispatch?mine=${encodeURIComponent(session.name)}`, { headers, cache: "no-store" })
      .then(async (response) => {
        if (response.ok) setSignups((await response.json()).data.signups);
      })
      .catch(() => undefined);
    void fetch(`/api/performance?mine=${encodeURIComponent(session.name)}`, { headers, cache: "no-store" })
      .then(async (perf) => {
        if (perf.ok) setKpi((await perf.json()).data ?? null);
      })
      .catch(() => undefined)
      .finally(() => setKpiLoading(false));
    void fetch("/api/performance?ranking=1", { headers, cache: "no-store" })
      .then(async (rank) => {
        if (rank.ok) {
          const payload = await rank.json();
          setRanking((payload.data?.top ?? []).map((row: { name: string; orders: number }) => ({ ...row, isMe: row.name === session.name })));
        }
      })
      .catch(() => undefined);
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

      {!session && (
        <div className="panel space-y-3 p-5 text-center">
          <CalendarDays size={28} className="mx-auto text-[var(--accent)]" />
          <div className="text-sm font-black">Entre para ver sua agenda</div>
          <div className="text-[12px] font-bold text-[var(--muted)]">Seus turnos, desempenho e ranking aparecem após o login.</div>
          <Link href="/register?returnTo=/agenda" className="inline-flex h-11 w-full items-center justify-center rounded-[8px] bg-[var(--accent)] px-4 text-sm font-black text-[var(--accent-ink)]">
            Entrar ou criar conta
          </Link>
        </div>
      )}

      {/* T+1 performance — the six real report indicators (orders / online
          hours / TSH / AR / CAA / overtime) in a fixed 2×3 grid. Blocks with
          no data show 0 instead of disappearing; a skeleton holds the space
          while loading so the points/shift sections never wait for it. */}
      {session && (
        kpiLoading ? (
          <div className="panel animate-pulse p-4" aria-hidden>
            <div className="h-3 w-1/2 rounded bg-[var(--line)]" />
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 rounded-[8px] bg-[var(--line)]" />
              ))}
            </div>
          </div>
        ) : (
          <div className="panel p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase text-[var(--muted)]">
              <TrendingUp size={12} /> Seu desempenho{kpi ? ` · ${kpi.date}` : " · sem relatório ainda"}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2" data-i18n-skip>
              {([
                { label: "Pedidos", value: `${kpi?.completedOrders ?? 0}`, color: "#16a34a" },
                { label: "Horas online", value: `${Math.round((kpi?.onlineHours ?? 0) * 10) / 10}h`, color: "#2563eb" },
                { label: "TSH", value: `${kpi?.tsh ?? 0}%`, color: "#d97706" },
                { label: "AR", value: `${kpi?.ar ?? 0}%`, color: "#0d9488" },
                { label: "CAA", value: `${kpi?.caa ?? 0}%`, color: "#dc2626" },
                { label: "Overtime", value: `${kpi?.overtime ?? 0}%`, color: "#6b7280" },
              ] as Array<{ label: string; value: string; color: string }>).map((block) => (
                <div key={block.label} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: block.color }} />
                    <span className="truncate text-[9px] font-black uppercase text-[var(--muted)]">{block.label}</span>
                  </div>
                  <div className="mt-1 text-lg font-black leading-6" style={{ color: block.color }}>{block.value}</div>
                </div>
              ))}
            </div>
            {kpi && kpi.ar !== null && kpi.ar < 95 && (
              <div className="mt-2 rounded-[8px] bg-[var(--danger-bg)] px-3 py-2 text-[11px] font-black text-[var(--danger-ink)]">
                Atenção: AR abaixo de 95%. Aceite mais pedidos para manter sua meta.
              </div>
            )}
            <Link href="/tasks" className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-[var(--accent)] underline">
              Ver missões e recompensas →
            </Link>
          </div>
        )
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
