import { createHash, randomBytes } from "node:crypto";
import { appendServerAudit, makeServerId, memory, jsonResponse } from "../../lib/server/memory";
import { flushPendingToDatabase, persistDeleteRecord } from "../../lib/server/persistence";
import { requirePermission } from "../../lib/server/authz";
import { ensureDefaultCrmCategories, isSupplierCategory } from "../../lib/server/crm-categories";
import { getAvailablePartnerPoints } from "../../lib/points";
import type { CrmCategory, CrmPartner, CrmPartnerCategory, CrmPartnerRisk, CrmPartnerStatus } from "../../lib/crm";
import type { AppUser } from "../../lib/users";
import type { PortalId } from "../../lib/portals";
import type { Role } from "../../lib/rbac";

/** Suppliers get the supplier portal/workspace; everyone else is a Partner.
 *  The supplier-vs-partner decision comes from the category's configurable
 *  account-type rule (`crmCategories`), not a hardcoded label. */
function accountShapeForCategory(category: CrmPartnerCategory): { portal: PortalId; role: Role; defaultPath: string } {
  if (isSupplierCategory(category)) return { portal: "supplier", role: "Supplier Admin", defaultPath: "/mall/supplier" };
  return { portal: "partner", role: "Partner Operator", defaultPath: "/partner-points" };
}

