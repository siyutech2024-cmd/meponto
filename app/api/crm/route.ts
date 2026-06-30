import { createHash, randomBytes } from "node:crypto";
import { appendServerAudit, makeServerId, memory, jsonResponse } from "../../lib/server/memory";
import { flushPendingToDatabase, persistDeleteRecord } from "../../lib/server/persistence";
import { requirePermission } from "../../lib/server/authz";
import type { CrmPartner, CrmPartnerCategory, CrmPartnerRisk, CrmPartnerStatus } from "../../lib/crm";
import type { AppUser } from "../../lib/users";
import type { PortalId } from "../../lib/portals";
import type { Role } from "../../lib/rbac";

/** Suppliers get the supplier portal/workspace; everyone else is a Partner. */
function accountShapeForCategory(category: CrmPartnerCategory): { portal: PortalId; role: Role; defaultPath: string } {
  if (category === "Supplier") return { portal: "supplier", role: "Supplier Admin", defaultPath: "/mall/supplier" };
  return { portal: "partner", role: "Partner Operator", defaultPath: "/partner-points" };
}

function hashPassword(salt: string, password: string): string {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

export function GET() {
  const summary = memory.crmPartners.reduce(
    (acc, partner) => {
      acc.byCategory[partner.category] = (acc.byCategory[partner.category] ?? 0) + 1;
      acc.byRisk[partner.risk] = (acc.byRisk[partner.risk] ?? 0) + 1;
      acc.monthlyVolume += partner.monthlyVolume;
      acc.vehiclesAvailable += partner.vehiclesAvailable;
      return acc;
    },
    {
      byCategory: {} as Partial<Record<CrmPartnerCategory, number>>,
      byRisk: {} as Partial<Record<CrmPartnerRisk, number>>,
      monthlyVolume: 0,
      vehiclesAvailable: 0,
    },
  );

  return jsonResponse({ data: memory.crmPartners, summary });
}

export async function POST(request: Request) {
  const forbidden = requirePermission(request, "view_analytics");
  if (forbidden) return forbidden;

  const body = (await request.json()) as Partial<CrmPartner>;
  if (!body.name || !body.category || !body.contactName || !body.phone) {
    return jsonResponse({ error: "name, category, contactName and phone are required" }, { status: 400 });
  }

  const partner: CrmPartner = {
    id: makeServerId("crm", memory.crmPartners.length + 1),
    name: body.name,
    category: body.category,
    status: body.status ?? "Prospect",
    tier: body.tier ?? "Standard",
    contactName: body.contactName,
    phone: body.phone,
    bairro: body.bairro ?? "Unassigned",
    owner: body.owner ?? "MePonto Partnerships",
    slaHours: Number(body.slaHours ?? 12),
    monthlyVolume: Number(body.monthlyVolume ?? 0),
    activeDeals: Number(body.activeDeals ?? 0),
    vehiclesAvailable: Number(body.vehiclesAvailable ?? 0),
    contractRenewal: body.contractRenewal ?? new Date().toISOString().slice(0, 10),
    risk: body.risk ?? "Medium",
    notes: body.notes ?? "",
    services: body.services ?? [],
    lat: Number(body.lat ?? -23.5505),
    lng: Number(body.lng ?? -46.6333),
  };

  memory.crmPartners.unshift(partner);
  appendServerAudit({ actor: "Mall Console", action: "CRM_PARTNER_CREATED", entity: "CrmPartner", entityId: partner.id, detail: `${partner.name} (${partner.category}, ${partner.status})`, risk: "Low" });
  return jsonResponse({ data: partner }, { status: 201 });
}

/**
 * Review + onboarding actions on a partner/supplier:
 *  - setStatus  : approve (→ Active), put under review, or suspend.
 *  - provisionAccount : create a login account (supplier or partner portal,
 *    scoped by organization = partner name) so they can self-manage. Returns a
 *    one-time temporary password the operator hands over.
 */
export async function PATCH(request: Request) {
  const forbidden = requirePermission(request, "view_analytics");
  if (forbidden) return forbidden;

  const body = (await request.json().catch(() => ({}))) as {
    action?: "setStatus" | "provisionAccount" | "update" | "delete";
    id?: string;
    status?: CrmPartnerStatus;
    identifier?: string;
  } & Partial<CrmPartner>;
  const partner = memory.crmPartners.find((item) => item.id === body.id);
  if (!partner) return jsonResponse({ error: "partner not found" }, { status: 404 });

  if (body.action === "delete") {
    // Remove the partner/supplier record AND any login accounts scoped to it
    // (organization = partner name), so a deleted company can't still sign in.
    const index = memory.crmPartners.findIndex((item) => item.id === partner.id);
    memory.crmPartners.splice(index, 1);
    persistDeleteRecord("crmPartners", partner.id);
    const linkedAccounts = memory.appUsers.filter(
      (user) => user.organization === partner.name && (user.portal === "supplier" || user.portal === "partner"),
    );
    for (const account of linkedAccounts) {
      const at = memory.appUsers.findIndex((user) => user.id === account.id);
      if (at !== -1) {
        memory.appUsers.splice(at, 1);
        persistDeleteRecord("appUsers", account.id);
      }
    }
    appendServerAudit({ actor: "Mall Console", action: "CRM_PARTNER_DELETED", entity: "CrmPartner", entityId: partner.id, detail: `${partner.name} (${partner.category}) deleted with ${linkedAccounts.length} login account(s)`, risk: "High" });
    await flushPendingToDatabase();
    return jsonResponse({ data: { deleted: partner.id, accountsRemoved: linkedAccounts.length } });
  }

  if (body.action === "update") {
    const index = memory.crmPartners.findIndex((item) => item.id === partner.id);
    const next: CrmPartner = {
      ...partner,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
      ...(body.contactName !== undefined ? { contactName: body.contactName } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.bairro !== undefined ? { bairro: body.bairro } : {}),
      ...(body.owner !== undefined ? { owner: body.owner } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.tier !== undefined ? { tier: body.tier } : {}),
      ...(body.risk !== undefined ? { risk: body.risk } : {}),
      ...(body.monthlyVolume !== undefined ? { monthlyVolume: Number(body.monthlyVolume) } : {}),
      ...(body.vehiclesAvailable !== undefined ? { vehiclesAvailable: Number(body.vehiclesAvailable) } : {}),
      ...(body.services !== undefined ? { services: body.services } : {}),
      ...(body.lat !== undefined ? { lat: Number(body.lat) } : {}),
      ...(body.lng !== undefined ? { lng: Number(body.lng) } : {}),
    };
    memory.crmPartners[index] = next;
    appendServerAudit({ actor: "Mall Console", action: "CRM_PARTNER_UPDATED", entity: "CrmPartner", entityId: partner.id, detail: `${partner.name} atualizado (loc ${next.lat},${next.lng})`, risk: "Low" });
    return jsonResponse({ data: next });
  }

  if (body.action === "setStatus") {
    const allowed: CrmPartnerStatus[] = ["Active", "Prospect", "Review", "Suspended"];
    if (!body.status || !allowed.includes(body.status)) return jsonResponse({ error: "invalid status" }, { status: 400 });
    const index = memory.crmPartners.findIndex((item) => item.id === partner.id);
    memory.crmPartners[index] = { ...partner, status: body.status };
    appendServerAudit({ actor: "Mall Console", action: "CRM_PARTNER_STATUS", entity: "CrmPartner", entityId: partner.id, detail: `${partner.name} → ${body.status}`, risk: body.status === "Suspended" ? "High" : "Low" });
    return jsonResponse({ data: memory.crmPartners[index] });
  }

  if (body.action === "provisionAccount") {
    const identifier = (body.identifier ?? "").trim().toLowerCase();
    if (!identifier) return jsonResponse({ error: "identifier (e-mail or phone) is required" }, { status: 400 });
    if (memory.appUsers.some((user) => user.identifier === identifier)) {
      return jsonResponse({ error: "An account with this identifier already exists." }, { status: 409 });
    }
    const shape = accountShapeForCategory(partner.category);
    const tempPassword = randomBytes(5).toString("hex"); // 10-char one-time password
    const salt = randomBytes(8).toString("hex");
    const account: AppUser = {
      id: makeServerId("usr", memory.appUsers.length + 1),
      name: partner.contactName || partner.name,
      identifier,
      phone: partner.phone ?? "",
      passwordHash: hashPassword(salt, tempPassword),
      salt,
      role: shape.role,
      portal: shape.portal,
      organization: partner.name,
      tenantId: partner.id,
      defaultPath: shape.defaultPath,
      franchise: "",
      station: "",
      status: "active",
      createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    };
    memory.appUsers.unshift(account);
    // Activating the account also moves a pending partner live.
    const index = memory.crmPartners.findIndex((item) => item.id === partner.id);
    if (memory.crmPartners[index].status !== "Active") memory.crmPartners[index] = { ...memory.crmPartners[index], status: "Active" };
    appendServerAudit({ actor: "Mall Console", action: "CRM_ACCOUNT_PROVISIONED", entity: "AppUser", entityId: account.id, detail: `${shape.portal} login for ${partner.name} (${identifier})`, risk: "Medium" });
    return jsonResponse({ data: { identifier, portal: shape.portal, defaultPath: shape.defaultPath, tempPassword } }, { status: 201 });
  }

  return jsonResponse({ error: "unknown action" }, { status: 400 });
}
