import { jsonResponse, memory } from "../../lib/server/memory";
import { refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { createSessionToken, sessionCookie } from "../../lib/auth-session";

/**
 * Public MEMBER login by phone. Lets a registered 公开用户 sign back in to the
 * storefront to redeem with their points. Phone-only (no password) — matches
 * the demo-level auth posture; upgrade to OTP when an SMS/WhatsApp API exists.
 */
export async function POST(request: Request) {
  await refreshCollectionsFromDatabase(["riders"]);
  const body = (await request.json().catch(() => ({}))) as { phone?: string };
  const compact = (body.phone ?? "").replace(/\D/g, "");
  if (compact.length < 8) return jsonResponse({ error: "Informe um telefone válido." }, { status: 400 });

  const member = memory.riders.find((r) => (r.phone ?? "").replace(/\D/g, "") === compact);
  if (!member) return jsonResponse({ error: "Telefone não encontrado. Crie uma conta primeiro." }, { status: 404 });

  const token = await createSessionToken({
    userId: member.id,
    name: member.name,
    identifier: body.phone ?? compact,
    role: "Rider",
    portal: "rider",
    tenantId: "meponto",
    organization: "",
    defaultPath: "/store",
  });

  const response = jsonResponse({ data: { name: member.name, role: "Rider", portal: "rider", organization: "" } });
  response.headers.append("Set-Cookie", sessionCookie(token, request.headers.get("host")));
  return response;
}
