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
