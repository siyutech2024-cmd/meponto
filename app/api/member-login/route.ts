import { jsonResponse, memory, makeServerId, appendServerAudit } from "../../lib/server/memory";
import { refreshCollectionsFromDatabase, flushPendingToDatabase } from "../../lib/server/persistence";
import { createSessionToken, sessionCookie, sessionFromRequest } from "../../lib/auth-session";
import { getOtpChallenge, setOtpChallenge, deleteOtpChallenge, type OtpSignupData } from "../../lib/server/otp-store";
import { getAvailablePoints, type PointsLedgerEntry } from "../../lib/points";
import { defaultMallConfig } from "../../lib/mall";
import type { Rider } from "../../lib/data";
import { createHmac } from "node:crypto";

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
 * SMS delivery (pluggable, selected by SMS_PROVIDER or auto-detected):
 *  - `aliyun`: Alibaba Cloud international SMS (SendMessageToGlobe, free-form
 *    message — no template review) when ALIYUN_SMS_ACCESS_KEY_ID /
 *    ALIYUN_SMS_ACCESS_KEY_SECRET are set; ALIYUN_SMS_SENDER_ID optional.
 *  - `twilio`: kept as fallback when TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
 *    TWILIO_FROM are set.
 *  - Neither configured: the code is logged (and returned when
 *    OTP_DEV_RETURN=1) for testing.
 */

const OTP_REQUIRED = process.env.MEMBER_LOGIN_OTP === "1";
const OTP_DEV_RETURN = process.env.OTP_DEV_RETURN === "1";
/**
 * Progressive Google login: a Google sign-in that isn't linked to a rider yet
 * enters PontoMall immediately as an unverified *guest* (no record created),
 * instead of forcing phone+CPF up front. Sensitive actions (points, wallet,
 * rider features) still require verification — enforced centrally in
 * `middleware.ts` — which then links the Google identity to the rider record.
 * Default ON; set GOOGLE_LITE_LOGIN=0 to restore the "link first" behaviour.
 */
const GOOGLE_LITE_LOGIN = process.env.GOOGLE_LITE_LOGIN !== "0";
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;
/** Per-phone daily SMS budget (anti SMS-pumping — real users never hit this). */
const OTP_DAILY_LIMIT = 8;
const OTP_WINDOW_MS = 24 * 60 * 60 * 1000;

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

/**
 * Build a fresh public member (会员一级, no 99 ID) — mirrors /api/register's
 * defaults. Used by the progressive-login activation so a brand-new Google user
 * (not an imported rider) becomes a real member from their Google identity + a
 * phone, no CPF/SMS required. Binding a 99 ID later promotes them to 会员二级.
 */
function newMember(fields: { name: string; phone: string; cpf?: string; googleSub?: string }): Rider {
  return {
    id: makeServerId("r", memory.riders.length + 1),
    name: fields.name,
    cpf: fields.cpf ?? "",
    phone: fields.phone,
    pix: "",
    bairro: "",
    ponto: "Unassigned",
    leader: "Unassigned",
    invitedBy: "Google sign-in",
    chatRoom: "PontoMall",
    ar: 100,
    status: "Active",
    vehicleType: "—",
    brand: "—",
    model: "—",
    rentalStatus: "—",
    isMottu: false,
    onlineHours: 0,
    nightShiftCount: 0,
    incidentCount: 0,
    joinDate: new Date().toISOString().slice(0, 10),
    ninetyNineId: "",
    franchise: "Unassigned",
    birthday: "",
    googleSub: fields.googleSub,
  };
}

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
  const response = jsonResponse({ data: { id: member.id, name: member.name, role: "Rider", portal: "rider", organization: "" } });
  response.headers.append("Set-Cookie", sessionCookie(token, request.headers.get("host")));
  return response;
}

/**
 * Progressive Google login: issue an *unverified guest* session (no rider record
 * created). Lets the person browse PontoMall right away; the Google identity is
 * carried in the session and linked to the rider record once they verify phone +
 * CPF. `verified:false` flags every sensitive action to require verification.
 */
