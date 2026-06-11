import type { PortalId } from "./portals";
import type { Role } from "./rbac";

export const SESSION_COOKIE = "meponto_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type AuthSession = {
  userId: string;
  name: string;
  identifier: string;
  role: Role;
  portal: PortalId;
  tenantId: string;
  organization: string;
  defaultPath: string;
  expiresAt: number;
};

export async function createSessionToken(session: Omit<AuthSession, "expiresAt">) {
  const payload: AuthSession = {
    ...session,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await sign(encoded);
  return `${encoded}.${signature}`;
}

export async function verifySessionToken(token: string | undefined): Promise<AuthSession | null> {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = await sign(encoded);
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as AuthSession;
    if (!payload.userId || !payload.portal || !payload.role || payload.expiresAt <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** Share the session across all *.meponto.com hosts (app/mall/sys/...). */
function cookieDomain(host?: string | null) {
  const clean = (host ?? "").split(":")[0].toLowerCase();
  return clean === "meponto.com" || clean.endsWith(".meponto.com") ? "; Domain=.meponto.com" : "";
}

export function sessionCookie(token: string, host?: string | null) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}${cookieDomain(host)}`;
}

export function clearSessionCookie(host?: string | null) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}${cookieDomain(host)}`;
}

export function cookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return undefined;
  const prefix = `${name}=`;
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

export async function sessionFromRequest(request: Request) {
  return verifySessionToken(cookieValue(request.headers.get("cookie"), SESSION_COOKIE));
}

async function sign(value: string) {
  const secret = process.env.AUTH_SESSION_SECRET || "meponto-development-session-secret";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(bytes));
}

function base64UrlEncode(value: string) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}
