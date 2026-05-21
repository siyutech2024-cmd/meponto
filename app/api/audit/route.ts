import { jsonResponse, memory, type ServerAuditEntry } from "../../lib/server/memory";
import { requirePermission } from "../../lib/server/authz";

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
