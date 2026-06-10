import { jsonResponse, makeServerId, memory, type ServerAuditEntry } from "../../lib/server/memory";
import { requirePermission } from "../../lib/server/authz";

const auditRisks = new Set(["Low", "Medium", "High"]);

export function GET(request: Request) {
  const forbidden = requirePermission(request, "view_audit");
  if (forbidden) return forbidden;

  const bootstrapEntry: ServerAuditEntry = {
    id: "aud-api-001",
    actor: "System",
    action: "API_AUDIT_BOOTSTRAP",
    entity: "API",
    entityId: "pontosys-api",
    detail: "Server-side audit endpoint is ready for database-backed audit events.",
    risk: "Low",
    createdAt: "2026-05-15 17:36",
  };

  return jsonResponse({
    data: [bootstrapEntry, ...memory.auditEntries],
  });
}

export async function POST(request: Request) {
  const forbidden = requirePermission(request, "view_dashboard");
  if (forbidden) return forbidden;

  const body = (await request.json()) as Partial<ServerAuditEntry>;
  if (!body.actor || !body.action || !body.entity) {
    return jsonResponse({ error: "actor, action and entity are required" }, { status: 400 });
  }

  const id =
    typeof body.id === "string" && /^[\w.:-]{1,64}$/.test(body.id)
      ? body.id
      : makeServerId("aud", memory.auditEntries.length + 1);

  const existing = memory.auditEntries.find((entry) => entry.id === id);
  if (existing) return jsonResponse({ data: existing });

  const entry: ServerAuditEntry = {
    id,
    actor: String(body.actor),
    action: String(body.action),
    entity: String(body.entity),
    entityId: String(body.entityId ?? ""),
    detail: String(body.detail ?? ""),
    risk: auditRisks.has(String(body.risk)) ? (body.risk as ServerAuditEntry["risk"]) : "Low",
    createdAt: typeof body.createdAt === "string" ? body.createdAt : new Date().toISOString().slice(0, 16).replace("T", " "),
  };

  memory.auditEntries.unshift(entry);
  return jsonResponse({ data: entry }, { status: 201 });
}
