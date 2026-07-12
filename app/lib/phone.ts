/**
 * Shared Brazilian phone normalization — the ONE way a phone number is
 * cleaned before it is stored, compared or handed to an SMS provider.
 * Server routes (member-login, register, auth/login, partner-register,
 * reset-password) and the public web forms all go through here, so
 * "(11) 98765-4321", "11987654321", "5511987654321" and "+55 11 98765-4321"
 * always resolve to the same canonical number and the SMS gateway always
 * receives a deliverable +55 number.
 *
 * Canonical form: E.164 with "+", e.g. "+5511987654321".
 * Rules:
 *  - strip spaces, hyphens, parentheses and dots;
 *  - starts with "+55"                     → keep (already canonical);
 *  - starts with "55" + 10–11 more digits  → prefix "+";
 *  - bare 10–11 digits (DDD + number)      → prefix "+55";
 *  - other international ("+" non-55)      → keep as typed;
 *  - anything else (too short/garbled)     → digits as-is, caller validates.
 *
 * Pure and isomorphic: safe to import from client components and API routes.
 */

const stripSeparators = (input: string) => input.replace(/[\s\-().]/g, "");

export function normalizeBrPhone(input: string): string {
  const raw = stripSeparators(String(input ?? ""));
  if (!raw) return "";

  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    // "+55…" is kept; other international numbers ("+" non-55) pass through.
    return digits ? `+${digits}` : "";
  }

  const digits = raw.replace(/\D/g, "");
  // "55" + DDD(2) + number(8–9) — country code typed without the "+".
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return `+${digits}`;
  // Bare local number: DDD + 8–9 digits → default to Brazil.
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  // Unknown shape — return the digits and let the caller's validation reject it.
  return digits;
}

/** Digits-only form (no "+") — for providers that want "5511987654321" (Aliyun). */
export function phoneDigits(input: string): string {
  return normalizeBrPhone(input).replace(/\D/g, "");
}

/**
 * Format-insensitive comparison: normalizes BOTH sides, so records stored
 * before normalization ("11 98765-4321", "5511987654321") still match the
 * canonical "+55…" input — no migration needed for existing data.
 */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = phoneDigits(a ?? "");
  const right = phoneDigits(b ?? "");
  return left.length > 0 && left === right;
}
