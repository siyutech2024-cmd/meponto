import { createHash } from "node:crypto";

export function hashPassword(salt: string, password: string): string {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}
