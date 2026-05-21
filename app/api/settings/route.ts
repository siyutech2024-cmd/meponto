import { makeServerId, memory, jsonResponse } from "../../lib/server/memory";
import { requirePermission } from "../../lib/server/authz";
import type { SystemSetting } from "../../lib/settings";

export function GET() {
  return jsonResponse({
    data: memory.systemSettings,
    summary: memory.systemSettings.reduce(
      (acc, setting) => {
        acc[setting.status] += 1;
        return acc;
      },
      { Active: 0, Draft: 0, Paused: 0 },
    ),
  });
}

export async function POST(request: Request) {
  const forbidden = requirePermission(request, "reset_demo");
  if (forbidden) return forbidden;

  const body = (await request.json()) as Partial<SystemSetting>;
  if (!body.category || !body.name || !body.value) {
    return jsonResponse({ error: "category, name and value are required" }, { status: 400 });
  }

  const setting: SystemSetting = {
    id: makeServerId("set", memory.systemSettings.length + 1),
    category: body.category,
    name: body.name,
    value: body.value,
    unit: body.unit ?? "",
    status: body.status ?? "Draft",
    owner: body.owner ?? "Super Admin",
    updatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    description: body.description ?? "",
  };

  memory.systemSettings.unshift(setting);
  return jsonResponse({ data: setting }, { status: 201 });
}
