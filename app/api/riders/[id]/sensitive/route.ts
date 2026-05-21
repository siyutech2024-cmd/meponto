import { can, roles, type Role } from "../../../../lib/rbac";
import { appendServerAudit, jsonResponse, memory } from "../../../../lib/server/memory";

const requiredPermission = "manage_riders_or_view_finance";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rider = memory.riders.find((item) => item.id === id);
  if (!rider) return jsonResponse({ error: "Rider not found" }, { status: 404 });

  const roleHeader = request.headers.get("x-vento-role");
  const role = roleHeader && roles.includes(roleHeader as Role) ? (roleHeader as Role) : undefined;
  const allowed = role ? can(role, "manage_riders") || can(role, "view_finance") : false;

  if (!role || !allowed) {
    appendServerAudit({
      actor: role ?? "Unknown",
      action: "REVEAL_RIDER_SENSITIVE_ENDPOINT_DENIED",
      entity: "Rider",
      entityId: id,
      detail: roleHeader
        ? "Sensitive rider endpoint denied because the role lacks permission."
        : "Sensitive rider endpoint denied because x-vento-role was not provided.",
      risk: "High",
    });

    return jsonResponse(
      {
        error: "Forbidden",
        requiredPermission,
        requiredHeader: "x-vento-role",
        role: roleHeader ?? null,
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
