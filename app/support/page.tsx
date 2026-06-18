"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Headset, RefreshCcw, Reply, Send } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import { readSession } from "../lib/session";
import type { SupportTicket } from "../lib/support";
import { useDialog } from "../components/dialog";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";

export default function SupportAdminPage() {
  const dialog = useDialog();
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
  const channelLabel = (ch: string) => (({ rider: t("spChRider"), franchise: t("spChFranchise"), station: t("spChStation"), web: t("spChWeb"), partner: "Partner" } as Record<string, string>)[ch] ?? ch);
  const statusBadge = (st: string) => (({ open: t("spStOpen"), answered: t("spStAnswered"), resolved: t("spStResolved") } as Record<string, string>)[st] ?? st);
  const session = useMemo(() => readSession(), []);
  const isHq = !session || session.portal === "pontosys" || session.role === "Super Admin";
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Super Admin" }), [session]);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");

  const load = useCallback(async () => {
    const url = isHq ? "/api/support" : `/api/support?authorName=${encodeURIComponent(session?.name ?? "")}`;
    const response = await fetch(url, { headers, cache: "no-store" });
    if (response.ok) setTickets((await response.json()).data);
  }, [headers, isHq, session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: "reply" | "resolve", ticketId: string) {
    const reply = action === "reply" ? (await dialog.prompt(t("spReplyTitle"), { message: t("spReplyMsg") })) ?? "" : "";
    if (action === "reply" && !reply.trim()) return;
    const response = await fetch("/api/support", { method: "POST", headers, body: JSON.stringify({ action, ticketId, reply }) });
    if (response.ok) {
      setNote({ tone: "ok", text: action === "reply" ? t("spReplied") : t("spResolvedMsg") });
      void load();
    }
  }

  const open = tickets.filter((t) => t.status === "open");
  const rest = tickets.filter((t) => t.status !== "open");

  return (
    <AppShell>
      <PageTitle
        title={isHq ? t("spTitleHq") : t("spTitleSub")}
        eyebrow={isHq ? t("spEyebrowHq", { n: open.length }) : t("spEyebrowSub")}
        action={<button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> {t("spRefresh")}</button>}
      />

      {note && (
        <div className="mb-4 rounded-[8px] border border-[var(--ok)] bg-[var(--ok-bg)] px-4 py-3 text-sm font-black text-[var(--ok-ink)]">{note.text}</div>
      )}

      {isHq && (
        <div className="panel mb-4 max-w-xl space-y-3 p-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Headset size={14} /> {t("spPushTitle")}</div>
          <input value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} placeholder={t("spPushTitlePh")} className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
          <textarea value={pushBody} onChange={(e) => setPushBody(e.target.value)} placeholder={t("spPushBodyPh")} className="min-h-20 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
          <button
            type="button"
            disabled={!pushTitle.trim() || !pushBody.trim()}
            onClick={async () => {
              const response = await fetch("/api/push", { method: "POST", headers, body: JSON.stringify({ action: "send", title: pushTitle, body: pushBody }) });
              const payload = await response.json().catch(() => ({}));
              if (response.ok) {
                setNote({ tone: "ok", text: t("spPushSent", { sent: payload.data.sent, targets: payload.data.targets }) });
                setPushTitle("");
                setPushBody("");
              } else {
                setNote({ tone: "ok", text: payload.error ?? t("spSendFailed") });
              }
            }}
            className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-5 text-sm font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"
          >
            <Send size={15} /> {t("spSendPush")}
          </button>
        </div>
      )}

      {!isHq && (
        <div className="panel mb-4 max-w-xl space-y-3 p-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Headset size={14} /> {t("spNewTicket")}</div>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("spSubject")} className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("spMsgPh")} className="min-h-24 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
          <button
            type="button"
            disabled={!subject.trim() || !message.trim()}
            onClick={async () => {
              const response = await fetch("/api/support", {
                method: "POST",
                headers,
                body: JSON.stringify({
                  action: "create",
                  channel: session?.portal === "franchise" ? "franchise" : "station",
                  authorName: session?.name ?? "",
                  contact: "",
                  organization: session?.organization ?? "",
                  subject,
                  message,
                }),
              });
              if (response.ok) {
                setSubject("");
                setMessage("");
                setNote({ tone: "ok", text: t("spCreated") });
                void load();
              }
            }}
            className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-5 text-sm font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"
          >
            <Send size={15} /> {t("spSubmit")}
          </button>
        </div>
      )}

      <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
        {[...open, ...rest].map((ticket) => (
          <div key={ticket.id} className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="tag">{channelLabel(ticket.channel)}</span>
                <span className="text-sm font-black">{ticket.subject}</span>
                <Badge value={statusBadge(ticket.status)} />
              </div>
              {isHq && ticket.status !== "resolved" && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => void act("reply", ticket.id)} className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black uppercase text-[var(--accent-ink)]"><Reply size={13} /> {t("spReply")}</button>
                  <button type="button" onClick={() => void act("resolve", ticket.id)} className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black uppercase text-[var(--ok-ink)]"><CheckCircle2 size={13} /> {t("spResolve")}</button>
                </div>
              )}
            </div>
            <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">
              {ticket.authorName}{ticket.organization && `（${ticket.organization}）`} ｜ {ticket.createdAt}{ticket.contact && ` ｜ ${t("spContact")}: ${ticket.contact}`}
            </div>
            <p className="mt-2 text-sm font-bold leading-6 text-[var(--muted-strong)]">{ticket.message}</p>
            {ticket.reply && (
              <div className="mt-2 rounded-[8px] bg-[var(--accent-soft)] p-3 text-sm font-bold leading-6">
                <span className="text-[var(--accent)]">{t("spHqReply", { date: ticket.repliedAt })}</span>{ticket.reply}
              </div>
            )}
          </div>
        ))}
        {tickets.length === 0 && <div className="panel p-6 text-sm font-bold text-[var(--muted)]">{t("spNoTickets")}</div>}
      </div>
    </AppShell>
  );
}
