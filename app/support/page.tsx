"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Headset, RefreshCcw, Reply, Send } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import { readSession } from "../lib/session";
import type { SupportTicket } from "../lib/support";
import { useDialog } from "../components/dialog";

const channelLabel: Record<string, string> = { rider: "骑手", franchise: "加盟商", station: "站点", partner: "Partner", web: "官网" };
const statusBadge: Record<string, string> = { open: "待处理", answered: "已回复", resolved: "已解决" };

export default function SupportAdminPage() {
  const dialog = useDialog();
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
    const reply = action === "reply" ? (await dialog.prompt("回复工单", { message: "回复内容（提交人会在自己端看到）" })) ?? "" : "";
    if (action === "reply" && !reply.trim()) return;
    const response = await fetch("/api/support", { method: "POST", headers, body: JSON.stringify({ action, ticketId, reply }) });
    if (response.ok) {
      setNote({ tone: "ok", text: action === "reply" ? "已回复。" : "已标记解决。" });
      void load();
    }
  }

  const open = tickets.filter((t) => t.status === "open");
  const rest = tickets.filter((t) => t.status !== "open");

  return (
    <AppShell>
      <PageTitle
        title={isHq ? "客服工单中心" : "联系总部"}
        eyebrow={isHq ? `待处理 ${open.length} 条` : "提交工单，总部统一回复"}
        action={<button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> 刷新</button>}
      />

      {note && (
        <div className="mb-4 rounded-[8px] border border-[var(--ok)] bg-[var(--ok-bg)] px-4 py-3 text-sm font-black text-[var(--ok-ink)]">{note.text}</div>
      )}

      {isHq && (
        <div className="panel mb-4 max-w-xl space-y-3 p-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Headset size={14} /> 推送公告（发送到骑手APP）</div>
          <input value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} placeholder="标题（如：Novos turnos abertos）" className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
          <textarea value={pushBody} onChange={(e) => setPushBody(e.target.value)} placeholder="内容（葡语，骑手看到的通知正文）" className="min-h-20 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
          <button
            type="button"
            disabled={!pushTitle.trim() || !pushBody.trim()}
            onClick={async () => {
              const response = await fetch("/api/push", { method: "POST", headers, body: JSON.stringify({ action: "send", title: pushTitle, body: pushBody }) });
              const payload = await response.json().catch(() => ({}));
              if (response.ok) {
                setNote({ tone: "ok", text: `推送已发送：${payload.data.sent}/${payload.data.targets} 台设备。` });
                setPushTitle("");
                setPushBody("");
              } else {
                setNote({ tone: "ok", text: payload.error ?? "发送失败" });
              }
            }}
            className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-5 text-sm font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"
          >
            <Send size={15} /> 发送推送
          </button>
        </div>
      )}

      {!isHq && (
        <div className="panel mb-4 max-w-xl space-y-3 p-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Headset size={14} /> 新建工单</div>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="主题" className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="详细说明问题..." className="min-h-24 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
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
                setNote({ tone: "ok", text: "工单已提交，总部会尽快回复。" });
                void load();
              }
            }}
            className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-5 text-sm font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"
          >
            <Send size={15} /> 提交
          </button>
        </div>
      )}

      <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
        {[...open, ...rest].map((ticket) => (
          <div key={ticket.id} className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="tag">{channelLabel[ticket.channel] ?? ticket.channel}</span>
                <span className="text-sm font-black">{ticket.subject}</span>
                <Badge value={statusBadge[ticket.status] ?? ticket.status} />
              </div>
              {isHq && ticket.status !== "resolved" && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => void act("reply", ticket.id)} className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black uppercase text-[var(--accent-ink)]"><Reply size={13} /> 回复</button>
                  <button type="button" onClick={() => void act("resolve", ticket.id)} className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black uppercase text-[var(--ok-ink)]"><CheckCircle2 size={13} /> 解决</button>
                </div>
              )}
            </div>
            <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">
              {ticket.authorName}{ticket.organization && `（${ticket.organization}）`} ｜ {ticket.createdAt}{ticket.contact && ` ｜ 联系: ${ticket.contact}`}
            </div>
            <p className="mt-2 text-sm font-bold leading-6 text-[var(--muted-strong)]">{ticket.message}</p>
            {ticket.reply && (
              <div className="mt-2 rounded-[8px] bg-[var(--accent-soft)] p-3 text-sm font-bold leading-6">
                <span className="text-[var(--accent)]">总部回复（{ticket.repliedAt}）：</span>{ticket.reply}
              </div>
            )}
          </div>
        ))}
        {tickets.length === 0 && <div className="panel p-6 text-sm font-bold text-[var(--muted)]">暂无工单。</div>}
      </div>
    </AppShell>
  );
}
