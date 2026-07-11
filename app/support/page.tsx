"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Headset, RefreshCcw, Reply, Send } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
import { Chip, DataTable, Drawer, StatusBadge, TodoCard, Toolbar, type BadgeTone, type DataColumn } from "../components/kit";
import { readSession } from "../lib/session";
import type { SupportStatus, SupportTicket } from "../lib/support";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";

const STATUS_TONE: Record<SupportStatus, BadgeTone> = { open: "danger", answered: "info", resolved: "success" };
const STATUS_OPTIONS: SupportStatus[] = ["open", "answered", "resolved"];

export default function SupportAdminPage() {
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
  // Local tri-lingual copy for labels that have no i18n key yet (i18n.ts is frozen).
  const L = (m: { zh: string; en: string; pt: string }) => m[language] ?? m.zh;
  const channelLabel = (ch: string) => (({ rider: t("spChRider"), franchise: t("spChFranchise"), station: t("spChStation"), web: t("spChWeb"), partner: "Partner" } as Record<string, string>)[ch] ?? ch);
  const statusLabel = (st: string) => (({ open: t("spStOpen"), answered: t("spStAnswered"), resolved: t("spStResolved") } as Record<string, string>)[st] ?? st);
  const session = useMemo(() => readSession(), []);
  const isHq = !session || session.portal === "pontosys" || session.role === "Super Admin";
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Super Admin" }), [session]);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | SupportStatus>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const load = useCallback(async () => {
    const url = isHq ? "/api/support" : `/api/support?authorName=${encodeURIComponent(session?.name ?? "")}`;
    const response = await fetch(url, { headers, cache: "no-store" });
    if (response.ok) setTickets((await response.json()).data);
  }, [headers, isHq, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? null;

  async function act(action: "reply" | "resolve", ticketId: string, reply = "") {
    if (action === "reply" && !reply.trim()) return;
    const response = await fetch("/api/support", { method: "POST", headers, body: JSON.stringify({ action, ticketId, reply }) });
    if (response.ok) {
      setNote({ tone: "ok", text: action === "reply" ? t("spReplied") : t("spResolvedMsg") });
      if (action === "reply") setReplyText("");
      void load();
    }
  }

  const open = tickets.filter((ticket) => ticket.status === "open");
  const answered = tickets.filter((ticket) => ticket.status === "answered");
  const todayStr = new Date().toISOString().slice(0, 10);
  const newToday = tickets.filter((ticket) => (ticket.createdAt ?? "").slice(0, 10) === todayStr);
  const rest = tickets.filter((ticket) => ticket.status !== "open");
  const ordered = [...open, ...rest].filter((ticket) => !statusFilter || ticket.status === statusFilter);

  const columns: Array<DataColumn<SupportTicket>> = [
    { key: "channel", label: L({ zh: "渠道", en: "Channel", pt: "Canal" }), render: (ticket) => <span className="tag">{channelLabel(ticket.channel)}</span> },
    { key: "subject", label: L({ zh: "主题", en: "Subject", pt: "Assunto" }), className: "max-w-[280px]", render: (ticket) => <span className="truncate font-black">{ticket.subject}</span> },
    {
      key: "author",
      label: L({ zh: "提交人", en: "Author", pt: "Autor" }),
      render: (ticket) => (
        <div>
          <div className="text-xs font-bold">{ticket.authorName || "—"}</div>
          {ticket.organization && <div className="text-[11px] font-bold text-[var(--muted)]">{ticket.organization}</div>}
        </div>
      ),
    },
    { key: "createdAt", label: L({ zh: "时间", en: "Created", pt: "Criado" }), render: (ticket) => <span className="text-xs font-bold text-[var(--muted)]">{ticket.createdAt}</span> },
    { key: "status", label: L({ zh: "状态", en: "Status", pt: "Status" }), render: (ticket) => <StatusBadge tone={STATUS_TONE[ticket.status]} label={statusLabel(ticket.status)} /> },
  ];

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

      {/* Stats: open / answered / new today */}
      <section className="grid gap-3 md:grid-cols-3">
        <TodoCard label={t("spStOpen")} value={open.length} tone={open.length > 0 ? "danger" : "neutral"} active={statusFilter === "open"} onClick={() => setStatusFilter(statusFilter === "open" ? "" : "open")} />
        <TodoCard label={t("spStAnswered")} value={answered.length} tone={answered.length > 0 ? "info" : "neutral"} active={statusFilter === "answered"} onClick={() => setStatusFilter(statusFilter === "answered" ? "" : "answered")} />
        <TodoCard label={L({ zh: "今日新增", en: "New today", pt: "Novas hoje" })} value={newToday.length} tone={newToday.length > 0 ? "warn" : "neutral"} />
      </section>

      {isHq && (
        <div className="panel mt-4 max-w-xl space-y-3 p-4">
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
        <div className="panel mt-4 max-w-xl space-y-3 p-4">
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

      {/* Toolbar: status chips */}
      <div className="mt-4">
        <Toolbar right={<span className="text-xs font-bold text-[var(--muted)]">{ordered.length} / {tickets.length}</span>}>
          <Chip active={statusFilter === ""} onClick={() => setStatusFilter("")}>{t("fmChipAll")}</Chip>
          {STATUS_OPTIONS.map((status) => (
            <Chip key={status} active={statusFilter === status} onClick={() => setStatusFilter(statusFilter === status ? "" : status)}>{statusLabel(status)}</Chip>
          ))}
        </Toolbar>
      </div>

      {/* Ticket table — click a row to open detail / reply drawer */}
      <div className="mt-4">
        <DataTable<SupportTicket>
          columns={columns}
          rows={ordered}
          rowKey={(ticket) => ticket.id}
          onRowClick={(ticket) => { setSelectedId(ticket.id); setReplyText(""); }}
          minWidth={720}
          empty={t("spNoTickets")}
        />
      </div>

      {/* Detail / reply drawer */}
      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        width={460}
        ariaLabel={selected?.subject}
        title={
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-black">{selected?.subject}</span>
            {selected && <StatusBadge tone={STATUS_TONE[selected.status]} label={statusLabel(selected.status)} />}
          </div>
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="text-[11px] font-bold text-[var(--muted)]">
              <span className="tag mr-2">{channelLabel(selected.channel)}</span>
              {selected.authorName}{selected.organization && `（${selected.organization}）`} ｜ {selected.createdAt}
              {selected.contact && ` ｜ ${t("spContact")}: ${selected.contact}`}
            </div>
            <p className="text-sm font-bold leading-6 text-[var(--muted-strong)]">{selected.message}</p>
            {selected.reply && (
              <div className="rounded-[8px] bg-[var(--accent-soft)] p-3 text-sm font-bold leading-6">
                <span className="text-[var(--accent)]">{t("spHqReply", { date: selected.repliedAt })}</span>{selected.reply}
              </div>
            )}
            {isHq && selected.status !== "resolved" && (
              <div className="space-y-2 border-t border-[var(--line)] pt-3">
                <div className="text-xs font-black uppercase text-[var(--muted)]">{t("spReplyTitle")}</div>
                <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder={t("spReplyMsg")} className="min-h-24 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
                <div className="flex gap-2">
                  <button type="button" disabled={!replyText.trim()} onClick={() => void act("reply", selected.id, replyText)} className="inline-flex h-10 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] disabled:opacity-50">
                    <Reply size={13} /> {t("spReply")}
                  </button>
                  <button type="button" onClick={() => void act("resolve", selected.id)} className="inline-flex h-10 items-center gap-1 rounded-[8px] border border-[var(--line)] px-4 text-xs font-black uppercase text-[var(--ok-ink)]">
                    <CheckCircle2 size={13} /> {t("spResolve")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </AppShell>
  );
}
