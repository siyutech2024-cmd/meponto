import { jsonResponse, memory } from "../../lib/server/memory";
import { refreshCollectionsFromDatabase, flushPendingToDatabase } from "../../lib/server/persistence";
import { createSessionToken, sessionCookie } from "../../lib/auth-session";

/**
 * Public MEMBER login by phone + OTP, anchored to the canonical rider record.
 *
 * Identity model: the rider's identity is the imported rider record (rider.id,
 * keyed by 99 ID / CPF). Phone is a mutable *auth factor*, normalized to BR
 * E.164 (digits with country code 55) so "(11) 9xxxx-xxxx", "11 9xxxx", and
 * "+55 11 9xxxx" all resolve to the same person. Points/wallet/shifts/FCM token
 * stay bound to rider.id — never to the phone string.
 *
 * Flows:
 *  - `request-otp` { phone, cpf? } : send a one-time code. If the phone isn't on
 *    file but a matching CPF is, the code is sent to the NEW phone and, on
 *    verify, that phone is re-bound to the existing rider (no duplicate account,
 *    points preserved).
 *  - `verify-otp` { phone, code }  : validate the code, (re)bind phone, issue the
 *    rider session cookie.
 *  - Legacy (no `action`)          : phone-only login, kept for the native app
 *    until it ships the OTP UI. Disabled when `MEMBER_LOGIN_OTP=1`.
 *
 * SMS delivery: wired to Twilio when TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
 * TWILIO_FROM are set; otherwise the code is logged (and returned when
 * OTP_DEV_RETURN=1) for testing.
 */

const OTP_REQUIRED = process.env.MEMBER_LOGIN_OTP === "1";
const OTP_DEV_RETURN = process.env.OTP_DEV_RETURN === "1";
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;

type Challenge = { code: string; expiresAt: number; attempts: number; lastSentAt: number; rebindRiderId?: string };
const otpStore = new Map<string, Challenge>();

const onlyDigits = (s: string) => s.replace(/\D/g, "");

/** Normalize a BR phone to digits with country code 55 (E.164 without the +). */
function normalizeBR(raw: string): string {
  const d = onlyDigits(raw);
  if (d.startsWith("55") && d.length >= 12) return d; // already has country code
  if (d.length === 10 || d.length === 11) return "55" + d; // local DDD + number
  return d; // unknown shape — leave as-is
}

const findMemberByPhone = (raw: string) => {
  const want = normalizeBR(raw);
  return memory.riders.find((r) => normalizeBR(r.phone ?? "") === want);
};
const findMemberByCpf = (rawCpf: string) => {
  const want = onlyDigits(rawCpf);
  if (want.length !== 11) return undefined;
  return memory.riders.find((r) => onlyDigits(r.cpf ?? "") === want);
};

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

/** SMS delivery — Twilio when configured, otherwise dev log. Never throws. */
async function sendOtp(phone: string, code: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const text = `MePonto: seu código de acesso é ${code}. Válido por 5 minutos.`;
  if (sid && token && from) {
    try {
      const to = `+${normalizeBR(phone)}`;
      const params = new URLSearchParams({ To: to, From: from, Body: text });
      const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      });
      if (!resp.ok) console.warn(`[member-login] SMS send failed (${resp.status})`);
    } catch (err) {
      console.warn("[member-login] SMS send error", err);
    }
    return;
  }
  console.log(`[member-login] OTP for ${phone}: ${code} (set TWILIO_* env to send real SMS)`);
}

