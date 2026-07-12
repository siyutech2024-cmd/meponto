"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Gift, Target } from "lucide-react";
import { readSession } from "../../lib/session";

/**
 * Rider missions (任务) — REAL data end to end: enabled appTasks with live
 * progress computed server-side from riderDailyKpis / points ledger / mall
 * orders / slot enrollments, claim state from taskClaims. No mock counters.
 * Copy follows the rider-app convention: hardcoded pt + DOM translation.
 */

type RiderTask = {
  id: string;
  title: string;
  description: string;
  metric: string;
  target: number;
  rewardPoints: number;
  period: "weekly" | "monthly";
  progress: number;
  claimed: boolean;
  claimable: boolean;
};

const periodLabel: Record<string, string> = { weekly: "Semanal", monthly: "Mensal" };

export default function RiderTasksPage() {
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Rider" }), [session]);

  const [tasks, setTasks] = useState<RiderTask[] | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [claiming, setClaiming] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/tasks", { headers, cache: "no-store" });
    if (!response.ok) {
      setTasks([]);
      return;
    }
    const payload = await response.json();
    setTasks((payload.data?.tasks ?? []) as RiderTask[]);
  }, [headers]);

  useEffect(() => {
    if (session) void load();
  }, [load, session]);

  async function claim(task: RiderTask) {
    setClaiming(task.id);
    setMessage(null);
    const response = await fetch("/api/tasks", { method: "POST", headers, body: JSON.stringify({ action: "claim", taskId: task.id }) });
    const payload = await response.json().catch(() => ({}));
    setClaiming("");
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? `Falha ao resgatar (${response.status})` });
      return;
    }
    setMessage({ tone: "ok", text: `+${payload.data.awarded} pts! Saldo: ${payload.data.available} pts.` });
    void load();
  }

  return (
    <main className="min-h-screen bg-[#101010]">
      <div className="rider-light mx-auto min-h-screen w-full max-w-[430px] space-y-4 bg-[#f3f2ee] p-4 pb-10">
        <div className="flex items-center gap-3">
          <Link href="/" className="tag inline-flex items-center gap-1"><ArrowLeft size={13} /> Voltar</Link>
          <h1 className="flex items-center gap-2 text-lg font-black"><Target size={18} className="text-[var(--accent)]" /> Missões</h1>
        </div>

        {message && (
          <div className={`rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
            {message.text}
          </div>
        )}

        {!session ? (
          <div className="panel space-y-3 p-5 text-center">
            <Target size={28} className="mx-auto text-[var(--accent)]" />
            <div className="text-sm font-black">Entre para ver suas missões</div>
            <div className="text-[12px] font-bold text-[var(--muted)]">Complete missões e ganhe pontos para trocar na loja.</div>
            <Link href="/register?returnTo=/tasks" className="inline-flex h-11 w-full items-center justify-center rounded-[8px] bg-[var(--accent)] px-4 text-sm font-black text-[var(--accent-ink)]">
              Entrar ou criar conta
            </Link>
          </div>
        ) : tasks === null ? (
          // Progressive first paint: skeleton cards while missions load.
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="panel animate-pulse space-y-2 p-4">
                <div className="h-4 w-2/3 rounded bg-[var(--line)]" />
                <div className="h-2 w-full rounded bg-[var(--line)]" />
                <div className="h-3 w-1/3 rounded bg-[var(--line)]" />
              </div>
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="panel p-5 text-center text-sm font-bold text-[var(--muted)]">
            Nenhuma missão ativa no momento. Volte em breve!
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => {
              const pct = Math.min(100, Math.round((task.progress / Math.max(1, task.target)) * 100));
              return (
                <div key={task.id} className={`panel space-y-2 p-4 ${task.claimable ? "border-[var(--ok)]" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-black">{task.title}</div>
                      {task.description && <div className="text-[11px] font-bold text-[var(--muted)]">{task.description}</div>}
                    </div>
                    <span className="tag shrink-0">{periodLabel[task.period] ?? task.period}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--line)]">
                    <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[12px] font-bold">
                    <span className="text-[var(--muted)]">
                      {task.progress} / {task.target}
                    </span>
                    <span className="inline-flex items-center gap-1 font-black text-[var(--accent)]">
                      <Gift size={13} /> +{task.rewardPoints} pts
                    </span>
                  </div>
                  {task.claimed ? (
                    <div className="inline-flex items-center gap-1.5 text-xs font-black text-[var(--ok-ink)]">
                      <CheckCircle2 size={14} /> Recompensa resgatada neste período
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!task.claimable || claiming === task.id}
                      onClick={() => void claim(task)}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] text-sm font-black uppercase text-[var(--accent-ink)] disabled:opacity-40"
                    >
                      {claiming === task.id ? "Resgatando..." : task.claimable ? "Resgatar recompensa" : `Faltam ${Math.max(0, task.target - task.progress)}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