function hashPassword(salt: string, password: string): string {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

export async function GET(request: Request) {
  // Default service-partner types (idempotent, label-keyed): deployments that
  // hydrated crmCategories from the database never see additions to the seed
  // array, so the category API tops up missing defaults here — user-created
  // categories are untouched.
  await ensureDefaultCrmCategories();
  // Public, lightweight category list for the self-registration form
  // (/partner-register): only id + label of ACTIVE categories — no partner
  // data, no accounts. Everything else in this GET stays console-facing.
  const url = new URL(request.url);
  if (url.searchParams.get("public") === "categories") {
    const categories = memory.crmCategories
      .filter((category) => category.active)
      .sort((a, b) => a.sort - b.sort)
      .map((category) => ({ id: category.id, label: category.label }));
    return jsonResponse({ data: categories });
  }

  // Per-company login-account visibility for the mall office: the main account
  // (provisioned from CRM, tenantId === partner.id) plus a count of all logins
  // under the company (main + team sub-accounts). Lets the office see & manage
  // every supplier/partner account from one place; suppliers stay isolated.
  const accounts: Record<string, { identifier: string; status: string; portal: string; total: number; active: number }> = {};
  for (const partner of memory.crmPartners) {
    const under = memory.appUsers.filter(
      (user) => user.organization === partner.name && (user.portal === "supplier" || user.portal === "partner"),
    );
    if (under.length === 0) continue;
    const main = under.find((user) => user.tenantId === partner.id) ?? under[0];
    accounts[partner.id] = {
      identifier: main.identifier,
      status: main.status,
      portal: main.portal,
      total: under.length,
      active: under.filter((user) => user.status === "active").length,
    };
  }

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

  const categories = [...memory.crmCategories].sort((a, b) => a.sort - b.sort);
  return jsonResponse({ data: memory.crmPartners, summary, accounts, categories });
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
    action?: "setStatus" | "provisionAccount" | "update" | "delete" | "resetAccountPassword" | "setAccountStatus" | "addCategory" | "updateCategory" | "deleteCategory";
    id?: string;
    status?: CrmPartnerStatus;
    identifier?: string;
    accountStatus?: "active" | "disabled";
    categoryId?: string;
    label?: string;
    accountType?: "supplier" | "partner";
    sort?: number;
    active?: boolean;
  } & Partial<CrmPartner>;

  // ---- Configurable category management (no partner id needed) -------------
  if (body.action === "addCategory") {
    const label = String(body.label ?? "").trim().slice(0, 40);
    if (!label) return jsonResponse({ error: "类型名称必填" }, { status: 400 });
    if (memory.crmCategories.some((c) => c.label.toLowerCase() === label.toLowerCase())) {
      return jsonResponse({ error: "已存在同名类型" }, { status: 409 });
    }
    const category: CrmCategory = {
      id: makeServerId("cat", memory.crmCategories.length + 1),
      label,
      accountType: body.accountType === "supplier" ? "supplier" : "partner",
      sort: Number.isFinite(body.sort) ? Number(body.sort) : memory.crmCategories.length + 1,
      active: true,
    };
    memory.crmCategories.push(category);
    appendServerAudit({ actor: "Mall Console", action: "CRM_CATEGORY_CREATED", entity: "CrmCategory", entityId: category.id, detail: `${label} → ${category.accountType}`, risk: "Low" });
    await flushPendingToDatabase();
    return jsonResponse({ data: category }, { status: 201 });
  }

  if (body.action === "updateCategory") {
    const index = memory.crmCategories.findIndex((c) => c.id === body.categoryId);
    if (index === -1) return jsonResponse({ error: "类型不存在" }, { status: 404 });
    const current = memory.crmCategories[index];
    const nextLabel = body.label !== undefined ? String(body.label).trim().slice(0, 40) : current.label;
    if (!nextLabel) return jsonResponse({ error: "类型名称必填" }, { status: 400 });
    if (memory.crmCategories.some((c) => c.id !== current.id && c.label.toLowerCase() === nextLabel.toLowerCase())) {
      return jsonResponse({ error: "已存在同名类型" }, { status: 409 });
    }
    // Renaming a category in use: keep existing partners pointing at the new label.
    if (nextLabel !== current.label) {
      for (let i = 0; i < memory.crmPartners.length; i += 1) {
        if (memory.crmPartners[i].category === current.label) memory.crmPartners[i] = { ...memory.crmPartners[i], category: nextLabel };
      }
    }
    memory.crmCategories[index] = {
      ...current,
      label: nextLabel,
      ...(body.accountType !== undefined ? { accountType: body.accountType === "supplier" ? "supplier" : "partner" } : {}),
      ...(body.sort !== undefined ? { sort: Number(body.sort) || current.sort } : {}),
      ...(body.active !== undefined ? { active: body.active === true } : {}),
    };
    appendServerAudit({ actor: "Mall Console", action: "CRM_CATEGORY_UPDATED", entity: "CrmCategory", entityId: current.id, detail: `${current.label} → ${nextLabel} (${memory.crmCategories[index].accountType})`, risk: "Low" });
    await flushPendingToDatabase();
    return jsonResponse({ data: memory.crmCategories[index] });
  }

  if (body.action === "deleteCategory") {
    const index = memory.crmCategories.findIndex((c) => c.id === body.categoryId);
    if (index === -1) return jsonResponse({ error: "类型不存在" }, { status: 404 });
    const inUse = memory.crmPartners.filter((p) => p.category === memory.crmCategories[index].label).length;
    if (inUse > 0) return jsonResponse({ error: `该类型下还有 ${inUse} 家公司，请先改类型或删除公司` }, { status: 409 });
    const [removed] = memory.crmCategories.splice(index, 1);
    persistDeleteRecord("crmCategories", removed.id);
    appendServerAudit({ actor: "Mall Console", action: "CRM_CATEGORY_DELETED", entity: "CrmCategory", entityId: removed.id, detail: removed.label, risk: "Low" });
    await flushPendingToDatabase();
    return jsonResponse({ data: { deleted: removed.id } });
  }

  const partner = memory.crmPartners.find((item) => item.id === body.id);
  if (!partner) return jsonResponse({ error: "partner not found" }, { status: 404 });

  // Find the company's main login (provisioned from CRM), falling back to any
  // account under the same organization.
  const mainAccountIndex = () => {
    const scoped = memory.appUsers
      .map((user, i) => ({ user, i }))
      .filter(({ user }) => user.organization === partner.name && (user.portal === "supplier" || user.portal === "partner"));
    const primary = scoped.find(({ user }) => user.tenantId === partner.id) ?? scoped[0];
    return primary ? primary.i : -1;
  };

  if (body.action === "resetAccountPassword") {
    const idx = mainAccountIndex();
    if (idx === -1) return jsonResponse({ error: "该公司还没有登录账号，请先开通账号" }, { status: 404 });
    const tempPassword = randomBytes(5).toString("hex");
    const salt = randomBytes(8).toString("hex");
    memory.appUsers[idx] = { ...memory.appUsers[idx], salt, passwordHash: hashPassword(salt, tempPassword) };
    appendServerAudit({ actor: "Mall Console", action: "CRM_ACCOUNT_PASSWORD_RESET", entity: "AppUser", entityId: memory.appUsers[idx].id, detail: `${partner.name} (${memory.appUsers[idx].identifier})`, risk: "Medium" });
    await flushPendingToDatabase();
    return jsonResponse({ data: { identifier: memory.appUsers[idx].identifier, tempPassword } });
  }

  if (body.action === "setAccountStatus") {
    const idx = mainAccountIndex();
    if (idx === -1) return jsonResponse({ error: "该公司还没有登录账号" }, { status: 404 });
    const nextStatus = body.accountStatus === "disabled" ? "disabled" : "active";
    memory.appUsers[idx] = { ...memory.appUsers[idx], status: nextStatus };
    appendServerAudit({ actor: "Mall Console", action: "CRM_ACCOUNT_STATUS", entity: "AppUser", entityId: memory.appUsers[idx].id, detail: `${partner.name} (${memory.appUsers[idx].identifier}) → ${nextStatus}`, risk: nextStatus === "disabled" ? "Medium" : "Low" });
    await flushPendingToDatabase();
    return jsonResponse({ data: { identifier: memory.appUsers[idx].identifier, status: nextStatus } });
  }

  if (body.action === "delete") {
    // Guard 1: outstanding partner points — deleting would orphan a live balance.
    const openPoints = getAvailablePartnerPoints(memory.partnerPointsLedgerEntries, partner.id);
    if (openPoints > 0) {
      return jsonResponse({ error: `「${partner.name}」还有 ${openPoints.toLocaleString()} 未结合作方积分，请先清零积分账户再删除。` }, { status: 409 });
    }
    // Guard 2: service records still awaiting confirmation (未核销).
    const pendingServices = memory.partnerServiceRecords.filter((record) => record.partnerId === partner.id && record.status === "pending").length;
    if (pendingServices > 0) {
      return jsonResponse({ error: `「${partner.name}」还有 ${pendingServices} 条未核销服务记录，请先确认或驳回后再删除。` }, { status: 409 });
    }
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
      ...(body.address !== undefined ? { address: String(body.address) } : {}),
      ...(body.mapUrl !== undefined ? { mapUrl: String(body.mapUrl) } : {}),
      // Rider-facing benefit (per-partner, shown in the rider app) — the
      // fields existed but were never accepted here, so every partner showed
      // the same empty offer.
      ...(body.riderDiscountBRL !== undefined ? { riderDiscountBRL: Math.max(0, Math.round(Number(body.riderDiscountBRL) * 100) / 100) } : {}),
      ...(body.riderRewardPoints !== undefined ? { riderRewardPoints: Math.max(0, Math.floor(Number(body.riderRewardPoints))) } : {}),
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
    // Review closure: a login is only provisioned AFTER the application is
    // approved (status Active). Approving is an explicit setStatus step — the
    // account no longer sneaks a pending partner live as a side effect.
    if (partner.status !== "Active") {
      return jsonResponse({ error: "请先审核通过(状态设为 Active)再开通登录账号。" }, { status: 409 });
    }
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
    appendServerAudit({ actor: "Mall Console", action: "CRM_ACCOUNT_PROVISIONED", entity: "AppUser", entityId: account.id, detail: `${shape.portal} login for ${partner.name} (${identifier})`, risk: "Medium" });
    return jsonResponse({ data: { identifier, portal: shape.portal, defaultPath: shape.defaultPath, tempPassword } }, { status: 201 });
  }

  return jsonResponse({ error: "unknown action" }, { status: 400 });
}