export async function POST(request: Request) {
  await refreshCollectionsFromDatabase(["riders"]);
  const body = (await request.json().catch(() => ({}))) as { action?: string; phone?: string; code?: string; cpf?: string };
  const action = body.action ?? "";
  const phoneRaw = body.phone ?? "";
  const normalized = normalizeBR(phoneRaw);
  if (normalized.length < 10) return jsonResponse({ error: "Informe um telefone válido.", code: "invalid_phone" }, { status: 400 });

  // Play review / demo login: a fixed phone + code that bypasses SMS so app-store
  // reviewers (and demos) can sign in. Off unless PLAY_DEMO_PHONE + PLAY_DEMO_CODE
  // are set. Point PLAY_DEMO_PHONE at a dedicated TEST rider (no real data).
  const demoPhone = process.env.PLAY_DEMO_PHONE;
  const demoCode = process.env.PLAY_DEMO_CODE;
  const isDemo = !!demoPhone && !!demoCode && normalized === normalizeBR(demoPhone);

  // ---- Request OTP --------------------------------------------------------
  if (action === "request-otp") {
    // Demo/review phone: pretend a code was sent (verify uses the fixed code).
    if (isDemo) return jsonResponse({ data: { sent: true, rebind: false } });
    let member = findMemberByPhone(phoneRaw);
    let rebindRiderId: string | undefined;
    if (!member && body.cpf) {
      // Phone changed: anchor on CPF and re-bind this new phone on verify.
      member = findMemberByCpf(body.cpf);
      if (member) rebindRiderId = member.id;
    }
    if (!member) {
      if (!body.cpf) {
        // Not an error — ask the client to confirm CPF to (re)bind this phone.
        return jsonResponse({ data: { sent: false, needsCpf: true } });
      }
      return jsonResponse({ error: "CPF não encontrado no cadastro.", code: "cpf_not_found" }, { status: 404 });
    }
    const now = Date.now();
    const prev = otpStore.get(normalized);
    if (prev && now - prev.lastSentAt < OTP_RESEND_MS) {
      return jsonResponse({ error: "Aguarde alguns segundos para reenviar o código.", code: "rate_limited" }, { status: 429 });
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(normalized, { code, expiresAt: now + OTP_TTL_MS, attempts: 0, lastSentAt: now, rebindRiderId });
    await sendOtp(phoneRaw, code);
    return jsonResponse({ data: { sent: true, rebind: !!rebindRiderId, ...(OTP_DEV_RETURN ? { devCode: code } : {}) } });
  }

  // ---- Verify OTP ---------------------------------------------------------
  if (action === "verify-otp") {
    // Demo/review login: fixed code, no SMS challenge.
    if (isDemo && String(body.code ?? "").trim() === demoCode) {
      const member = findMemberByPhone(phoneRaw);
      if (member) return issueSession(member, phoneRaw, request);
      return jsonResponse({ error: "Cadastro de demonstração não encontrado.", code: "not_found" }, { status: 404 });
    }
    const challenge = otpStore.get(normalized);
    if (!challenge || Date.now() > challenge.expiresAt) {
      otpStore.delete(normalized);
      return jsonResponse({ error: "Código expirado. Solicite um novo.", code: "otp_expired" }, { status: 401 });
    }
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      otpStore.delete(normalized);
      return jsonResponse({ error: "Muitas tentativas. Solicite um novo código.", code: "rate_limited" }, { status: 429 });
    }
    if (String(body.code ?? "").trim() !== challenge.code) {
      challenge.attempts += 1;
      return jsonResponse({ error: "Código inválido.", code: "otp_invalid" }, { status: 401 });
    }
    otpStore.delete(normalized);

    let member = findMemberByPhone(phoneRaw);
    if (!member && challenge.rebindRiderId) {
      // Re-bind the verified phone to the CPF-matched rider (keeps rider.id +
      // all points/wallet). Store the normalized phone for stable future logins.
      const idx = memory.riders.findIndex((r) => r.id === challenge.rebindRiderId);
      if (idx !== -1) {
        memory.riders[idx] = { ...memory.riders[idx], phone: normalized };
        member = memory.riders[idx];
        await flushPendingToDatabase();
      }
    }
    if (!member) return jsonResponse({ error: "Cadastro não encontrado.", code: "not_found" }, { status: 404 });
    return issueSession(member, phoneRaw, request);
  }

  // ---- Legacy phone-only login (disabled when OTP is enforced) ------------
  if (OTP_REQUIRED) {
    return jsonResponse({ error: "Verificação por código necessária.", code: "otp_required" }, { status: 403 });
  }
  const member = findMemberByPhone(phoneRaw);
  if (!member) return jsonResponse({ error: "Telefone não encontrado. Crie uma conta primeiro.", code: "not_found" }, { status: 404 });
  return issueSession(member, phoneRaw, request);
}
