import { jsonResponse, memory } from "../../../lib/server/memory";
import { requirePermission } from "../../../lib/server/authz";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = requirePermission(request, "manage_pontos");
  if (forbidden) return forbidden;

  const { id } = await params;
  const body = await request.json();
  const index = memory.pontos.findIndex((ponto) => ponto.id === id);
  if (index === -1) return jsonResponse({ error: "Ponto not found" }, { status: 404 });

  memory.pontos[index] = { ...memory.pontos[index], ...body };
  return jsonResponse({ data: memory.pontos[index] });
}
