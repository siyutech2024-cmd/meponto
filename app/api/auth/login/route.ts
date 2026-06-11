import { jsonResponse } from "../../../lib/server/memory";
import { findTestAccount, portalConfigs, type PortalId, type TestAccount } from "../../../lib/portals";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import type { Role } from "../../../lib/rbac";
import { createSessionToken, sessionCookie } from "../../../lib/auth-session";

type LoginBody = {
  identifier?: string;
  phone?: string;
  password?: string;
  portal?: PortalId;
};

export async function POST(request: Request) {
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

  if (body.portal && account.portal !== body.portal) {
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

  await refreshCollectionsFromDatabase(["appUsers"]);

  const normalized = identifier.trim().toLowerCase();
  const compactPhone = identifier.replace(/\s/g, "");
  const user = memory.appUsers.find(
    (item) => item.status === "active" && (item.identifier === normalized || (item.phone && item.phone.replace(/\s/g, "") === compactPhone)),
  );
  if (!user) return undefined;

  const hash = createHash("sha256").update(`${user.salt}:${password}`).digest("hex");
  if (hash !== user.passwordHash) return undefined;

  const index = memory.appUsers.findIndex((item) => item.id === user.id);
  if (index !== -1) {
    memory.appUsers[index] = { ...memory.appUsers[index], lastLoginAt: new Date().toISOString().slice(0, 16).replace("T", " ") };
  }

  return {
    id: user.id,
    portal: user.portal,
    name: user.name,
    role: user.role,
    identifier: user.identifier,
    phone: user.phone,
    password: "",
    organization: user.organization,
    tenantId: user.tenantId,
    defaultPath: user.defaultPath,
    franchise: user.franchise,
    station: user.station,
  } as TestAccount & { franchise?: string; station?: string };
}

async function findSupabaseTestAccount(identifier: string, password: string): Promise<TestAccount | undefined> {
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
