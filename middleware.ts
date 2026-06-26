import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Progressive-login guard. A Google *guest* (unverified — signed in with Google
 * but hasn't confirmed phone + CPF) may browse PontoMall freely, but any
 * money/points/order/economy WRITE is blocked until they verify. This single
 * chokepoint covers every sensitive write route, so individual handlers don't
 * each need their own check.
 *
 * It ONLY ever blocks sessions with `verified === false`, which exist solely
 * when GOOGLE_LITE_LOGIN is enabled — a harmless no-op otherwise. Read-only GETs
 * (browsing the catalog, viewing products) always pass.
 *
 * Self-contained on purpose: verifies the signed cookie with Web Crypto only, so
 * it stays Edge-runtime safe (no `node:crypto` pulled in from the shared
 * auth-session module). Mirrors that module's HMAC-SHA256 base64url scheme.
 */
const SESSION_COOKIE = "meponto_session";
const GUARDED = ["/api/wallet", "/api/points", "/api/mall", "/api/marketplace", "/api/partner", "/api/tasks"];
const WRITE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

/** Returns the session payload if the cookie's HMAC signature is valid, else null. */
async function readSession(token: string | undefined): Promise<{ verified?: boolean; expiresAt?: number } | null> {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const secret = process.env.AUTH_SESSION_SECRET || "meponto-development-session-secret";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
  if (!timingSafeEqual(signature, bytesToBase64Url(new Uint8Array(bytes)))) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as { verified?: boolean; expiresAt?: number };
    if (payload.expiresAt && payload.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  if (!WRITE.has(request.method)) return NextResponse.next();
  const path = request.nextUrl.pathname;
  if (!GUARDED.some((p) => path === p || path.startsWith(`${p}/`))) return NextResponse.next();

  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session && session.verified === false) {
    return NextResponse.json(
      { error: "Confirme seu telefone e CPF para concluir.", code: "needs_verification" },
      { status: 403 },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/wallet/:path*",
    "/api/points/:path*",
    "/api/mall/:path*",
    "/api/marketplace/:path*",
    "/api/partner/:path*",
    "/api/tasks/:path*",
  ],
};
