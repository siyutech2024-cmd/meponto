import { acceptClientId, makeServerId, memory, jsonResponse } from "../../lib/server/memory";
import { flushPendingToDatabase } from "../../lib/server/persistence";
import { requirePermission } from "../../lib/server/authz";
import type { Incident, Severity } from "../../lib/data";

export function GET() {
  return jsonResponse({ data: memory.incidents });
}

async function postImpl(request: Request) {
  const forbidden = requirePermission(request, "create_incidents");
  if (forbidden) return forbidden;

  const body = (await request.json()) as Partial<Incident>;
  if (!body.rider || !body.ponto || !body.severity) {
    return jsonResponse({ error: "rider, ponto and severity are required" }, { status: 400 });
  }

  const id = acceptClientId(body.id) ?? makeServerId("inc", memory.incidents.length + 1);
  const existing = memory.incidents.find((item) => item.id === id);
  if (existing) return jsonResponse({ data: existing });

  const incident: Incident = {
    id,
    rider: body.rider,
    ponto: body.ponto,
    severity: body.severity as Severity,
    status: "Open",
    location: body.location ?? "",
    description: body.description ?? "",
    createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    responder: body.responder ?? "MePonto Ops Desk",
  };

  memory.incidents.unshift(incident);
  return jsonResponse({ data: incident }, { status: 201 });
}

// Serverless safety: flush mutations to the database BEFORE returning —
// the instance may freeze right after the response, losing a debounced flush.
export async function POST(...args: Parameters<typeof postImpl>) {
  const response = await postImpl(...args);
  await flushPendingToDatabase();
  return response;
}
