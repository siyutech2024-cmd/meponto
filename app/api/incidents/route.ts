import { DEMO_INCIDENT_IDS, acceptClientId, demoSeedsActive, makeServerId, memory, jsonResponse } from "../../lib/server/memory";
import { flushPendingToDatabase, persistDeleteRecord, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission } from "../../lib/server/authz";
import type { Incident, Severity } from "../../lib/data";

export async function GET(request: Request) {
  const forbidden = requirePermission(request, "view_dashboard");
  if (forbidden) return forbidden;
  await refreshCollectionsFromDatabase(["incidents"]);
  // 生产库里残留的演示事故(inc-9001~9003,2026-05)读一次就清掉。
  if (!demoSeedsActive()) {
    let removed = 0;
    for (let i = memory.incidents.length - 1; i >= 0; i -= 1) {
      if (!DEMO_INCIDENT_IDS.has(memory.incidents[i].id)) continue;
      persistDeleteRecord("incidents", memory.incidents[i].id);
      memory.incidents.splice(i, 1); // 就地 splice,保持持久化代理跟踪
      removed += 1;
    }
    if (removed > 0) await flushPendingToDatabase();
  }
  return jsonResponse({ data: memory.incidents });
}

async function postImpl(request: Request) {
  const forbidden = requirePermission(request, "create_incidents");
  if (forbidden) return forbidden;

  const body = (await request.json()) as Partial<Incident>;
  if (!body.rider || !body.ponto || !body.severity) {
    return jsonResponse({ error: "rider, ponto and severity are required" }, { status: 400 });
  }

  const id = acceptClientId(body.id) ?? makeServerId("inc", memory.incidents.length + 1);
  const existing = memory.incidents.find((item) => item.id === id);
  if (existing) return jsonResponse({ data: existing });

  const incident: Incident = {
    id,
    rider: body.rider,
    ponto: body.ponto,
    severity: body.severity as Severity,
    status: "Open",
    location: body.location ?? "",
    description: body.description ?? "",
    createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    responder: body.responder ?? "MePonto Ops Desk",
  };

  memory.incidents.unshift(incident);
  return jsonResponse({ data: incident }, { status: 201 });
}

// Serverless safety: flush mutations to the database BEFORE returning —
// the instance may freeze right after the response, losing a debounced flush.
export async function POST(...args: Parameters<typeof postImpl>) {
  const response = await postImpl(...args);
  await flushPendingToDatabase();
  return response;
}
