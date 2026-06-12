import type { Rider } from "./data";
import { can, roles, type Role } from "./rbac";

export function maskCpf(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 11) {
    return `***.***.***-${digits.slice(-2)}`;
  }

  return maskTrailing(value, 2);
}

export function maskPix(value: string) {
  const trimmed = value.trim();
  const atIndex = trimmed.indexOf("@");

  if (atIndex > 0) {
    return `${trimmed[0]}***${trimmed.slice(atIndex)}`;
  }

  return maskTrailing(trimmed, 4);
}

export function canRevealRiderSensitive(request: Request) {
  return getRiderSensitiveRevealDecision(request).allowed;
}

/**
 * Sensitive fields (CPF/PIX) are shown BY DEFAULT to roles that manage riders
 * or finance — pass the session-resolved role in production.
 */
export function getRiderSensitiveRevealDecision(request: Request, resolvedRole?: Role) {
  const roleHeader = request.headers.get("x-vento-role");
  const role = resolvedRole ?? (roleHeader && roles.includes(roleHeader as Role) ? (roleHeader as Role) : undefined);
  const allowed = Boolean(role && (can(role, "manage_riders") || can(role, "view_finance")));
  return { requested: allowed, allowed, role };
}

export function maskRiderSensitive(rider: Rider): Rider {
  return {
    ...rider,
    cpf: maskCpf(rider.cpf),
    pix: maskPix(rider.pix),
  };
}

function maskTrailing(value: string, visibleCount: number) {
  if (!value) return "";
  const visible = value.slice(-visibleCount);
  return `${"*".repeat(Math.max(value.length - visible.length, 3))}${visible}`;
}
