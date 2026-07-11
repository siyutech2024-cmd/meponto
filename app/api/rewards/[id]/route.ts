import { jsonResponse, memory } from "../../../lib/server/memory";
import { requirePermission } from "../../../lib/server/authz";
import { flushPendingToDatabase, persistDeleteRecord } from "../../../lib/server/persistence";

const rewardTypes = new Set(["Rider", "Leader"]);

async function putImpl(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

async function deleteImpl(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = requirePermission(request, "manage_rewards");
  if (forbidden) return forbidden;

  const { id } = await params;
  const index = memory.rewards.findIndex((reward) => reward.id === id);
  if (index === -1) return jsonResponse({ error: "Reward not found" }, { status: 404 });

  const [removed] = memory.rewards.splice(index, 1);
  persistDeleteRecord("rewards", id);
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
