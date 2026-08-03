import { can } from "../../../../lib/rbac";
import { appendServerAudit, jsonResponse, memory } from "../../../../lib/server/memory";
import { roleFromRequest } from "../../../../lib/server/authz";
import { sessionFromRequestSync } from "../../../../lib/auth-session";

const requiredPermission = "manage_riders_or_view_finance";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rider = memory.riders.find((item) => item.id === id);
  if (!rider) return jsonResponse({ error: "Rider not found" }, { status: 404 });

  // Production: a valid signed session is mandatory. The legacy x-vento-role
  // header must never grant access to CPF/PIX in production — roleFromRequest
  // only honors it outside production (local tooling / tests).
  if (process.env.NODE_ENV === "production" && !sessionFromRequestSync(request)) {
    appendServerAudit({
      actor: "Unknown",
      action: "REVEAL_RIDER_SENSITIVE_ENDPOINT_DENIED",
      entity: "Rider",
      entityId: id,
      detail: "Sensitive rider endpoint denied: no authenticated session.",
      risk: "High",
    });
    return jsonResponse({ error: "Unauthorized", requiredPermission }, { status: 401 });
  }

  const role = roleFromRequest(request);
  const allowed = can(role, "manage_riders") || can(role, "view_finance");

  if (!allowed) {
    appendServerAudit({
      actor: role,
      action: "REVEAL_RIDER_SENSITIVE_ENDPOINT_DENIED",
      entity: "Rider",
      entityId: id,
      detail: "Sensitive rider endpoint denied because the role lacks permission.",
      risk: "High",
    });

    return jsonResponse(
      {
        error: "Forbidden",
        requiredPermission,
        role,
      },
      { status: 403 },
    );
  }

  appendServerAudit({
    actor: role,
    action: "REVEAL_RIDER_SENSITIVE_ENDPOINT",
    entity: "Rider",
    entityId: id,
    detail: "Sensitive rider fields revealed through the dedicated endpoint.",
    risk: "Medium",
  });

  return jsonResponse({
    data: {
      id: rider.id,
      name: rider.name,
      cpf: rider.cpf,
      pix: rider.pix,
    },
  });
}
