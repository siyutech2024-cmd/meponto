import { acceptClientId, makeServerId, memory, jsonResponse } from "../../lib/server/memory";
import { requirePermission } from "../../lib/server/authz";

const rewardTypes = new Set(["Rider", "Leader"]);

export function GET() {
  return jsonResponse({ data: memory.rewards });
}

export async function POST(request: Request) {
  const forbidden = requirePermission(request, "manage_rewards");
  if (forbidden) return forbidden;

  const body = await request.json();
  const ruleName = typeof body.ruleName === "string" ? body.ruleName.trim() : "";
  const points = Number(body.points);
  const type = typeof body.type === "string" ? body.type : "";

  if (!ruleName || body.points === undefined || !Number.isFinite(points) || !rewardTypes.has(type)) {
    return jsonResponse({ error: "ruleName, numeric points and type Rider or Leader are required" }, { status: 400 });
  }

  const id = acceptClientId(body.id) ?? makeServerId("rw", memory.rewards.length + 1);
  const existing = memory.rewards.find((item) => item.id === id);
  if (existing) return jsonResponse({ data: existing });

  const reward = {
    id,
    ruleName,
    points,
    type,
  };

  memory.rewards.unshift(reward);
  return jsonResponse({ data: reward }, { status: 201 });
}
