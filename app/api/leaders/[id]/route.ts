import { jsonResponse, memory } from "../../../lib/server/memory";
import { requirePermission } from "../../../lib/server/authz";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = requirePermission(request, "manage_leaders");
  if (forbidden) return forbidden;

  const { id } = await params;
  const body = await request.json();
  const index = memory.leaders.findIndex((leader) => leader.id === id);
  if (index === -1) return jsonResponse({ error: "Leader not found" }, { status: 404 });

  memory.leaders[index] = { ...memory.leaders[index], ...body };
  return jsonResponse({ data: memory.leaders[index] });
}
