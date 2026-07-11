import { jsonResponse } from "../../../lib/server/memory";
import { flushPendingToDatabase } from "../../../lib/server/persistence";
import { findTestAccount, mallHubPortals, portalConfigs, type PortalId, type TestAccount } from "../../../lib/portals";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import type { Role } from "../../../lib/rbac";
import { createSessionToken, sessionCookie } from "../../../lib/auth-session";

type LoginBody = {
  identifier?: string;
  phone?: string;
  password?: string;
  portal?: PortalId;
};

async function postImpl(request: Request) {
  const body = (await request.json().catch(() => ({}))) as LoginBody;

  const identifier = body.identifier ?? body.phone ?? "";

  if (!identifier || !body.password) {
    return jsonResponse({ error: "identifier and password are required" }, { status: 400 });
  }

  const account =
    (await findAppUserAccount(identifier, body.password)) ??
    (await findSupabaseTestAccount(identifier, body.password)) ??
    findTestAccount(identifier, body.password);
  if (!account) {
    return jsonResponse({ error: "Invalid account or password" }, { status: 401 });
  }

  // The mall hub (operator + supplier + partner) shares one login at
  // mall.meponto.com, so an account is accepted when it belongs to the same
  // hub as the selected portal — otherwise the strict per-system check stands.
  const sameMallHub = !!body.portal && mallHubPortals.includes(body.portal) && mallHubPortals.includes(account.portal);
  if (body.portal && account.portal !== body.portal && !sameMallHub) {
    return jsonResponse({ error: "This account does not belong to the selected system." }, { status: 403 });
  }

  const token = await createSessionToken({
    userId: account.id,
    name: account.name,
    identifier: account.identifier,
    role: account.role,
    portal: account.portal,
    tenantId: account.tenantId,
    organization: account.organization,
    defaultPath: account.defaultPath,
    franchise: (account as TestAccount & { franchise?: string }).franchise ?? "",
    station: (account as TestAccount & { station?: string }).station ?? "",
  });

  const response = jsonResponse({
    status: "authenticated",
    user: {
      id: account.id,
      name: account.name,
      identifier: account.identifier,
      phone: account.phone,
      role: account.role,
      portal: account.portal,
      tenantId: account.tenantId,
      organization: account.organization,
      defaultPath: account.defaultPath,
      portalName: portalConfigs[account.portal].productName,
      region: "Sao Paulo Core Network",
      franchise: (account as TestAccount & { franchise?: string }).franchise ?? "",
      station: (account as TestAccount & { station?: string }).station ?? "",
    },
  });
  response.headers.append("Set-Cookie", sessionCookie(token, request.headers.get("host")));
  return response;
}

/** Real multi-user accounts created from the admin console (/users). */
async function findAppUserAccount(identifier: string, password: string): Promise<TestAccount | undefined> {
  const { createHash } = await import("node:crypto");
  const { memory } = await import("../../../lib/server/memory");
  const { refreshCollectionsFromDatabase } = await import("../../../lib/server/persistence");

  await refreshCollectionsFromDatabase(["appUsers", "crmPartners", "crmCategories"]);

  const normalized = identifier.trim().toLowerCase();
  const compactPhone = identifier.replace(/\s/g, "");
  const user = memory.appUsers.find(
    (item) => item.status === "active" && (item.identifier === normalized || (item.phone && item.phone.replace(/\s/g, "") === compactPhone)),
  );
  if (!user) return undefined;

  const hash = createHash("sha256").update(`${user.salt}:${password}`).digest("hex");
  if (hash !== user.passwordHash) return undefined;

  // Self-heal mall-hub accounts whose stored shape predates the supplier/partner
  // split: re-derive portal/role/defaultPath from the CRM company's category so a
  // supplier (provides product supply → /mall/supplier) never lands on the
  // Partner service-point page (and vice-versa), even for older accounts.
  let { portal, role, defaultPath } = user;
  if (portal === "supplier" || portal === "partner") {
    const company = memory.crmPartners.find((p) => p.name === user.organization);
    if (company) {
      const { isSupplierCategory } = await import("../../../lib/server/crm-categories");
      const wantSupplier = isSupplierCategory(company.category);
      const wantPortal = wantSupplier ? "supplier" : "partner";
      if (portal !== wantPortal) {
        portal = wantPortal;
        role = wantSupplier ? "Supplier Admin" : "Partner Operator";
        defaultPath = wantSupplier ? "/mall/supplier" : "/partner-points";
        const fix = memory.appUsers.findIndex((item) => item.id === user.id);
        if (fix !== -1) memory.appUsers[fix] = { ...memory.appUsers[fix], portal, role, defaultPath };
      }
    }
  }

  const index = memory.appUsers.findIndex((item) => item.id === user.id);
  if (index !== -1) {
    memory.appUsers[index] = { ...memory.appUsers[index], lastLoginAt: new Date().toISOString().slice(0, 16).replace("T", " ") };
  }

  return {
    id: user.id,
    portal,
    name: user.name,
    role,
    identifier: user.identifier,
    phone: user.phone,
    password: "",
    organization: user.organization,
    tenantId: user.tenantId,
    defaultPath,
    franchise: user.franchise,
    station: user.station,
  } as TestAccount & { franchise?: string; station?: string };
}

async function findSupabaseTestAccount(identifier: string, password: string): Promise<TestAccount | undefined> {
  // Same kill switch as findTestAccount: demo seeds (including the Supabase
  // app_test_accounts mirror) are disabled once real accounts exist.
  if (process.env.MEPONTO_DISABLE_DEMO_LOGIN === "1") {
    return undefined;
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return undefined;
  }

  try {
    const client = getSupabaseServerClient();
    const normalized = identifier.trim().toLowerCase();
    const compactPhone = identifier.replace(/\s/g, "");
    const { data, error } = await client
      .from("app_test_accounts")
      .select("id, portal_id, name, identifier, phone, password_hint, organization, default_path, tenant_id, roles(name)")
      .or(`identifier.eq.${normalized},phone.eq.${compactPhone}`)
      .maybeSingle();

    const row = data as
      | {
          id: string;
          portal_id: string;
          name: string;
          identifier: string;
          phone: string;
          password_hint: string;
          organization: string;
          default_path: string;
          tenant_id?: string | null;
          roles?: { name?: string } | Array<{ name?: string }> | null;
        }
      | null;

    if (error || !row || row.password_hint !== password) return undefined;

    const roleName = Array.isArray(row.roles) ? row.roles[0]?.name : row.roles?.name;
    if (!roleName) return undefined;

    return {
      id: row.id,
      portal: row.portal_id as PortalId,
      role: roleName as Role,
      name: row.name,
      identifier: row.identifier,
      phone: row.phone,
      password: row.password_hint,
      organization: row.organization,
      tenantId: row.tenant_id ?? "tenant-platform",
      defaultPath: row.default_path,
    };
  } catch {
    return undefined;
  }
}

// Serverless safety: flush mutations to the database BEFORE returning —
// the instance may freeze right after the response, losing a debounced flush.
export async function POST(...args: Parameters<typeof postImpl>) {
  const response = await postImpl(...args);
  await flushPendingToDatabase();
  return response;
}
