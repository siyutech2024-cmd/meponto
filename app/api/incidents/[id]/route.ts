import { jsonResponse, memory } from "../../../lib/server/memory";
import { requirePermission } from "../../../lib/server/authz";
import type { Incident } from "../../../lib/data";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = requirePermission(request, "close_incidents");
  if (forbidden) return forbidden;

  const { id } = await params;
  const body = (await request.json()) as Partial<Incident>;
  const index = memory.incidents.findIndex((incident) => incident.id === id);
  if (index === -1) return jsonResponse({ error: "Incident not found" }, { status: 404 });

  memory.incidents[index] = { ...memory.incidents[index], ...body };
  return jsonResponse({ data: memory.incidents[index] });
}