async function issueGuestSession(google: { sub: string; email: string; name: string }, request: Request) {
  const token = await createSessionToken({
    userId: `guest-google-${google.sub}`,
    name: google.name,
    identifier: google.email,
    role: "Rider",
    portal: "rider",
    tenantId: "meponto",
    organization: "",
    defaultPath: "/store",
    verified: false,
    email: google.email,
    googleSub: google.sub,
  });
  const response = jsonResponse({ data: { name: google.name, role: "Rider", portal: "rider", organization: "", verified: false, needsVerification: true } });
  response.headers.append("Set-Cookie", sessionCookie(token, request.headers.get("host")));
  return response;
}

// ---- SMS delivery (pluggable: aliyun | twilio | dev log). Never throws. ----

/** RFC 3986 percent-encoding as required by Alibaba Cloud's RPC signature. */
function aliyunEncode(s: string): string {
  return encodeURIComponent(s).replace(/\*/g, "%2A").replace(/%7E/g, "~");
}

/**
 * Alibaba Cloud international SMS (国际/港澳台短信, Singapore endpoint):
 * SendMessageToGlobe — free-form message, no signature/template review needed.
 * Docs: https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2018-05-01-sendmessagetoglobe
 */
async function sendViaAliyun(phone: string, code: string): Promise<boolean> {
  const accessKeyId = process.env.ALIYUN_SMS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_SMS_ACCESS_KEY_SECRET;
  if (!accessKeyId || !accessKeySecret) return false;
  try {
    const params: Record<string, string> = {
      AccessKeyId: accessKeyId,
      Action: "SendMessageToGlobe",
      Format: "JSON",
      Message: `MePonto: seu código de acesso é ${code}. Válido por 5 minutos.`,
      SignatureMethod: "HMAC-SHA1",
      SignatureNonce: crypto.randomUUID(),
      SignatureVersion: "1.0",
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      // International number: country code + number, digits only (no +).
      To: normalizeBR(phone),
      Type: "OTP",
      Version: "2018-05-01",
    };
    // Optional alphanumeric Sender ID (register in 国际/港澳台短信 → SenderID first).
    const senderId = process.env.ALIYUN_SMS_SENDER_ID;
    if (senderId) params.From = senderId;
    const query = Object.keys(params)
      .sort()
      .map((k) => `${aliyunEncode(k)}=${aliyunEncode(params[k])}`)
      .join("&");
    const stringToSign = `POST&%2F&${aliyunEncode(query)}`;
    const signature = createHmac("sha1", `${accessKeySecret}&`).update(stringToSign).digest("base64");
    const resp = await fetch("https://dysmsapi.ap-southeast-1.aliyuncs.com/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `Signature=${aliyunEncode(signature)}&${query}`,
    });
    const data = (await resp.json().catch(() => ({}))) as { ResponseCode?: string; ResponseDescription?: string };
    if (data.ResponseCode !== "OK") {
      console.warn(`[member-login] Aliyun SMS failed: ${data.ResponseCode ?? resp.status} ${data.ResponseDescription ?? ""}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[member-login] Aliyun SMS error", err);
    return false;
  }
}

/** Twilio SMS: free-text message, kept as fallback provider. */
async function sendViaTwilio(phone: string, code: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) return false;
  const text = `MePonto: seu código de acesso é ${code}. Válido por 5 minutos.`;
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
    if (!resp.ok) {
      console.warn(`[member-login] Twilio SMS failed (${resp.status})`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[member-login] Twilio SMS error", err);
    return false;
  }
}

/**
 * Send the OTP via the configured provider. SMS_PROVIDER=aliyun|twilio forces
 * one; otherwise auto-detect (aliyun first, then twilio). If the primary
 * provider fails, the other is tried as fallback. Never throws.
 * Returns "sent" (real SMS out), "dev" (no provider configured — logged only),
 * or "failed" (providers configured but delivery failed) so the API can tell
 * the user instead of silently claiming the code was sent.
 */
async function sendOtp(phone: string, code: string): Promise<"sent" | "dev" | "failed"> {
  const aliyunConfigured = !!process.env.ALIYUN_SMS_ACCESS_KEY_ID && !!process.env.ALIYUN_SMS_ACCESS_KEY_SECRET;
  const twilioConfigured = !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_FROM;
  if (!aliyunConfigured && !twilioConfigured) {
    console.log(`[member-login] OTP for ${phone}: ${code} (set ALIYUN_SMS_* or TWILIO_* env to send real SMS)`);
    return "dev";
  }
  const forced = process.env.SMS_PROVIDER;
  const order = forced === "twilio" ? [sendViaTwilio, sendViaAliyun] : [sendViaAliyun, sendViaTwilio];
  for (const send of order) {
    if (await send(phone, code)) return "sent";
  }
  return "failed";
}

// ---- Sign in with Google (rider identity, not a separate account) ----
type GoogleClaims = { aud?: string; email?: string; email_verified?: string | boolean; sub?: string; exp?: string; name?: string; given_name?: string };

/** Verify a Google ID token against Google. Returns {sub,email,name} or null. */
async function verifyGoogleToken(credential: string): Promise<{ sub: string; email: string; name: string } | null> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId || !credential) return null;
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!res.ok) return null;
    const c = (await res.json()) as GoogleClaims;
    if (c.aud !== clientId || !c.sub) return null;
    if (c.exp && Number(c.exp) * 1000 < Date.now()) return null;
    const email = (c.email ?? "").trim().toLowerCase();
    return { sub: c.sub, email, name: (c.name || c.given_name || email.split("@")[0] || "Membro").trim() };
  } catch {
    return null;
  }
}

/** On a successful phone/OTP login, bind the Google account to this rider. */
async function linkGoogleIfPresent(riderId: string, googleCredential?: string) {
  if (!googleCredential) return;
  const g = await verifyGoogleToken(googleCredential);
  if (!g) return;
  const idx = memory.riders.findIndex((r) => r.id === riderId);
  if (idx !== -1 && memory.riders[idx].googleSub !== g.sub) {
    memory.riders[idx] = { ...memory.riders[idx], googleSub: g.sub };
    await flushPendingToDatabase();
  }
}

/**
 * Progressive login: link the Google identity carried in the guest session to
 * the verified rider record (no duplicate account — the same rider.id keeps all
 * points/wallet). Called on verify-otp so a guest who entered via Google and
 * later confirms phone+CPF gets their Google permanently bound to their rider.
 */
async function linkGoogleSubIfPresent(riderId: string, sub?: string) {
  if (!sub) return;
  const idx = memory.riders.findIndex((r) => r.id === riderId);
  if (idx !== -1 && memory.riders[idx].googleSub !== sub) {
    memory.riders[idx] = { ...memory.riders[idx], googleSub: sub };
    await flushPendingToDatabase();
  }
}

/**
 * Create a member from a verified phone-first signup (see request-otp) and
 * credit the inviter's referral points. Referral is paid HERE — after SMS
 * verification — never on the unverified /api/register call, so fake numbers
 * can't farm points.
 */
async function createVerifiedMember(signup: OtpSignupData, normalizedPhone: string): Promise<Rider> {
  await refreshCollectionsFromDatabase(["pointsLedgerEntries", "mallConfigs"]);
  const created = newMember({ name: signup.name, phone: normalizedPhone, cpf: signup.cpf, googleSub: signup.googleSub });
  created.invitedBy = signup.inviterId ? `member:${signup.inviterId}` : "Self-registration";
  if (signup.birthday) created.birthday = signup.birthday;
  memory.riders.unshift(created);
  appendServerAudit({ actor: "Self-registration", action: "MEMBER_REGISTERED", entity: "Rider", entityId: created.id, detail: `${created.name} (membro público, telefone verificado)`, risk: "Low" });

  const inviter = signup.inviterId ? memory.riders.find((r) => r.id === signup.inviterId) : undefined;
  if (inviter && inviter.id !== created.id) {
    const config = memory.mallConfigs.find((c) => c.id === "mall-config") ?? defaultMallConfig;
    const points = config.referralPoints || 20;
    const available = getAvailablePoints(memory.pointsLedgerEntries, inviter.id);
    const entry: PointsLedgerEntry = {
      id: makeServerId("pts", memory.pointsLedgerEntries.length + 1),
      riderId: inviter.id,
      accountId: `pts-${inviter.id}`,
      type: "earn",
      points,
      status: "approved",
      sourceType: "admin_adjustment",
      sourceId: `ref-${created.id}`,
      balanceAfter: available + points,
      reasonCode: "REFERRAL_REWARD",
      note: `Convidou ${created.name} para o PontoMall`,
      createdBy: "PontoMall",
      createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    };
    memory.pointsLedgerEntries.unshift(entry);
  }
  await flushPendingToDatabase();
  return created;
}

export async function POST(request: Request) {
  await refreshCollectionsFromDatabase(["riders"]);
  const body = (await request.json().catch(() => ({}))) as {
    action?: string; phone?: string; code?: string; cpf?: string; credential?: string; googleCredential?: string;
  };
  const action = body.action ?? "";

  // ---- Sign in with Google: linked → straight in; unlinked → ask to link. ----
  if (action === "google") {
    const g = await verifyGoogleToken(body.credential ?? "");
    if (!g) return jsonResponse({ error: "Não foi possível validar com o Google.", code: "google_invalid" }, { status: 401 });
    const member = memory.riders.find((r) => !!r.googleSub && r.googleSub === g.sub);
    if (member) return issueSession(member, member.phone ?? "", request);
    // Progressive login: enter PontoMall now as an unverified guest; verify phone
    // + CPF later (which links this Google identity to the rider record).
    if (GOOGLE_LITE_LOGIN) return issueGuestSession(g, request);
    // Default: client collects CPF + phone OTP, then verify-otp with googleCredential.
    return jsonResponse({ data: { needsLink: true, email: g.email } });
  }

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

    // ---- Google guest activation ---------------------------------------------
    // A signed-in Google guest (verified:false) entering a NEW phone (no rider
    // record) becomes a member straight away — Google already authenticated
    // them and there is no existing account (points/wallet) at stake.
    // Claiming an EXISTING record now always goes through the SMS challenge
    // below (CPF alone is a weak factor — widely leaked in Brazil); the guest's
    // googleSub is linked on verify-otp via the session.
    const guest = await sessionFromRequest(request);
    if (guest?.verified === false && guest.googleSub) {
      const existing = findMemberByPhone(phoneRaw) ?? (body.cpf ? findMemberByCpf(body.cpf) : undefined);
      if (!existing) {
        const created = newMember({ name: guest.name || guest.email?.split("@")[0] || "Membro", phone: phoneRaw, cpf: onlyDigits(body.cpf ?? ""), googleSub: guest.googleSub });
        memory.riders.unshift(created);
        appendServerAudit({ actor: "Google", action: "MEMBER_REGISTERED", entity: "Rider", entityId: created.id, detail: `${created.name} (Google sign-in, sem 99 ID)`, risk: "Low" });
        await flushPendingToDatabase();
        return issueSession(created, phoneRaw, request);
      }
      // fall through: existing record → SMS OTP (rebind if matched by CPF)
    }

    // Phone-first signup: registration data rides with the challenge and the
    // member record is only created on verify (verified phone — no squatting,
    // and referral points can't be farmed with fake numbers).
    const signupRaw = (body as { signup?: { name?: string; cpf?: string; inviterId?: string; birthday?: string } }).signup;
    const signupName = (signupRaw?.name ?? "").trim();

    let member = findMemberByPhone(phoneRaw);
    let rebindRiderId: string | undefined;
    let signupData: OtpSignupData | undefined;
    if (!member && body.cpf) {
      // Phone changed: anchor on CPF and re-bind this new phone on verify.
      member = findMemberByCpf(body.cpf);
      if (member) rebindRiderId = member.id;
    }
    if (!member) {
      if (signupName) {
        signupData = {
          name: signupName,
          cpf: onlyDigits(signupRaw?.cpf ?? "") || undefined,
          inviterId: (signupRaw?.inviterId ?? "").trim() || undefined,
          birthday: /^\d{4}-\d{2}-\d{2}$/.test((signupRaw?.birthday ?? "").trim()) ? (signupRaw?.birthday ?? "").trim() : undefined,
          googleSub: guest?.verified === false ? guest.googleSub : undefined,
        };
      } else if (!body.cpf) {
        // Not an error — the client offers: create an account (signup) or link
        // this phone to an existing record by confirming the CPF.
        return jsonResponse({ data: { sent: false, needsCpf: true } });
      } else {
        return jsonResponse({ error: "CPF não encontrado no cadastro.", code: "cpf_not_found" }, { status: 404 });
      }
    }

    const now = Date.now();
    const prev = await getOtpChallenge(normalized);
    if (prev && now - prev.lastSentAt < OTP_RESEND_MS) {
      return jsonResponse({ error: "Aguarde alguns segundos para reenviar o código.", code: "rate_limited" }, { status: 429 });
    }
    // Rolling daily SMS budget per phone.
    let sendCount = 0;
    let windowStart = now;
    if (prev && now - prev.windowStart < OTP_WINDOW_MS) {
      sendCount = prev.sendCount;
      windowStart = prev.windowStart;
    }
    if (sendCount >= OTP_DAILY_LIMIT) {
      return jsonResponse({ error: "Limite diário de códigos atingido. Tente novamente amanhã.", code: "rate_limited" }, { status: 429 });
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const delivery = await sendOtp(phoneRaw, code);
    if (delivery === "failed") {
      return jsonResponse({ error: "Não foi possível enviar o SMS agora. Tente novamente em instantes.", code: "sms_failed" }, { status: 502 });
    }
    await setOtpChallenge(normalized, {
      code,
      expiresAt: now + OTP_TTL_MS,
      attempts: 0,
      lastSentAt: now,
      rebindRiderId,
      signupData,
      sendCount: sendCount + (delivery === "sent" ? 1 : 0),
      windowStart,
    });
    return jsonResponse({ data: { sent: true, rebind: !!rebindRiderId, signup: !!signupData, ...(OTP_DEV_RETURN ? { devCode: code } : {}) } });
  }

  // ---- Verify OTP ---------------------------------------------------------
  if (action === "verify-otp") {
    // Demo/review login: fixed code, no SMS challenge.
    if (isDemo && String(body.code ?? "").trim() === demoCode) {
      const member = findMemberByPhone(phoneRaw);
      if (member) {
        await linkGoogleIfPresent(member.id, body.googleCredential);
        return issueSession(member, phoneRaw, request);
      }
      return jsonResponse({ error: "Cadastro de demonstração não encontrado.", code: "not_found" }, { status: 404 });
    }
    const challenge = await getOtpChallenge(normalized);
    if (!challenge || Date.now() > challenge.expiresAt) {
      await deleteOtpChallenge(normalized);
      return jsonResponse({ error: "Código expirado. Solicite um novo.", code: "otp_expired" }, { status: 401 });
    }
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      await deleteOtpChallenge(normalized);
      return jsonResponse({ error: "Muitas tentativas. Solicite um novo código.", code: "rate_limited" }, { status: 429 });
    }
    if (String(body.code ?? "").trim() !== challenge.code) {
      await setOtpChallenge(normalized, { ...challenge, attempts: challenge.attempts + 1 });
      return jsonResponse({ error: "Código inválido.", code: "otp_invalid" }, { status: 401 });
    }
    await deleteOtpChallenge(normalized);

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
    if (!member && challenge.signupData) {
      // Phone-first signup: the phone is verified — create the member now and
      // pay the inviter's referral points (only ever on a verified signup).
      member = await createVerifiedMember(challenge.signupData, normalized);
    }
    if (!member) return jsonResponse({ error: "Cadastro não encontrado.", code: "not_found" }, { status: 404 });
    await linkGoogleIfPresent(member.id, body.googleCredential);
    // Progressive login: if a Google *guest* is verifying, bind that Google
    // identity (carried in the guest session) to this rider record now.
    const guest = await sessionFromRequest(request);
    await linkGoogleSubIfPresent(member.id, guest?.googleSub);
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
