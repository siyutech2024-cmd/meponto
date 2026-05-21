import { jsonResponse, memory } from "../../../lib/server/memory";
import { requirePermission } from "../../../lib/server/authz";

const rewardTypes = new Set(["Rider", "Leader"]);

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = requirePermission(request, "manage_rewards");
  if (forbidden) return forbidden;

  const { id } = await params;
  const body = await request.json();
  const ruleName = typeof body.ruleName === "string" ? body.ruleName.trim() : "";
  const points = Number(body.points);
  const type = typeof body.type === "string" ? body.type : "";

  if (!ruleName || body.points === undefined || !Number.isFinite(points) || !rewardTypes.has(type)) {
    return jsonResponse({ error: "ruleName, numeric points and type Rider or Leader are required" }, { status: 400 });
  }

  const index = memory.rewards.findIndex((reward) => reward.id === id);
  if (index === -1) return jsonResponse({ error: "Reward not found" }, { status: 404 });

  memory.rewards[index] = {
    ...memory.rewards[index],
    ruleName,
    points,
    type,
  };

  return jsonResponse({ data: memory.rewards[index] });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = requirePermission(request, "manage_rewards");
  if (forbidden) return forbidden;

  const { id } = await params;
  const index = memory.rewards.findIndex((reward) => reward.id === id);
  if (index === -1) return jsonResponse({ error: "Reward not found" }, { status: 404 });

  const [removed] = memory.rewards.splice(index, 1);
  return jsonResponse({ data: removed });
}
