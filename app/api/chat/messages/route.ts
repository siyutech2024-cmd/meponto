import { makeServerId, memory, jsonResponse } from "../../../lib/server/memory";
import { requirePermission } from "../../../lib/server/authz";
import type { ChatMessage } from "../../../lib/chat";

export function GET(request: Request) {
  const roomId = new URL(request.url).searchParams.get("roomId");
  const data = roomId ? memory.chatMessages.filter((message) => message.roomId === roomId) : memory.chatMessages;
  return jsonResponse({ data });
}

export async function POST(request: Request) {
  const forbidden = requirePermission(request, "manage_leaders");
  if (forbidden) return forbidden;

  const body = (await request.json()) as Partial<ChatMessage>;
  if (!body.roomId || !body.body) {
    return jsonResponse({ error: "roomId and body are required" }, { status: 400 });
  }

  if (!memory.chatRooms.some((room) => room.id === body.roomId)) {
    return jsonResponse({ error: "chat room not found" }, { status: 404 });
  }

  const message: ChatMessage = {
    id: makeServerId("msg", memory.chatMessages.length + 1),
    roomId: body.roomId,
    sender: body.sender ?? "Ops Desk",
    senderRole: body.senderRole ?? "HQ",
    body: body.body,
    createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    status: body.status ?? "Delivered",
  };

  memory.chatMessages.push(message);
  return jsonResponse({ data: message }, { status: 201 });
}
