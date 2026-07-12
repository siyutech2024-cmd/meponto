import { randomBytes } from "node:crypto";
import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../lib/server/memory";
import { flushPendingToDatabase, persistDeleteRecord, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { sessionFromRequest } from "../../lib/auth-session";
import { hashPassword } from "../../lib/server/password";
import { emptySupplierProfile, type SupplierProfile } from "../../lib/supplier";
import type { AppUser } from "../../lib/users";

/**
 * Supplier company self-service (供应商门户): company/brand profile, the
 * supplier's own orders, and TEAM accounts (a supply-chain company is not one
 * person). All scoped to the logged-in supplier organization; office sessions
 * (pontomall/pontosys) may pass ?org= for support.
 */

const COLLECTIONS = ["supplierProfiles", "appUsers", "marketplaceProducts", "marketplaceOrders"];

// GET-path throttle: appUsers + marketplaceOrders are the heavy ones and
// change rarely from this route's perspective — refresh at most once a
// minute per instance. POST keeps the strict full refresh.
const HEAVY_TTL_MS = 60_000;
let heavyRefreshedAt = 0;
async function refreshForGet() {
  const wantHeavy = Date.now() - heavyRefreshedAt > HEAVY_TTL_MS;
  await refreshCollectionsFromDatabase(wantHeavy ? COLLECTIONS : ["supplierProfiles", "marketplaceProducts"]);
  if (wantHeavy) heavyRefreshedAt = Date.now();
}
const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

function orgFor(session: { portal: string; organization: string }, url: URL) {
  if (session.portal === "supplier") return session.organization || "";
  if (session.portal === "pontomall" || session.portal === "pontosys") return (url.searchParams.get("org") || "").trim();
  return "";
}

function profileFor(org: string): SupplierProfile {
  return memory.supplierProfiles.find((p) => p.id === org) ?? emptySupplierProfile(org);
}

export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Faça login.", code: "unauthenticated" }, { status: 401 });
  const org = orgFor(session, new URL(request.url));
  if (!org) return jsonResponse({ error: "Organização não identificada.", code: "forbidden" }, { status: 403 });
  await refreshForGet();

  const team = memory.appUsers
    .filter((u) => u.portal === "supplier" && u.organization === org)
    .map((u) => ({ id: u.id, name: u.name, identifier: u.identifier, phone: u.phone, role: u.role, status: u.status, organization: u.organization, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt }));

  const productById = new Map(memory.marketplaceProducts.map((p) => [p.id, p]));
  const orders = memory.marketplaceOrders
    .filter((o) => o.status !== "cancelled" && productById.get(o.productId)?.supplierName === org)
    .map((o) => {
      const p = productById.get(o.productId);
      return { id: o.id, productName: o.productName ?? p?.name ?? o.productId, createdAt: o.createdAt, status: o.status, accountType: o.accountType, supplyPrice: p?.supplyPrice ?? 0, station: o.station ?? "", franchise: o.franchise ?? "" };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 500);

  return jsonResponse({ data: { profile: profileFor(org), team, orders } });
}

type Body = { action?: string } & Record<string, unknown>;

async function handlePost(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Faça login.", code: "unauthenticated" }, { status: 401 });
  const org = orgFor(session, new URL(request.url));
  if (!org) return jsonResponse({ error: "Organização não identificada.", code: "forbidden" }, { status: 403 });
  await refreshCollectionsFromDatabase(COLLECTIONS);
  const body = (await request.json().catch(() => ({}))) as Body;
  const action = String(body.action ?? "");

  // ---- Company / brand profile -------------------------------------------
  if (action === "saveProfile") {
    const prev = profileFor(org);
    const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
    const next: SupplierProfile = {
      id: org,
      companyName: body.companyName !== undefined ? s(body.companyName, 120) || org : prev.companyName,
      brand: body.brand !== undefined ? s(body.brand, 80) : prev.brand,
      cnpj: body.cnpj !== undefined ? s(body.cnpj, 24) : prev.cnpj,
      contactName: body.contactName !== undefined ? s(body.contactName, 80) : prev.contactName,
      contactEmail: body.contactEmail !== undefined ? s(body.contactEmail, 120) : prev.contactEmail,
      contactPhone: body.contactPhone !== undefined ? s(body.contactPhone, 40) : prev.contactPhone,
      address: body.address !== undefined ? s(body.address, 200) : prev.address,
      pixKey: body.pixKey !== undefined ? s(body.pixKey, 120) : prev.pixKey,
      logoUrl: body.logoUrl !== undefined ? s(body.logoUrl, 600) : prev.logoUrl,
      about: body.about !== undefined ? s(body.about, 500) : prev.about,
      updatedAt: nowStamp(),
      updatedBy: session.name,
    };
    const idx = memory.supplierProfiles.findIndex((p) => p.id === org);
    if (idx === -1) memory.supplierProfiles.unshift(next);
    else memory.supplierProfiles[idx] = next;
    appendServerAudit({ actor: session.name, action: "supplier.profile.updated.v1", entity: "SupplierProfile", entityId: org, detail: `${next.companyName} atualizou perfil.`, risk: "Low" });
    return jsonResponse({ data: next });
  }

  // ---- Team account creation (supply-chain company = many people) ---------
  if (action === "createMember") {
    if (session.portal !== "supplier") return jsonResponse({ error: "仅供应商管理员可创建团队账号。", code: "forbidden" }, { status: 403 });
    const identifier = String(body.identifier ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim().slice(0, 80);
    if (!identifier || !name) return jsonResponse({ error: "Nome e e-mail/telefone são obrigatórios.", code: "bad_request" }, { status: 400 });
    if (memory.appUsers.some((u) => u.identifier === identifier)) {
      return jsonResponse({ error: "Já existe uma conta com este e-mail/telefone.", code: "duplicate" }, { status: 409 });
    }
    const tempPassword = randomBytes(5).toString("hex");
    const salt = randomBytes(8).toString("hex");
    const account: AppUser = {
      id: makeServerId("usr", memory.appUsers.length + 1),
      name,
      identifier,
      phone: String(body.phone ?? "").trim().slice(0, 40),
      passwordHash: hashPassword(salt, tempPassword),
      salt,
      role: "Supplier Admin",
      portal: "supplier",
      organization: org,
      tenantId: org,
      defaultPath: "/mall/supplier",
      franchise: "",
      station: "",
      status: "active",
      createdAt: nowStamp(),
    };
    memory.appUsers.unshift(account);
    appendServerAudit({ actor: session.name, action: "supplier.member.created.v1", entity: "AppUser", entityId: account.id, detail: `${org}: novo membro ${name} (${identifier})`, risk: "Medium" });
    return jsonResponse({ data: { id: account.id, name, identifier, tempPassword } }, { status: 201 });
  }

  // ---- Delete the supplier organization (office only) ---------------------
  if (action === "deleteSupplier") {
    if (session.portal !== "pontomall" && session.portal !== "pontosys") {
      return jsonResponse({ error: "仅商城后台可删除供应商。", code: "forbidden" }, { status: 403 });
    }
    // Guard 1: active catalog — the storefront still sells this supplier's goods.
    await refreshCollectionsFromDatabase(["supplierStatements"]);
    const activeProducts = memory.marketplaceProducts.filter((p) => p.supplierName === org && p.status === "active");
    if (activeProducts.length > 0) {
      return jsonResponse({ error: `该供应商仍有 ${activeProducts.length} 个在售商品，请先下架或删除商品后再删除供应商。`, code: "conflict" }, { status: 409 });
    }
    // Guard 2: money still owed — any statement past draft and not yet paid.
    const unpaid = memory.supplierStatements.filter((s) => s.supplierName === org && s.status !== "paid" && s.status !== "draft");
    if (unpaid.length > 0) {
      const total = Math.round(unpaid.reduce((sum, s) => sum + s.total, 0) * 100) / 100;
      return jsonResponse({ error: `该供应商还有 ${unpaid.length} 张未付对账单（合计 R$ ${total.toFixed(2)}），请先结清或重开处理后再删除。`, code: "conflict" }, { status: 409 });
    }
    // 1) Delete the company profile record.
    const profileIndex = memory.supplierProfiles.findIndex((p) => p.id === org);
    if (profileIndex !== -1) {
      memory.supplierProfiles.splice(profileIndex, 1);
      persistDeleteRecord("supplierProfiles", org);
    }
    // 2) Disable (not delete) every supplier-portal login of the organization.
    let disabledAccounts = 0;
    for (let i = 0; i < memory.appUsers.length; i += 1) {
      const user = memory.appUsers[i];
      if (user.portal === "supplier" && user.organization === org && user.status === "active") {
        memory.appUsers[i] = { ...user, status: "disabled" };
        disabledAccounts += 1;
      }
    }
    // 3) Remove the supplier's not-yet-priced submissions (never sold, safe to drop).
    const pendingProducts = memory.marketplaceProducts.filter((p) => p.supplierName === org && p.status === "pending_pricing");
    for (const product of pendingProducts) {
      const at = memory.marketplaceProducts.findIndex((p) => p.id === product.id);
      if (at !== -1) {
        memory.marketplaceProducts.splice(at, 1);
        persistDeleteRecord("marketplaceProducts", product.id);
      }
    }
    appendServerAudit({ actor: session.name, action: "SUPPLIER_DELETED", entity: "SupplierProfile", entityId: org, detail: `供应商「${org}」已删除：${disabledAccounts} 个门户账号停用，${pendingProducts.length} 个待定价商品移除。`, risk: "High" });
    return jsonResponse({ data: { deleted: org, accountsDisabled: disabledAccounts, pendingProductsRemoved: pendingProducts.length } });
  }

  // ---- Enable / disable a team member -------------------------------------
  if (action === "toggleMember") {
    if (session.portal !== "supplier") return jsonResponse({ error: "仅供应商管理员可操作。", code: "forbidden" }, { status: 403 });
    const idx = memory.appUsers.findIndex((u) => u.id === body.userId && u.portal === "supplier" && u.organization === org);
    if (idx === -1) return jsonResponse({ error: "Conta não encontrada.", code: "not_found" }, { status: 404 });
    const status = memory.appUsers[idx].status === "active" ? "disabled" : "active";
    memory.appUsers[idx] = { ...memory.appUsers[idx], status };
    return jsonResponse({ data: { id: memory.appUsers[idx].id, status } });
  }

  return jsonResponse({ error: "unknown action", code: "bad_request" }, { status: 400 });
}

export async function POST(request: Request) {
  const response = await handlePost(request);
  await flushPendingToDatabase();
  return response;
}
