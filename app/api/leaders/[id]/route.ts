import { jsonResponse, memory } from "../../../lib/server/memory";
import { flushPendingToDatabase } from "../../../lib/server/persistence";
import { requirePermission } from "../../../lib/server/authz";

async function putImpl(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = requirePermission(request, "manage_leaders");
  if (forbidden) return forbidden;

  const { id } = await params;
  const body = await request.json();
  const index = memory.leaders.findIndex((leader) => leader.id === id);
  if (index === -1) return jsonResponse({ error: "Leader not found" }, { status: 404 });

  memory.leaders[index] = { ...memory.leaders[index], ...body };
  return jsonResponse({ data: memory.leaders[index] });
}

// Serverless safety: flush mutations to the database BEFORE returning —
// the instance may freeze right after the response, losing a debounced flush.
export async function PUT(...args: Parameters<typeof putImpl>) {
  const response = await putImpl(...args);
  await flushPendingToDatabase();
  return response;
}
