import { acceptClientId, makeServerId, memory, jsonResponse } from "../../lib/server/memory";
import { requirePermission } from "../../lib/server/authz";

export function GET() {
  return jsonResponse({ data: memory.leaders });
}

export async function POST(request: Request) {
  const forbidden = requirePermission(request, "manage_leaders");
  if (forbidden) return forbidden;

  const body = await request.json();
  if (!body.name || !body.phone) {
    return jsonResponse({ error: "name and phone are required" }, { status: 400 });
  }

  const id = acceptClientId(body.id) ?? makeServerId("l", memory.leaders.length + 1);
  const existing = memory.leaders.find((item) => item.id === id);
  if (existing) return jsonResponse({ data: existing });

  const leader = {
    id,
    name: String(body.name),
    phone: String(body.phone),
    ponto: String(body.ponto ?? "Unassigned"),
    ridersCount: Number(body.ridersCount ?? 0),
    nightShiftCoverage: Number(body.nightShiftCoverage ?? 0),
    rating: Number(body.rating ?? 4),
    level: String(body.level ?? "New"),
    joinDate: String(body.joinDate ?? new Date().toISOString().slice(0, 10)),
    incidents: Number(body.incidents ?? 0),
  };

  memory.leaders.unshift(leader);
  return jsonResponse({ data: leader }, { status: 201 });
}
