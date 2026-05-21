import { makeServerId, memory, jsonResponse } from "../../lib/server/memory";
import { requirePermission } from "../../lib/server/authz";

export function GET() {
  return jsonResponse({ data: memory.pontos });
}

export async function POST(request: Request) {
  const forbidden = requirePermission(request, "manage_pontos");
  if (forbidden) return forbidden;

  const body = await request.json();
  if (!body.name || !body.bairro) {
    return jsonResponse({ error: "name and bairro are required" }, { status: 400 });
  }

  const ponto = {
    id: makeServerId("p", memory.pontos.length + 1),
    name: String(body.name),
    bairro: String(body.bairro),
    ridersCount: Number(body.ridersCount ?? 0),
    nightShiftLevel: String(body.nightShiftLevel ?? "Low"),
    leader: String(body.leader ?? "Unassigned"),
    safetyScore: Number(body.safetyScore ?? 75),
    lat: Number(body.lat ?? 0),
    lng: Number(body.lng ?? 0),
  };

  memory.pontos.unshift(ponto);
  return jsonResponse({ data: ponto }, { status: 201 });
}
