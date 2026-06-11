import { can, roles, type Permission, type Role } from "../rbac";
import { appendServerAudit, jsonResponse } from "./memory";

export function roleFromRequest(request: Request): Role {
  const headerRole = request.headers.get("x-vento-role");
  if (headerRole && roles.includes(headerRole as Role)) {
    return headerRole as Role;
  }

  return "Super Admin";
}

export function requirePermission(request: Request, permission: Permission) {
  const role = roleFromRequest(request);

  if (can(role, permission)) {
    return null;
  }

  appendServerAudit({
    actor: role,
    action: "FORBIDDEN_PERMISSION_ATTEMPT",
    entity: "Permission",
    entityId: permission,
    detail: `${role} attempted to use ${permission} without permission.`,
    risk: "High",
  });

  return jsonResponse(
    {
      error: "Forbidden",
      requiredPermission: permission,
      role,
    },
    { status: 403 },
  );
}

/**
 * Data scope from the logged-in session: franchise portal accounts only see
 * their own franchise; station portal accounts only their own station.
 * HQ (pontosys) and everything else are unscoped.
 */
export async function scopeFromRequest(request: Request): Promise<{ franchise?: string; station?: string }> {
  const { sessionFromRequest } = await import("../auth-session");
  const session = await sessionFromRequest(request);
  if (!session) return {};
  if (session.portal === "franchise") {
    const franchise = session.franchise || session.organization;
    return franchise ? { franchise } : {};
  }
  if (session.portal === "ponto") {
    return {
      ...(session.station || session.organization ? { station: session.station || session.organization } : {}),
      ...(session.franchise ? { franchise: session.franchise } : {}),
    };
  }
  return {};
}
