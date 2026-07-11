import { acceptClientId, makeServerId, memory, jsonResponse } from "../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission } from "../../lib/server/authz";

export async function GET() {
  // Read-through refresh: cold serverless instances otherwise return only the
  // static seed stations (the APP map + console lists miss franchise stations).
  await refreshCollectionsFromDatabase(["pontos"]);
  return jsonResponse({ data: memory.pontos });
}

async function postImpl(request: Request) {
  const forbidden = requirePermission(request, "manage_pontos");
  if (forbidden) return forbidden;

  const body = await request.json();
  if (!body.name || !body.bairro) {
    return jsonResponse({ error: "name and bairro are required" }, { status: 400 });
  }

  const id = acceptClientId(body.id) ?? makeServerId("p", memory.pontos.length + 1);
  const existing = memory.pontos.find((item) => item.id === id);
  if (existing) return jsonResponse({ data: existing });

  const ponto = {
    id,
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

// Serverless safety: flush mutations to the database BEFORE returning —
// the instance may freeze right after the response, losing a debounced flush.
export async function POST(...args: Parameters<typeof postImpl>) {
  const response = await postImpl(...args);
  await flushPendingToDatabase();
  return response;
}
