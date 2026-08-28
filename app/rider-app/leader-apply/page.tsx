"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Rocket, Store, Shuffle } from "lucide-react";

/**
 * Leader Mode — rider application form (docs/leader-mode-design.md §7).
 * Reachable at /rider-app/leader-apply (ops shares the link via WhatsApp; no
 * native-app change needed). Portuguese-only: rider-facing surface.
 *
 * Anti promotion-blocking by design: the request goes STRAIGHT to the
 * franchisee — the current leader is not notified and cannot veto.
 */

type ApplyContext = {
  eligible: boolean;
  riderId?: string;
  riderName?: string;
  franchise?: string;
  currentStation?: string | null;
  stations?: Array<{ id: string; name: string }>;
  applications?: Array<{ id: string; kind: string; status: string; createdAt: string }>;
};

const HEADERS = { "Content-Type": "application/json" };

const kindLabel: Record<string, string> = {
  open_station: "Abrir minha estação",
  join_station: "Entrar em uma estação",
  transfer: "Trocar de estação",
};
const statusLabel: Record<string, { text: string; cls: string }> = {
  pending: { text: "Em análise", cls: "text-[var(--warning-ink)]" },
  approved: { text: "Aprovado", cls: "text-[var(--ok-ink)]" },
  rejected: { text: "Recusado", cls: "text-[var(--danger-ink)]" },
};

export default function LeaderApplyPage() {
  const [context, setContext] = useState<ApplyContext | null>(null);
  const [kind, setKind] = useState<"open_station" | "join_station" | "transfer">("open_station");
  const [targetStationId, setTargetStationId] = useState("");
  const [proposedName, setProposedName] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/leaders?applyContext=1", { headers: HEADERS, cache: "no-store" });
    if (response.ok) setContext((await response.json()).data as ApplyContext);
    else setContext({ eligible: false });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setBusy(true);
    setNote(null);
    const body: Record<string, string> = { action: "submitApplication", kind };
    if (kind === "open_station") body.proposedStationName = proposedName.trim();
    else body.targetStationId = targetStationId;
    const response = await fetch("/api/leaders", { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setNote({ tone: "err", text: data.error ?? "Não foi possível enviar. Tente novamente." });
      return;
    }
    setNote({ tone: "ok", text: "Enviado! A franquia analisa em até 1 dia útil." });
    setProposedName("");
    setTargetStationId("");
    void load();
  }

  const canSubmit =
    !busy &&
    (kind === "open_station" ? proposedName.trim().length >= 3 : targetStationId.length > 0);

  return (
    <main className="min-h-screen bg-[#101010]">
      <div className="rider-light mx-auto min-h-screen w-full max-w-[430px] space-y-4 bg-[#f3f2ee] p-4 pb-10">
        <div className="flex items-center gap-3">
          <Link href="/" className="tag inline-flex items-center gap-1"><ArrowLeft size={13} /> Voltar</Link>
          <h1 className="text-lg font-black">Crescer na rede</h1>
        </div>

        {context === null && <div className="text-sm font-bold text-[#77746f]">Carregando…</div>}

        {context?.eligible === false && (
          <div className="rounded-[12px] border border-[#e4e1da] bg-white p-4 text-sm font-bold text-[#77746f]">
            Este recurso ainda não está disponível na sua região.
          </div>
        )}

        {context?.eligible && (
          <>
            <div className="rounded-[12px] border border-[#e4e1da] bg-white p-4">
              <div className="mb-1 text-sm font-black">{context.riderName}</div>
              <div className="text-[12px] font-bold text-[#77746f]">
                {context.franchise} · {context.currentStation ?? "sem estação"}
              </div>
            </div>

            <div className="rounded-[12px] border border-[#e4e1da] bg-white p-4">
              <div className="mb-3 text-sm font-black">O que você quer fazer?</div>
              <div className="mb-4 grid gap-2">
                {(
                  [
                    { value: "open_station", icon: Rocket, hint: "Monte sua equipe (mín. 5 ativos em 14 dias)" },
                    { value: "join_station", icon: Store, hint: "Peça vaga em uma estação existente" },
                    { value: "transfer", icon: Shuffle, hint: "Mude para outra estação — o líder atual não participa da decisão" },
                  ] as const
                ).map(({ value, icon: Icon, hint }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setKind(value)}
                    className={`flex items-start gap-3 rounded-[10px] border p-3 text-left ${kind === value ? "border-[#0b0e14] bg-[#faf9f6]" : "border-[#e4e1da]"}`}
                  >
                    <Icon size={16} className="mt-0.5 shrink-0" />
                    <span>
                      <span className="block text-[13px] font-black">{kindLabel[value]}</span>
                      <span className="block text-[11px] font-bold text-[#77746f]">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>

              {kind === "open_station" ? (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-black uppercase text-[#77746f]">Nome da estação</span>
                  <input
                    className="h-11 w-full rounded-[10px] border border-[#e4e1da] bg-white px-3 text-sm font-bold outline-none focus:border-[#0b0e14]"
                    value={proposedName}
                    maxLength={60}
                    placeholder="Ex.: Estação Vila Mariana"
                    onChange={(e) => setProposedName(e.target.value)}
                  />
                </label>
              ) : (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-black uppercase text-[#77746f]">Estação de destino</span>
                  <select
                    className="h-11 w-full rounded-[10px] border border-[#e4e1da] bg-white px-3 text-sm font-bold outline-none focus:border-[#0b0e14]"
                    value={targetStationId}
                    onChange={(e) => setTargetStationId(e.target.value)}
                  >
                    <option value="">Escolha…</option>
                    {(context.stations ?? [])
                      .filter((s) => s.name !== context.currentStation)
                      .map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                  </select>
                </label>
              )}

              {note && (
                <div className={`mt-3 text-[12px] font-black ${note.tone === "ok" ? "text-[var(--ok-ink)]" : "text-[var(--danger-ink)]"}`}>
                  {note.text}
                </div>
              )}

              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => void submit()}
                className="mt-4 h-11 w-full rounded-[10px] bg-[#0b0e14] text-sm font-black text-white disabled:opacity-40"
              >
                Enviar para a franquia
              </button>
              <p className="mt-2 text-[11px] font-bold text-[#77746f]">
                Seu pedido vai direto para a franquia. Se não aprovado, nada muda para você.
              </p>
            </div>

            {(context.applications ?? []).length > 0 && (
              <div className="rounded-[12px] border border-[#e4e1da] bg-white p-4">
                <div className="mb-2 text-sm font-black">Meus pedidos</div>
                <div className="space-y-2">
                  {(context.applications ?? []).map((app) => (
                    <div key={app.id} className="flex items-center gap-2 text-[12px] font-bold">
                      <CheckCircle2 size={13} className="shrink-0 text-[#77746f]" />
                      <span className="flex-1">{kindLabel[app.kind] ?? app.kind}</span>
                      <span className={statusLabel[app.status]?.cls ?? ""}>{statusLabel[app.status]?.text ?? app.status}</span>
                      <span className="text-[#77746f]">{app.createdAt.slice(0, 10)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
