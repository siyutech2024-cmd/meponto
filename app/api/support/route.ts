import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../lib/server/memory";
import { refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission, roleFromRequest } from "../../lib/server/authz";
import type { SupportChannel, SupportTicket } from "../../lib/support";

const COLLECTIONS = ["supportTickets"];
const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");
const CHANNELS: SupportChannel[] = ["rider", "franchise", "station", "partner", "web"];

export async function GET(request: Request) {
  await refreshCollectionsFromDatabase(COLLECTIONS);
  const url = new URL(request.url);
  const mine = url.searchParams.get("authorName") ?? "";

  // Authors can always read their own tickets; the full queue needs audit rights.
  if (mine) {
    const tickets = memory.supportTickets
      .filter((ticket) => ticket.authorName === mine)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return jsonResponse({ data: tickets });
  }

  const forbidden = requirePermission(request, "view_audit");
  if (forbidden) return forbidden;
  const channel = url.searchParams.get("channel") ?? "";
  let tickets = memory.supportTickets.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (channel) tickets = tickets.filter((ticket) => ticket.channel === channel);
  return jsonResponse({ data: tickets });
}

type Body =
  | { action: "create"; channel: SupportChannel; authorName: string; contact: string; organization?: string; subject: string; message: string; website?: string }
  | { action: "reply"; ticketId: string; reply: string }
  | { action: "resolve"; ticketId: string };

export async function POST(request: Request) {
  await refreshCollectionsFromDatabase(COLLECTIONS);
  const body = (await request.json().catch(() => ({}))) as Partial<Body> & Record<string, unknown>;
  const actor = roleFromRequest(request);

  switch (body.action) {
    case "create": {
      // Open endpoint (riders/franchisees/web visitors) — guarded by honeypot,
      // field limits and a same-author rate cap instead of a role check.
      const { channel, authorName, contact, organization = "", subject, message, website } = body as Record<string, string>;
      if (website) return jsonResponse({ data: { ok: true } }); // honeypot hit — pretend success
      if (!CHANNELS.includes(channel as SupportChannel)) return jsonResponse({ error: "invalid channel" }, { status: 400 });
      if (!authorName?.trim() || !subject?.trim() || !message?.trim()) {
        return jsonResponse({ error: "Preencha nome, assunto e mensagem." }, { status: 400 });
      }
      const openByAuthor = memory.supportTickets.filter((t) => t.authorName === authorName.trim() && t.status === "open").length;
      if (openByAuthor >= 3) {
        return jsonResponse({ error: "Você já tem 3 chamados em aberto. Aguarde a resposta da central." }, { status: 429 });
      }

      const ticket: SupportTicket = {
        id: makeServerId("tk", memory.supportTickets.length + 1),
        channel: channel as SupportChannel,
        authorName: authorName.trim().slice(0, 80),
        contact: String(contact ?? "").trim().slice(0, 80),
        organization: String(organization).trim().slice(0, 80),
        subject: subject.trim().slice(0, 120),
        message: message.trim().slice(0, 1000),
        status: "open",
        createdAt: nowStamp(),
      };
      memory.supportTickets.unshift(ticket);

      appendServerAudit({
        actor: actor || "public",
        action: "SUPPORT_TICKET_OPENED",
        entity: "SupportTicket",
        entityId: ticket.id,
        detail: `[${ticket.channel}] ${ticket.authorName}: ${ticket.subject}`,
        risk: "Low",
      });

      return jsonResponse({ data: ticket }, { status: 201 });
    }

    case "reply":
    case "resolve": {
      const forbidden = requirePermission(request, "view_audit");
      if (forbidden) return forbidden;
      const { ticketId } = body as { ticketId?: string };
      const index = memory.supportTickets.findIndex((t) => t.id === ticketId);
      if (index === -1) return jsonResponse({ error: "ticket not found" }, { status: 404 });
      const current = memory.supportTickets[index];
      const stamp = nowStamp();

      if (body.action === "reply") {
        const reply = String((body as { reply?: string }).reply ?? "").trim().slice(0, 1000);
        if (!reply) return jsonResponse({ error: "empty reply" }, { status: 400 });
        memory.supportTickets[index] = { ...current, reply, repliedAt: stamp, repliedBy: actor, status: "answered" };
      } else {
        memory.supportTickets[index] = { ...current, status: "resolved", resolvedAt: stamp };
      }

      appendServerAudit({
        actor,
        action: body.action === "reply" ? "SUPPORT_TICKET_REPLIED" : "SUPPORT_TICKET_RESOLVED",
        entity: "SupportTicket",
        entityId: ticketId ?? "",
        detail: `${current.subject} (${current.authorName})`,
        risk: "Low",
      });

      return jsonResponse({ data: memory.supportTickets[index] });
    }

    default:
      return jsonResponse({ error: "unknown action" }, { status: 400 });
  }
}
