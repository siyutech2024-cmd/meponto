// One-off: zero out phantom-negative franchise deposit balances.
// Cause: wallet payment/withdrawal confirmations auto-drew the deposit ledger
// (allowNegative) while top-ups were never recorded in-system. The coupling is
// now removed (2026-08-06); this script posts ONE compensating "adjust" entry
// per overdrawn franchise so balances return to R$ 0,00 — append-only, fully
// audited, idempotent (skips if a zeroing entry already exists).
//
// Run on the operator machine (needs .env.local):  node scripts/zero-franchise-deposits.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: rows, error } = await supabase
  .from("app_state_records")
  .select("record_id,data")
  .eq("collection", "franchiseDepositLedgerEntries");
if (error) throw error;

// Latest balanceAfter per franchise = current balance.
const latest = new Map();
for (const r of rows ?? []) {
  const d = r.data;
  const prev = latest.get(d.franchise);
  if (!prev || String(d.createdAt ?? "") >= String(prev.createdAt ?? "")) latest.set(d.franchise, d);
}

const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
let fixed = 0;
for (const [franchise, entry] of latest) {
  const balance = Number(entry.balanceAfter ?? 0);
  if (balance >= 0) continue;
  const id = `fdep-zero-${franchise.replace(/[^a-zA-Z0-9]/g, "")}-202608`;
  if ((rows ?? []).some((r) => r.record_id === id)) { console.log(`skip ${franchise}: already zeroed`); continue; }
  const adjust = {
    id,
    franchise,
    type: "adjust",
    amountBRL: -balance, // brings balance to exactly 0
    balanceAfter: 0,
    sourceType: "manual",
    sourceId: "decouple-2026-08-06",
    note: "Zeramento: estornos automáticos descontinuados (pagamentos diários fora do sistema)",
    createdBy: "Super Admin",
    createdAt: stamp,
  };
  const { error: e1 } = await supabase.from("app_state_records").upsert({
    collection: "franchiseDepositLedgerEntries", record_id: id, data: adjust,
  }, { onConflict: "collection,record_id" });
  if (e1) throw e1;
  // Sync the franchise record's cached depositBalance to 0 as well.
  const { data: fr } = await supabase.from("app_state_records")
    .select("record_id,data").eq("collection", "franchises");
  const target = (fr ?? []).find((f) => f.data?.name === franchise);
  if (target) {
    await supabase.from("app_state_records").update({
      data: { ...target.data, depositBalance: 0 },
    }).eq("collection", "franchises").eq("record_id", target.record_id);
  }
  console.log(`zeroed ${franchise}: ${balance} -> 0`);
  fixed += 1;
}
console.log(`done. franchises zeroed: ${fixed}`);
