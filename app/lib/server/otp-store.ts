/**
 * OTP challenge store for member login (/api/member-login).
 *
 * Supabase-backed when persistence is configured (USE_SUPABASE=true +
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) — required in
 * production: on serverless the verify request may land on a different
 * instance than the one that issued the code, so an in-memory Map loses
 * challenges randomly. Falls back to an in-memory Map for local dev.
 *
 * Table: otp_challenges (see supabase/migrations/20260703090000_otp_challenges.sql).
 * Keyed by normalized BR phone; one pending challenge per phone.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type OtpChallenge = {
  code: string;
  expiresAt: number; // epoch ms
  attempts: number;
  lastSentAt: number; // epoch ms
  rebindRiderId?: string;
};

const TABLE = "otp_challenges";
const memoryStore = new Map<string, OtpChallenge>();
let client: SupabaseClient | null = null;
let warned = false;

function supabaseEnabled(): boolean {
  return (
    process.env.USE_SUPABASE === "true" &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

async function getClient(): Promise<SupabaseClient | null> {
  if (!supabaseEnabled()) return null;
  if (client) return client;
  try {
    const { getSupabaseServerClient } = await import("../supabase/server");
    client = getSupabaseServerClient();
    return client;
  } catch (error) {
    if (!warned) {
      warned = true;
      console.warn(`[otp-store] Supabase unavailable, using in-memory fallback: ${(error as Error).message}`);
    }
    return null;
  }
}

export async function getOtpChallenge(phone: string): Promise<OtpChallenge | undefined> {
  const db = await getClient();
  if (!db) return memoryStore.get(phone);
  const { data, error } = await db.from(TABLE).select("*").eq("phone", phone).maybeSingle();
  if (error) {
    console.warn(`[otp-store] read failed: ${error.message}`);
    return memoryStore.get(phone);
  }
  if (!data) return undefined;
  return {
    code: data.code as string,
    expiresAt: Number(data.expires_at),
    attempts: Number(data.attempts),
    lastSentAt: Number(data.last_sent_at),
    rebindRiderId: (data.rebind_rider_id as string | null) ?? undefined,
  };
}

export async function setOtpChallenge(phone: string, challenge: OtpChallenge): Promise<void> {
  const db = await getClient();
  if (!db) {
    memoryStore.set(phone, challenge);
    return;
  }
  const { error } = await db.from(TABLE).upsert({
    phone,
    code: challenge.code,
    expires_at: challenge.expiresAt,
    attempts: challenge.attempts,
    last_sent_at: challenge.lastSentAt,
    rebind_rider_id: challenge.rebindRiderId ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.warn(`[otp-store] write failed, falling back to memory: ${error.message}`);
    memoryStore.set(phone, challenge);
  }
}

export async function deleteOtpChallenge(phone: string): Promise<void> {
  const db = await getClient();
  memoryStore.delete(phone);
  if (!db) return;
  const { error } = await db.from(TABLE).delete().eq("phone", phone);
  if (error) console.warn(`[otp-store] delete failed: ${error.message}`);
}
