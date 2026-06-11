"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Headset, MessageCircle, Send } from "lucide-react";
import { readSession } from "../../lib/session";
import type { SupportTicket } from "../../lib/support";

const statusLabel: Record<string, { text: string; cls: string }> = {
  open: { text: "Aguardando", cls: "text-[var(--warning-ink)]" },
  answered: { text: "Respondido", cls: "text-[var(--accent)]" },
  resolved: { text: "Resolvido", cls: "text-[var(--ok-ink)]" },
};

export default function RiderSupportPage() {
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Rider" }), [session]);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!session?.name) return;
    const response = await fetch(`/api/support?authorName=${encodeURIComponent(session.name)}`, { headers, cache: "no-store" });
    if (response.ok) setTickets((await response.json()).data);
  }, [headers, session]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto min-h-screen max-w-md space-y-4 p-4">
      <div className="flex items-center gap-3">
        <Link href="/rider-app" className="tag inline-flex items-center gap-1"><ArrowLeft size={13} /> Voltar</Link>
        <h1 className="flex items-center gap-2 text-lg font-black"><Headset size={18} className="text-[var(--accent)]" /> Fale com a Central</h1>
      </div>

      <div className="panel p-4 text-[12px] font-bold leading-5 text-[var(--muted)]">
        Dúvida sobre escala, pagamento, pontos ou retirada? Abra um chamado — a central responde aqui mesmo no app.
      </div>

      {note && (
        <div className={`rounded-[8px] border px-4 py-3 text-sm font-black ${note.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {note.text}
        </div>
      )}

      <div className="panel space-y-3 p-4">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Assunto (ex.: saque não caiu)"
          className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]"
        />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Descreva o que aconteceu..."
          className="min-h-24 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3 text-sm font-bold outline-none focus:border-[var(--accent)]"
        />
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="WhatsApp para retorno (opcional)"
          className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          disabled={busy || !subject.trim() || !message.trim()}
          onClick={async () => {
            if (!session?.name) {
              setNote({ tone: "err", text: "Faça login para abrir um chamado." });
              return;
            }
            setBusy(true);
            setNote(null);
            const response = await fetch("/api/support", {
              method: "POST",
              headers,
              body: JSON.stringify({ action: "create", channel: "rider", authorName: session.name, contact, organization: session.organization ?? "", subject, message }),
            });
            const payload = await response.json().catch(() => ({}));
            setBusy(false);
            if (!response.ok) {
              setNote({ tone: "err", text: payload.error ?? `Falha (${response.status})` });
              return;
            }
            setSubject("");
            setMessage("");
            setNote({ tone: "ok", text: "Chamado aberto! A central vai responder aqui." });
            void load();
          }}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] text-sm font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"
        >
          <Send size={15} /> {busy ? "Enviando..." : "Abrir chamado"}
        </button>
      </div>

      {tickets.length > 0 && (
        <div className="panel p-4">
          <div className="mb-2 text-[10px] font-black uppercase text-[var(--muted)]">Meus chamados</div>
          <div className="space-y-3">
            {tickets.map((ticket) => {
              const s = statusLabel[ticket.status] ?? { text: ticket.status, cls: "" };
              return (
                <div key={ticket.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-black">{ticket.subject}</div>
                    <span className={`text-xs font-black ${s.cls}`}>{s.text}</span>
                  </div>
                  <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">{ticket.createdAt}</div>
                  <p className="mt-2 text-[12px] font-bold leading-5 text-[var(--muted-strong)]">{ticket.message}</p>
                  {ticket.reply && (
                    <div className="mt-2 flex items-start gap-2 rounded-[8px] bg-[var(--accent-soft)] p-2.5 text-[12px] font-bold leading-5">
                      <MessageCircle size={14} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                      <span><span className="text-[var(--accent)]">Central:</span> {ticket.reply}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
