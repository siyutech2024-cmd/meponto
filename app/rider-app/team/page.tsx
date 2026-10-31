"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCcw, Users } from "lucide-react";

/**
 * Leader Mode · "Minha equipe" (业务方 2026-10-30, decision 8). Opened from the
 * app's home card (logged-in WebView) — no app release needed. Portuguese:
 * rider-facing surface. Read-only; no member income, no CPF, no phone.
 */

type Member = { name: string; id4: string; isLeader: boolean; status: "delivering" | "online" | "offline"; onlineMins: number; todayOrders: number; weekOrders: number; active: boolean };
type TeamData = {
  isLeader: boolean;
  station?: { name: string; status: string; trialStartedAt: string | null };
  week?: { from: string; to: string; today: string };
  batchAt?: string | null;
  targets?: { minActiveRiders: number; minOrdersPerActiveRider: number; minWeeklyOrders: number; selfOrdersCapPct: number };
  rates?: { base: number; bonus: number };
  totals?: { members: number; onlineNow: number; deliveringNow: number; todayOrders: number; weekOrders: number; activeRiders: number; selfPct: number };
  progress?: { passedSoFar: boolean };
  estimate?: { base: number; bonus: number; bonusCounts: boolean; total: number };
  members?: Member[];
};

const statusLabel: Record<Member["status"], { text: string; cls: string }> = {
  delivering: { text: "Entregando", cls: "bg-[#e7f6ec] text-[#1f7a3d]" },
  online: { text: "Online", cls: "bg-[#e8f0fe] text-[#1d4ed8]" },
  offline: { text: "Offline", cls: "bg-[#efeeea] text-[#77746f]" },
};
const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;
const dm = (ymd?: string) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : "");

