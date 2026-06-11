"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Banknote, CheckCircle2, Clock, Wallet, XCircle } from "lucide-react";
import { readSession } from "../../lib/session";
import type { RiderWithdrawal } from "../../lib/finance";

type Me = { riderId: string; name: string; pix: string; station: string; franchise: string; settled: number; held: number; paid: number; available: number };

const statusLabel: Record<string, { text: string; cls: string }> = {
  requested: { text: "Em análise", cls: "text-[var(--warning-ink)]" },
  paid: { text: "Pago", cls: "text-[var(--ok-ink)]" },
  rejected: { text: "Recusado", cls: "text-[var(--danger-ink)]" },
};

export default function RiderWalletPage() {
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Rider" }), [session]);

  const [me, setMe] = useState<Me | null>(null);
  const [withdrawals, setWithdrawals] = useState<RiderWithdrawal[]>([]);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (session?.name) params.set("riderName", session.name);
    const response = await fetch(`/api/wallet?${params}`, { headers, cache: "no-store" });
    const payload = await response.json();
    if (response.ok) {
      setMe(payload.data.me);
      setWithdrawals(payload.data.withdrawals);
    }
  }, [headers, session]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto min-h-screen max-w-md space-y-4 p-4">
      <div className="flex items-center gap-3">
        <Link href="/rider-app" className="tag inline-flex items-center gap-1"><ArrowLeft size={13} /> Voltar</Link>
        <h1 className="flex items-center gap-2 text-lg font-black"><Wallet size={18} className="text-[var(--accent)]" /> Minha Carteira</h1>
      </div>

      {message && (
        <div className={`rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      {!me ? (
        <div className="panel p-5 text-sm font-bold text-[var(--muted)]">
          Cadastro não vinculado — fale com o gestor da estação para liberar sua carteira.
        </div>
      ) : (
        <>
          <div className="panel p-5 text-center">
            <div className="text-[10px] font-black uppercase text-[var(--muted)]">Disponível para saque (ganhos até ontem)</div>
            <div className="text-4xl font-black text-[var(--accent)]">R$ {me.available.toFixed(2)}</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] font-bold text-[var(--muted)]">
              <div>Acumulado<br /><span className="text-sm text-[var(--text)]">R$ {me.settled.toFixed(2)}</span></div>
              <div>Em análise<br /><span className="text-sm text-[var(--warning-ink)]">R$ {me.held.toFixed(2)}</span></div>
              <div>Já pago<br /><span className="text-sm text-[var(--ok-ink)]">R$ {me.paid.toFixed(2)}</span></div>
            </div>
            <div className="mt-2 text-[11px] font-bold text-[var(--muted)]">PIX: {me.pix || "—"} ｜ {me.station}（{me.franchise}）</div>
          </div>

          <div className="panel space-y-2 p-4">
            <div className="text-[10px] font-black uppercase text-[var(--muted)]">Solicitar saque（pago pela franquia via PIX）</div>
            <div className="flex gap-2">
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder={`Máx R$ ${me.available.toFixed(2)}`}
                className="h-11 flex-1 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]"
              />
              <button type="button" className="tag" onClick={() => setAmount(me.available.toFixed(2))}>Tudo</button>
            </div>
            <button
              type="button"
              disabled={busy || !amount || Number(amount) <= 0}
              onClick={async () => {
                setBusy(true);
                setMessage(null);
                const response = await fetch("/api/wallet", { method: "POST", headers, body: JSON.stringify({ action: "requestWithdrawal", riderId: me.riderId, amount: Number(amount) }) });
                const payload = await response.json().catch(() => ({}));
                setBusy(false);
                if (!response.ok) {
                  setMessage({ tone: "err", text: payload.error ?? `Falha (${response.status})` });
                  return;
                }
                setAmount("");
                setMessage({ tone: "ok", text: `Saque de R$ ${payload.data.withdrawal.amount.toFixed(2)} solicitado! A franquia fará o PIX e confirmará o pagamento.` });
                void load();
              }}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] text-sm font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"
            >
              <Banknote size={16} /> {busy ? "Enviando..." : "Solicitar saque"}
            </button>
          </div>

          {withdrawals.length > 0 && (
            <div className="panel p-4">
              <div className="mb-2 text-[10px] font-black uppercase text-[var(--muted)]">Histórico de saques</div>
              <div className="space-y-2">
                {withdrawals.map((w) => {
                  const s = statusLabel[w.status] ?? { text: w.status, cls: "" };
                  return (
                    <div key={w.id} className="flex items-center justify-between rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3 text-sm font-bold">
                      <div>
                        R$ {w.amount.toFixed(2)}
                        <div className="text-[11px] text-[var(--muted)]">
                          {w.requestedAt}{w.paidAt && ` → pago ${w.paidAt}`}{w.note && ` ｜ ${w.note}`}
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-xs font-black ${s.cls}`}>
                        {w.status === "paid" ? <CheckCircle2 size={14} /> : w.status === "rejected" ? <XCircle size={14} /> : <Clock size={14} />}
                        {s.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
