import { jsonResponse, memory } from "../../lib/server/memory";
import { refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { createSessionToken, sessionCookie } from "../../lib/auth-session";

/**
 * Public MEMBER login by phone, with optional OTP hardening.
 *
 *  - Legacy (no `action`): phone-only login. Kept for back-compat and enabled
 *    unless `MEMBER_LOGIN_OTP=1`, which forces the OTP flow below.
 *  - `request-otp`: issues a one-time code (rate-limited). Delivery is via the
 *    `sendOtp` hook — wire an SMS/WhatsApp provider there for production. In dev
 *    (`OTP_DEV_RETURN=1`) the code is returned in the response for testing.
 *  - `verify-otp`: validates the code and issues the session cookie.
 */

const OTP_REQUIRED = process.env.MEMBER_LOGIN_OTP === "1";
const OTP_DEV_RETURN = process.env.OTP_DEV_RETURN === "1";
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;

type Challenge = { code: string; expiresAt: number; attempts: number; lastSentAt: number };
const otpStore = new Map<string, Challenge>();

const compactPhone = (phone: string) => phone.replace(/\D/g, "");
const findMember = (compact: string) => memory.riders.find((r) => (r.phone ?? "").replace(/\D/g, "") === compact);

async function issueSession(member: { id: string; name: string }, phone: string, request: Request) {
  const token = await createSessionToken({
    userId: member.id,
    name: member.name,
    identifier: phone,
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

/** Delivery hook. Replace the body with a real SMS/WhatsApp provider call. */
async function sendOtp(phone: string, code: string) {
  // eslint-disable-next-line no-console
  console.log(`[member-login] OTP for ${phone}: ${code} (wire an SMS provider in sendOtp)`);
}

export async function POST(request: Request) {
  await refreshCollectionsFromDatabase(["riders"]);
  const body = (await request.json().catch(() => ({}))) as { action?: string; phone?: string; code?: string };
  const action = body.action ?? "";
  const compact = compactPhone(body.phone ?? "");
  if (compact.length < 8) return jsonResponse({ error: "Informe um telefone válido.", code: "invalid_phone" }, { status: 400 });

  // ---- Request OTP --------------------------------------------------------
  if (action === "request-otp") {
    const member = findMember(compact);
    if (!member) return jsonResponse({ error: "Telefone não encontrado. Crie uma conta primeiro.", code: "not_found" }, { status: 404 });
    const now = Date.now();
    const prev = otpStore.get(compact);
    if (prev && now - prev.lastSentAt < OTP_RESEND_MS) {
      return jsonResponse({ error: "Aguarde alguns segundos para reenviar o código.", code: "rate_limited" }, { status: 429 });
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(compact, { code, expiresAt: now + OTP_TTL_MS, attempts: 0, lastSentAt: now });
    await sendOtp(body.phone ?? compact, code);
    return jsonResponse({ data: { sent: true, ...(OTP_DEV_RETURN ? { devCode: code } : {}) } });
  }

  // ---- Verify OTP ---------------------------------------------------------
  if (action === "verify-otp") {
    const challenge = otpStore.get(compact);
    if (!challenge || Date.now() > challenge.expiresAt) {
      otpStore.delete(compact);
      return jsonResponse({ error: "Código expirado. Solicite um novo.", code: "otp_expired" }, { status: 401 });
    }
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      otpStore.delete(compact);
      return jsonResponse({ error: "Muitas tentativas. Solicite um novo código.", code: "rate_limited" }, { status: 429 });
    }
    if (String(body.code ?? "").trim() !== challenge.code) {
      challenge.attempts += 1;
      return jsonResponse({ error: "Código inválido.", code: "otp_invalid" }, { status: 401 });
    }
    otpStore.delete(compact);
    const member = findMember(compact);
    if (!member) return jsonResponse({ error: "Telefone não encontrado.", code: "not_found" }, { status: 404 });
    return issueSession(member, body.phone ?? compact, request);
  }

  // ---- Legacy phone-only login (disabled when OTP is enforced) ------------
  if (OTP_REQUIRED) {
    return jsonResponse({ error: "Verificação por código necessária.", code: "otp_required" }, { status: 403 });
  }
  const member = findMember(compact);
  if (!member) return jsonResponse({ error: "Telefone não encontrado. Crie uma conta primeiro.", code: "not_found" }, { status: 404 });
  return issueSession(member, body.phone ?? compact, request);
}
