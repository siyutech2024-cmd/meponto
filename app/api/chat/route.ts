import { makeServerId, memory, jsonResponse } from "../../lib/server/memory";
import { requirePermission } from "../../lib/server/authz";
import type { ChatCoverageStatus, ChatRiskStatus, ChatRoom } from "../../lib/chat";

export function GET() {
  return jsonResponse({ data: memory.chatRooms });
}

export async function POST(request: Request) {
  const forbidden = requirePermission(request, "manage_leaders");
  if (forbidden) return forbidden;

  const body = (await request.json()) as Partial<ChatRoom>;
  if (!body.name || !body.leader || !body.ponto) {
    return jsonResponse({ error: "name, leader and ponto are required" }, { status: 400 });
  }

  const group: ChatRoom = {
    id: makeServerId("chat", memory.chatRooms.length + 1),
    name: body.name,
    bairro: body.bairro ?? "Unassigned",
    ponto: body.ponto,
    leader: body.leader,
    leaderPhone: body.leaderPhone ?? "",
    ridersCount: body.ridersCount ?? 0,
    activeToday: body.activeToday ?? 0,
    nightCoverage: body.nightCoverage ?? 0,
    riskStatus: (body.riskStatus ?? "Watch") as ChatRiskStatus,
    coverageStatus: (body.coverageStatus ?? "Thin") as ChatCoverageStatus,
    lastActivity: body.lastActivity ?? new Date().toISOString().slice(0, 16).replace("T", " "),
    pendingApprovals: body.pendingApprovals ?? 0,
    unreadAlerts: body.unreadAlerts ?? 0,
    broadcastList: body.broadcastList ?? "Manual Dispatch",
  };

  memory.chatRooms.unshift(group);
  return jsonResponse({ data: group }, { status: 201 });
}
