import { randomBytes } from "node:crypto";
import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../../lib/server/persistence";
import { hashPassword } from "../../../lib/server/password";

const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Rider self-registration (public). Creates the rider profile + a login
 * account in one step, so the app has a complete signup → login → home flow.
 */
async function handlePost(request: Request) {
  await refreshCollectionsFromDatabase(["riders", "appUsers", "pontos"]);
  const body = (await request.json().catch(() => ({}))) as Record<string, string>;
  const { name = "", phone = "", email = "", password = "", birthday = "", pix = "", cpf = "", station = "", website = "" } = body;

  if (website) return jsonResponse({ data: { ok: true } }); // honeypot
  if (!name.trim() || name.trim().length < 5) return jsonResponse({ error: "Informe seu nome completo." }, { status: 400 });
  if (!phone.trim() || phone.replace(/\D/g, "").length < 10) return jsonResponse({ error: "Informe um telefone válido com DDD." }, { status: 400 });
  if (!password || password.length < 6) return jsonResponse({ error: "A senha precisa de pelo menos 6 caracteres." }, { status: 400 });

  const identifier = (email.trim() || phone.replace(/\s/g, "")).toLowerCase();
  if (memory.appUsers.some((u) => u.identifier === identifier)) {
    return jsonResponse({ error: "Já existe uma conta com este e-mail/telefone. Faça login." }, { status: 409 });
  }
  const fullName = name.trim().toUpperCase().slice(0, 80);
  if (memory.riders.some((r) => r.name === fullName)) {
    return jsonResponse({ error: "Já existe um cadastro com este nome. Fale com a estação ou faça login." }, { status: 409 });
  }

  // Rider profile (membership starts at registration; tier rises with Eastwind data).
  const rider = {
    id: makeServerId("r", memory.riders.length + 1001),
    name: fullName,
    phone: phone.trim().slice(0, 30),
    cpf: cpf.trim().slice(0, 20),
    pix: (pix.trim() || cpf.trim()).slice(0, 80),
    birthday: birthday.slice(0, 10),
    ponto: station.trim().slice(0, 60) || "Unassigned",
    franchise: "Autoinscrição",
    status: "Active",
    registeredAt: today(),
    ninetyNineId: "",
    invitedBy: String(body.inviteCode ?? "").slice(0, 40),
  } as unknown as (typeof memory.riders)[number];
  memory.riders.unshift(rider);

  // Login account.
  const salt = randomBytes(8).toString("hex");
  const account = {
    id: makeServerId("u", memory.appUsers.length + 1),
    name: fullName,
    identifier,
    phone: phone.trim(),
    salt,
    passwordHash: hashPassword(salt, password),
    role: "Rider" as const,
    portal: "rider" as const,
    organization: station.trim() || "MePonto",
    tenantId: "rider-self",
    defaultPath: "/rider-app",
    status: "Active" as const,
    createdAt: nowStamp(),
  } as unknown as (typeof memory.appUsers)[number];
  memory.appUsers.unshift(account);

  appendServerAudit({
    actor: "public",
    action: "RIDER_SELF_REGISTERED",
    entity: "Rider",
    entityId: rider.id,
    detail: `${fullName} (${identifier}) station ${rider.ponto}${body.inviteCode ? `, invited by ${body.inviteCode}` : ""}.`,
    risk: "Low",
  });

  return jsonResponse(
    {
      data: {
        user: { name: fullName, role: "Rider", portal: "rider", organization: account.organization, identifier, defaultPath: "/rider-app", station: rider.ponto, franchise: rider.franchise },
      },
    },
    { status: 201 },
  );
}

export async function POST(request: Request) {
  const response = await handlePost(request);
  await flushPendingToDatabase();
  return response;
}
