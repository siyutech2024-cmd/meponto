import { jsonResponse, memory } from "../../../lib/server/memory";
import { flushPendingToDatabase } from "../../../lib/server/persistence";
import { requirePermission } from "../../../lib/server/authz";
import type { Incident } from "../../../lib/data";

async function putImpl(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = requirePermission(request, "close_incidents");
  if (forbidden) return forbidden;

  const { id } = await params;
  const body = (await request.json()) as Partial<Incident>;
  const index = memory.incidents.findIndex((incident) => incident.id === id);
  if (index === -1) return jsonResponse({ error: "Incident not found" }, { status: 404 });

  memory.incidents[index] = { ...memory.incidents[index], ...body };
  return jsonResponse({ data: memory.incidents[index] });
}

// Serverless safety: flush mutations to the database BEFORE returning —
// the instance may freeze right after the response, losing a debounced flush.
export async function PUT(...args: Parameters<typeof putImpl>) {
  const response = await putImpl(...args);
  await flushPendingToDatabase();
  return response;
}
