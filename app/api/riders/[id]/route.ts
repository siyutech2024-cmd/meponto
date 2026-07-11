import { appendServerAudit, jsonResponse, memory } from "../../../lib/server/memory";
import { flushPendingToDatabase, persistDeleteRecord } from "../../../lib/server/persistence";
import { requirePermission, roleFromRequest } from "../../../lib/server/authz";
import type { Rider } from "../../../lib/data";
import { getRiderSensitiveRevealDecision, maskRiderSensitive } from "../../../lib/masking";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reveal = getRiderSensitiveRevealDecision(request, roleFromRequest(request));

  if (reveal.requested) {
    appendServerAudit({
      actor: reveal.role ?? "Unknown",
      action: reveal.allowed ? "REVEAL_RIDER_SENSITIVE" : "REVEAL_RIDER_SENSITIVE_DENIED",
      entity: "Rider",
      entityId: id,
      detail: reveal.allowed
        ? "Sensitive rider fields revealed for rider detail API response."
        : "Sensitive rider reveal denied for rider detail API response.",
      risk: reveal.allowed ? "Medium" : "High",
    });
  }

  const rider = memory.riders.find((item) => item.id === id);
  if (!rider) return jsonResponse({ error: "Rider not found" }, { status: 404 });

  const data = reveal.allowed ? rider : maskRiderSensitive(rider);
  return jsonResponse({ data });
}

async function putImpl(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = requirePermission(request, "manage_riders");
  if (forbidden) return forbidden;

  const { id } = await params;
  const body = (await request.json()) as Partial<Rider>;
  const index = memory.riders.findIndex((rider) => rider.id === id);
  if (index === -1) return jsonResponse({ error: "Rider not found" }, { status: 404 });

  memory.riders[index] = { ...memory.riders[index], ...body };
  return jsonResponse({ data: memory.riders[index] });
}

async function deleteImpl(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = requirePermission(_request, "manage_riders");
  if (forbidden) return forbidden;

  const { id } = await params;
  const index = memory.riders.findIndex((rider) => rider.id === id);
  if (index === -1) return jsonResponse({ error: "Rider not found" }, { status: 404 });

  const [removed] = memory.riders.splice(index, 1);
  persistDeleteRecord("riders", id);
  return jsonResponse({ data: removed });
}

// Serverless safety: flush mutations to the database BEFORE returning —
// the instance may freeze right after the response, losing a debounced flush.
export async function PUT(...args: Parameters<typeof putImpl>) {
  const response = await putImpl(...args);
  await flushPendingToDatabase();
  return response;
}
export async function DELETE(...args: Parameters<typeof deleteImpl>) {
  const response = await deleteImpl(...args);
  await flushPendingToDatabase();
  return response;
}
