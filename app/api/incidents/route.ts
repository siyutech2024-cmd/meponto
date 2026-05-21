import { makeServerId, memory, jsonResponse } from "../../lib/server/memory";
import { requirePermission } from "../../lib/server/authz";
import type { Incident, Severity } from "../../lib/data";

export function GET() {
  return jsonResponse({ data: memory.incidents });
}

export async function POST(request: Request) {
  const forbidden = requirePermission(request, "create_incidents");
  if (forbidden) return forbidden;

  const body = (await request.json()) as Partial<Incident>;
  if (!body.rider || !body.ponto || !body.severity) {
    return jsonResponse({ error: "rider, ponto and severity are required" }, { status: 400 });
  }

  const incident: Incident = {
    id: makeServerId("inc", memory.incidents.length + 1),
    rider: body.rider,
    ponto: body.ponto,
    severity: body.severity as Severity,
    status: "Open",
    location: body.location ?? "",
    description: body.description ?? "",
    createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    responder: body.responder ?? "meponto Ops Desk",
  };

  memory.incidents.unshift(incident);
  return jsonResponse({ data: incident }, { status: 201 });
}
