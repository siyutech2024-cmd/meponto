import { permissionLabels, rolePermissions, roles } from "../../lib/rbac";
import { jsonResponse } from "../../lib/server/memory";

export function GET() {
  return jsonResponse({
    data: {
      roles,
      permissionLabels,
      rolePermissions,
    },
  });
}
