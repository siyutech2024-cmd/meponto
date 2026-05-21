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

export function getRiderSensitiveRevealDecision(request: Request) {
  const revealHeader = request.headers.get("x-vento-reveal-sensitive");
  const roleHeader = request.headers.get("x-vento-role");

  if (revealHeader !== "true" || !roleHeader || !roles.includes(roleHeader as Role)) {
    return {
      requested: revealHeader === "true",
      allowed: false,
      role: roleHeader && roles.includes(roleHeader as Role) ? (roleHeader as Role) : undefined,
    };
  }

  const role = roleHeader as Role;
  return {
    requested: true,
    allowed: can(role, "manage_riders") || can(role, "view_finance"),
    role,
  };
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
