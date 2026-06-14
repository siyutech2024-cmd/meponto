import { randomBytes } from "node:crypto";
import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../../lib/server/persistence";
import { hashPassword } from "../../../lib/server/password";
import { createSessionToken, sessionCookie } from "../../../lib/auth-session";
import { portalConfigs } from "../../../lib/portals";

/**
 * Sign in with Google (rider). Verifies the Google ID token, then finds the
 * matching rider login account by e-mail — or creates a fresh rider profile +
 * account on first sign-in — and issues the same signed session cookie used by
 * password login. Activated only when NEXT_PUBLIC_GOOGLE_CLIENT_ID is set; no
 * client secret is required (the ID token is verified against Google directly).
 */

const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");
const today = () => new Date().toISOString().slice(0, 10);

type GoogleClaims = { aud?: string; email?: string; email_verified?: string | boolean; name?: string; exp?: string; sub?: string };

async function handlePost(request: Request) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) return jsonResponse({ error: "Login com Google não está configurado." }, { status: 503 });

  const { credential = "" } = (await request.json().catch(() => ({}))) as { credential?: string };
  if (!credential) return jsonResponse({ error: "Credencial do Google ausente." }, { status: 400 });

  // Verify the ID token with Google (validates the signature and returns claims).
  let claims: GoogleClaims;
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!res.ok) return jsonResponse({ error: "Token do Google inválido." }, { status: 401 });
    claims = (await res.json()) as GoogleClaims;
  } catch {
    return jsonResponse({ error: "Não foi possível validar com o Google." }, { status: 502 });
  }

  if (claims.aud !== clientId) return jsonResponse({ error: "Token não pertence a este app." }, { status: 401 });
  if (claims.exp && Number(claims.exp) * 1000 < Date.now()) return jsonResponse({ error: "Token do Google expirado." }, { status: 401 });
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";
  const email = (claims.email ?? "").trim().toLowerCase();
  if (!email || !emailVerified) return jsonResponse({ error: "E-mail do Google não verificado." }, { status: 401 });

  await refreshCollectionsFromDatabase(["riders", "appUsers"]);

  let account = memory.appUsers.find((u) => u.identifier === email);
  if (!account) {
    const fullName = (claims.name?.trim() || email.split("@")[0]).toUpperCase().slice(0, 80);
    const rider = {
      id: makeServerId("r", memory.riders.length + 1001),
      name: fullName,
      phone: "",
      cpf: "",
      pix: "",
      birthday: "",
      ponto: "Unassigned",
      franchise: "Autoinscrição",
      status: "Active",
      registeredAt: today(),
      ninetyNineId: "",
      invitedBy: "",
    } as unknown as (typeof memory.riders)[number];
    memory.riders.unshift(rider);

    // No password — Google is the credential. A random hash keeps the account
    // shape valid while disabling password login until the rider sets one.
    const salt = randomBytes(8).toString("hex");
    account = {
      id: makeServerId("u", memory.appUsers.length + 1),
      name: fullName,
      identifier: email,
      phone: "",
      salt,
      passwordHash: hashPassword(salt, randomBytes(16).toString("hex")),
      role: "Rider" as const,
      portal: "rider" as const,
      organization: "MePonto",
      tenantId: "rider-self",
      defaultPath: "/rider-app",
      franchise: "",
      station: "",
      status: "active" as const,
      createdAt: nowStamp(),
    } as unknown as (typeof memory.appUsers)[number];
    memory.appUsers.unshift(account);

    appendServerAudit({ actor: "public", action: "RIDER_GOOGLE_SIGNUP", entity: "Rider", entityId: rider.id, detail: `${fullName} (${email}) via Google.`, risk: "Low" });
    await flushPendingToDatabase();
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
    franchise: account.franchise ?? "",
    station: account.station ?? "",
  });

  const response = jsonResponse({
    status: "authenticated",
    user: {
      id: account.id,
      name: account.name,
      identifier: account.identifier,
      role: account.role,
      portal: account.portal,
      organization: account.organization,
      defaultPath: account.defaultPath,
      portalName: portalConfigs[account.portal].productName,
      franchise: account.franchise ?? "",
      station: account.station ?? "",
    },
  });
  response.headers.append("Set-Cookie", sessionCookie(token, request.headers.get("host")));
  return response;
}

export async function POST(request: Request) {
  return handlePost(request);
}
