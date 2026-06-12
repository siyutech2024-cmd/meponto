import { createHash, randomBytes } from "node:crypto";
import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../lib/server/memory";
import { flushPendingToDatabase, persistDeleteRecord, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission, roleFromRequest, scopeFromRequest } from "../../lib/server/authz";
import { roles, type Role } from "../../lib/rbac";
import { portalConfigs, type PortalId } from "../../lib/portals";
import type { AppUser } from "../../lib/users";

function hashPassword(salt: string, password: string): string {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function sanitize(user: AppUser) {
  const { passwordHash: _hash, salt: _salt, ...safe } = user;
  return safe;
}

function nowStamp() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

export async function GET(request: Request) {
  // Franchises manage their OWN station accounts; everything else needs HQ audit rights.
  const scope = await scopeFromRequest(request);
  if (!scope.franchise) {
    const forbidden = requirePermission(request, "view_audit");
    if (forbidden) return forbidden;
  }

  await refreshCollectionsFromDatabase(["appUsers"]);
  const rows = scope.franchise
    ? memory.appUsers.filter((user) => user.portal === "ponto" && user.franchise === scope.franchise)
    : memory.appUsers;
  return jsonResponse({
    data: rows.map(sanitize),
    scoped: Boolean(scope.franchise),
    summary: {
      total: rows.length,
      active: rows.filter((user) => user.status === "active").length,
    },
  });
}

type CreateBody = {
  action: "create";
  name: string;
  identifier: string;
  phone?: string;
  password: string;
  role: Role;
  portal: PortalId;
  franchise?: string;
  station?: string;
  organization?: string;
};

type UpdateBody = {
  action: "update";
  userId: string;
  name?: string;
  phone?: string;
  role?: Role;
  portal?: PortalId;
  franchise?: string;
  station?: string;
  status?: "active" | "disabled";
};

type ResetBody = { action: "resetPassword"; userId: string; password: string };
type DeleteBody = { action: "delete"; userId: string };

type Body = CreateBody | UpdateBody | ResetBody | DeleteBody;

async function handlePost(request: Request) {
  const scope = await scopeFromRequest(request);
  if (!scope.franchise) {
    const forbidden = requirePermission(request, "view_audit");
    if (forbidden) return forbidden;
  }

  await refreshCollectionsFromDatabase(["appUsers"]);
  const body = (await request.json().catch(() => ({}))) as Partial<Body>;
  const actor = roleFromRequest(request);

  // A franchise may only manage station accounts under itself.
  if (scope.franchise) {
    if (body.action === "create") {
      const create = body as CreateBody;
      create.portal = "ponto";
      create.role = "Ponto Manager" as Role;
      create.franchise = scope.franchise;
      create.organization = create.station || scope.franchise;
    } else if (body.action === "update" || body.action === "resetPassword" || body.action === "delete") {
      const target = memory.appUsers.find((user) => user.id === (body as UpdateBody | ResetBody | DeleteBody).userId);
      if (!target || target.portal !== "ponto" || target.franchise !== scope.franchise) {
        return jsonResponse({ error: "只能管理本加盟商的站点账号" }, { status: 403 });
      }
      if (body.action === "update") {
        const patch = body as UpdateBody;
        delete patch.role;
        delete patch.portal;
        delete patch.franchise;
      }
    }
  }

  switch (body.action) {
    case "create": {
      const { name, identifier, phone = "", password, role, portal, franchise = "", station = "", organization = "" } = body as CreateBody;
      const normalized = String(identifier ?? "").trim().toLowerCase();
      if (!name || !normalized || !password || String(password).length < 6) {
        return jsonResponse({ error: "name, identifier and password (min 6 chars) are required" }, { status: 400 });
      }
      if (!roles.includes(role as Role)) return jsonResponse({ error: "invalid role" }, { status: 400 });
      if (!portalConfigs[portal as PortalId]) return jsonResponse({ error: "invalid portal" }, { status: 400 });
      if (memory.appUsers.some((user) => user.identifier === normalized)) {
        return jsonResponse({ error: "identifier already exists" }, { status: 409 });
      }
      if (!portalConfigs[portal as PortalId].allowedRoles.includes(role as Role)) {
        return jsonResponse({ error: `role ${role} is not allowed for portal ${portal}` }, { status: 400 });
      }

      const salt = randomBytes(8).toString("hex");
      const user: AppUser = {
        id: makeServerId("usr", memory.appUsers.length + 1),
        name: String(name).slice(0, 80),
        identifier: normalized,
        phone: String(phone).slice(0, 40),
        passwordHash: hashPassword(salt, String(password)),
        salt,
        role: role as Role,
        portal: portal as PortalId,
        organization: String(organization || franchise || "MePonto").slice(0, 80),
        tenantId: `tenant-${(franchise || "hq").toLowerCase().replace(/\s+/g, "-")}`.slice(0, 60),
        defaultPath: portalConfigs[portal as PortalId].homePath,
        franchise: String(franchise).slice(0, 80),
        station: String(station).slice(0, 80),
        status: "active",
        createdAt: nowStamp(),
      };
      memory.appUsers.unshift(user);

      appendServerAudit({
        actor,
        action: "USER_CREATED",
        entity: "AppUser",
        entityId: user.id,
        detail: `${user.name} (${user.identifier}) created as ${user.role} on ${user.portal}.`,
        risk: "Medium",
      });

      return jsonResponse({ data: sanitize(user) }, { status: 201 });
    }

    case "update": {
      const { userId, ...patch } = body as UpdateBody;
      const index = memory.appUsers.findIndex((user) => user.id === userId);
      if (index === -1) return jsonResponse({ error: "user not found" }, { status: 404 });

      const current = memory.appUsers[index];
      const nextRole = patch.role && roles.includes(patch.role) ? patch.role : current.role;
      const nextPortal = patch.portal && portalConfigs[patch.portal] ? patch.portal : current.portal;
      if (!portalConfigs[nextPortal].allowedRoles.includes(nextRole)) {
        return jsonResponse({ error: `role ${nextRole} is not allowed for portal ${nextPortal}` }, { status: 400 });
      }

      memory.appUsers[index] = {
        ...current,
        name: patch.name !== undefined ? String(patch.name).slice(0, 80) : current.name,
        phone: patch.phone !== undefined ? String(patch.phone).slice(0, 40) : current.phone,
        role: nextRole,
        portal: nextPortal,
        defaultPath: portalConfigs[nextPortal].homePath,
        franchise: patch.franchise !== undefined ? String(patch.franchise).slice(0, 80) : current.franchise,
        station: patch.station !== undefined ? String(patch.station).slice(0, 80) : current.station,
        status: patch.status === "active" || patch.status === "disabled" ? patch.status : current.status,
      };

      appendServerAudit({
        actor,
        action: "USER_UPDATED",
        entity: "AppUser",
        entityId: userId ?? "",
        detail: `${current.identifier} updated (${Object.keys(patch).join(", ")}).`,
        risk: patch.status === "disabled" ? "Medium" : "Low",
      });

      return jsonResponse({ data: sanitize(memory.appUsers[index]) });
    }

    case "resetPassword": {
      const { userId, password } = body as ResetBody;
      if (!password || String(password).length < 6) {
        return jsonResponse({ error: "password must have at least 6 characters" }, { status: 400 });
      }
      const index = memory.appUsers.findIndex((user) => user.id === userId);
      if (index === -1) return jsonResponse({ error: "user not found" }, { status: 404 });

      const salt = randomBytes(8).toString("hex");
      memory.appUsers[index] = { ...memory.appUsers[index], salt, passwordHash: hashPassword(salt, String(password)) };

      appendServerAudit({
        actor,
        action: "USER_PASSWORD_RESET",
        entity: "AppUser",
        entityId: userId ?? "",
        detail: `Password reset for ${memory.appUsers[index].identifier}.`,
        risk: "Medium",
      });

      return jsonResponse({ data: { ok: true } });
    }

    case "delete": {
      const { userId } = body as DeleteBody;
      const index = memory.appUsers.findIndex((user) => user.id === userId);
      if (index === -1) return jsonResponse({ error: "user not found" }, { status: 404 });
      const victim = memory.appUsers[index];
      // Never delete the last active HQ admin — that would lock everyone out.
      if (victim.portal === "pontosys") {
        const otherHqAdmins = memory.appUsers.filter((user) => user.id !== userId && user.portal === "pontosys" && user.status === "active").length;
        if (otherHqAdmins === 0) return jsonResponse({ error: "不能删除最后一个总部管理员账号" }, { status: 409 });
      }
      memory.appUsers.splice(index, 1);
      persistDeleteRecord("appUsers", userId);
      appendServerAudit({ actor, action: "USER_DELETED", entity: "AppUser", entityId: userId, detail: `${victim.name} (${victim.identifier}, ${victim.role}@${victim.portal}) deleted.`, risk: "High" });
      return jsonResponse({ data: { deleted: userId } });
    }

    default:
      return jsonResponse({ error: "unknown action" }, { status: 400 });
  }
}

// Durably persist account changes before the serverless instance can freeze.
export async function POST(request: Request) {
  const response = await handlePost(request);
  await flushPendingToDatabase();
  return response;
}