function Bar({ value, target, label }: { value: number; target: number; label: string }) {
  const pct = Math.min(100, target > 0 ? Math.round((value / target) * 100) : 0);
  const ok = value >= target;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[12px] font-bold">
        <span>{label}</span>
        <span className={ok ? "text-[#1f7a3d]" : "text-[#77746f]"}>{value} / {target}</span>
      </div>
      <div className="h-2 rounded-full bg-[#efeeea]">
        <div className={`h-2 rounded-full ${ok ? "bg-[#1f7a3d]" : "bg-[#f2b705]"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function TeamPage() {
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState("");
  const [showOffline, setShowOffline] = useState(false);

  const load = useCallback(async () => {
    setError("");
    const r = await fetch("/api/rider/team", { cache: "no-store" });
    const payload = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(payload.error ?? "Não foi possível carregar.");
      return;
    }
    setData(payload.data as TeamData);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 3 * 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const members = data?.members ?? [];
  const working = members.filter((m) => m.status !== "offline");
  const offline = members.filter((m) => m.status === "offline");

  return (
    <main className="min-h-screen bg-[#101010]">
      <div className="rider-light mx-auto min-h-screen w-full max-w-[430px] space-y-4 bg-[#f3f2ee] p-4 pb-10">
        <div className="flex items-center gap-3">
          <Users size={18} />
          <h1 className="flex-1 text-lg font-black">Minha equipe</h1>
          <button type="button" className="tag inline-flex items-center gap-1" onClick={() => void load()}><RefreshCcw size={13} /> Atualizar</button>
        </div>

        {error && <div className="rounded-[12px] border border-[#f1c6c6] bg-white p-4 text-sm font-bold text-[#b42318]">{error}</div>}
        {!data && !error && <div className="text-sm font-bold text-[#77746f]">Carregando…</div>}
        {data && !data.isLeader && (
          <div className="rounded-[12px] border border-[#e4e1da] bg-white p-4 text-sm font-bold text-[#77746f]">
            Esta página é para líderes de equipe. Se quer abrir sua estação ou entrar numa equipe, use “Seja líder ou entre numa equipe”.
          </div>
        )}

        {data?.isLeader && data.totals && data.targets && (
          <>
            <div className="rounded-[12px] border border-[#e4e1da] bg-white p-4">
              <div className="text-sm font-black">{data.station?.name}{data.station?.status === "trial" ? " · em teste" : ""}</div>
              <div className="mt-1 text-[12px] font-bold text-[#77746f]">
                Semana {dm(data.week?.from)}–{dm(data.week?.to)}{data.batchAt ? ` · atualizado ${new Date(data.batchAt).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}` : ""}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-[10px] bg-[#f3f2ee] p-2"><div className="text-lg font-black">{data.totals.deliveringNow}</div><div className="text-[11px] font-bold text-[#77746f]">Entregando</div></div>
                <div className="rounded-[10px] bg-[#f3f2ee] p-2"><div className="text-lg font-black">{data.totals.onlineNow}</div><div className="text-[11px] font-bold text-[#77746f]">Online agora</div></div>
                <div className="rounded-[10px] bg-[#f3f2ee] p-2"><div className="text-lg font-black">{data.totals.todayOrders}</div><div className="text-[11px] font-bold text-[#77746f]">Pedidos hoje</div></div>
              </div>
            </div>

            <div className="space-y-3 rounded-[12px] border border-[#e4e1da] bg-white p-4">
              <div className="text-sm font-black">Meta da semana</div>
              <Bar label="Pedidos da equipe" value={data.totals.weekOrders} target={data.targets.minWeeklyOrders} />
              <Bar label={`Motoboys ativos (≥${data.targets.minOrdersPerActiveRider} pedidos)`} value={data.totals.activeRiders} target={data.targets.minActiveRiders} />
              <div className="text-[12px] font-bold text-[#77746f]">Seus pedidos: {data.totals.selfPct}% da equipe (limite {data.targets.selfOrdersCapPct}%)</div>
            </div>

            {data.estimate && data.rates && (
              <div className="rounded-[12px] border border-[#e4e1da] bg-white p-4">
                <div className="text-sm font-black">Sua comissão estimada</div>
                <div className="mt-1 text-2xl font-black">{brl(data.estimate.total)}</div>
                <div className="mt-1 text-[12px] font-bold text-[#77746f]">
                  {data.totals.weekOrders} pedidos × ({brl(data.rates.base)} base{data.rates.bonus > 0 ? ` + ${brl(data.rates.bonus)} bônus` : ""})
                  {!data.estimate.bonusCounts && data.rates.bonus > 0 ? " — o bônus entra quando a equipe bater a meta." : ""}
                </div>
                <div className="mt-1 text-[11px] font-bold text-[#a29f99]">Estimativa. O valor final é calculado no fechamento da semana.</div>
              </div>
            )}

            <div className="rounded-[12px] border border-[#e4e1da] bg-white p-4">
              <div className="mb-2 text-sm font-black">Equipe ({data.totals.members})</div>
              {[...working, ...(showOffline ? offline : [])].map((m) => (
                <div key={`${m.id4}-${m.name}`} className="flex items-center gap-3 border-t border-[#efeeea] py-2 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black">{m.name}{m.isLeader ? " (você)" : ""}</div>
                    <div className="text-[11px] font-bold text-[#77746f]">99ID …{m.id4}{m.active ? " · ativo na semana" : ""}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${statusLabel[m.status].cls}`}>{statusLabel[m.status].text}</span>
                  <div className="w-16 text-right">
                    <div className="text-sm font-black">{m.todayOrders}</div>
                    <div className="text-[10px] font-bold text-[#77746f]">hoje · {m.weekOrders} sem.</div>
                  </div>
                </div>
              ))}
              {offline.length > 0 && (
                <button type="button" className="tag mt-2" onClick={() => setShowOffline((v) => !v)}>
                  {showOffline ? `Ocultar offline (${offline.length})` : `Ver offline (${offline.length})`}
                </button>
              )}
              {members.length === 0 && <div className="text-[12px] font-bold text-[#77746f]">Nenhum motoboy na equipe ainda.</div>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
