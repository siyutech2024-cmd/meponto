import type { Role } from "./rbac";
import type { PortalId } from "./portals";

export type AppUserStatus = "active" | "disabled";

export type AppUser = {
  id: string;
  name: string;
  /** Login identifier: e-mail or phone, stored lowercase/trimmed. */
  identifier: string;
  phone: string;
  passwordHash: string; // sha256(salt:password)
  salt: string;
  role: Role;
  portal: PortalId;
  organization: string;
  tenantId: string;
  defaultPath: string;
  franchise: string;
  station: string;
  status: AppUserStatus;
  createdAt: string;
  lastLoginAt?: string;
};

/** Seeds are empty — accounts are created from the admin console. */
export const appUsers: AppUser[] = [];
