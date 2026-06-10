/**
 * One-shot verification that button data really reaches the Supabase database.
 *
 * Prerequisites:
 *   1. The app_state_records migration has been applied to Supabase
 *      (supabase/migrations/20260610120000_app_state_persistence.sql).
 *   2. `npm run dev` is running locally with USE_SUPABASE=true in .env.local.
 *
 * Usage: node scripts/verify-persistence.mjs
 */
import { readFileSync } from "node:fs";

const BASE_URL = process.env.PONTOSYS_BASE_URL ?? "http://localhost:3000";

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) env[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  } catch {
    // ignore
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

let pass = 0;
let fail = 0;
function check(name, ok, extra) {
  console.log(`${ok ? "  PASS" : "✗ FAIL"}  ${name}${!ok && extra ? ` :: ${extra}` : ""}`);
  ok ? pass++ : fail++;
}

async function supabaseRows(filter) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/app_state_records?${filter}`, {
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!response.ok) throw new Error(`Supabase query failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  // 0. table exists?
  try {
    await supabaseRows("limit=1");
    check("app_state_records table exists in Supabase", true);
  } catch (error) {
    check("app_state_records table exists in Supabase", false, String(error.message));
    console.error("\n→ Apply the migration first: run the SQL in supabase/migrations/20260610120000_app_state_persistence.sql");
    process.exit(1);
  }

  // 1. dev server up & persistence enabled
  const health = await fetch(`${BASE_URL}/api/health`).then((r) => r.json());
  check("dev server reachable", health.ok === true);
  check("persistence enabled on server", health.persistence?.enabled === true, JSON.stringify(health.persistence));

  // 2. create a record through the API (same path the UI buttons use)
  const testId = `r-verify-${Date.now().toString(36)}`;
  const createRes = await fetch(`${BASE_URL}/api/riders`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-vento-role": "Super Admin" },
    body: JSON.stringify({
      id: testId,
      name: "Verificacao Persistencia",
      cpf: "123.456.789-09",
      phone: "+55 11 90000-0000",
    }),
  });
  check("POST /api/riders returns 201", createRes.status === 201, `status ${createRes.status}`);

  // 3. wait for the debounced flush, then confirm the row is in Supabase
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const rows = await supabaseRows(`collection=eq.riders&record_id=eq.${testId}`);
  check("record persisted to Supabase app_state_records", rows.length === 1, `rows: ${rows.length}`);

  // 4. clean up: delete via API and confirm removal propagates
  const deleteRes = await fetch(`${BASE_URL}/api/riders/${testId}`, {
    method: "DELETE",
    headers: { "x-vento-role": "Super Admin" },
  });
  check("DELETE /api/riders/[id] returns 200", deleteRes.status === 200, `status ${deleteRes.status}`);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const after = await supabaseRows(`collection=eq.riders&record_id=eq.${testId}`);
  check("delete propagated to Supabase", after.length === 0, `rows: ${after.length}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
  console.log("Database persistence verified ✔");
}

main().catch((error) => {
  console.error("verify-persistence crashed:", error);
  process.exit(1);
});
