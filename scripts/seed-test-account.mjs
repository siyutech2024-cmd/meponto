#!/usr/bin/env node
/**
 * seed-test-account.mjs — 创建/刷新一条 QA 测试账号及完整数据 (idempotent).
 *
 * Seeds one complete test rider straight into the Supabase persistence store
 * (`app_state_records`), so the APP has everything to exercise: profile,
 * 14 days of Eastwind KPIs + T+1 earnings, a points ledger reaching the OURO
 * tier, a welcome inbox message, and a station binding so QR check-in works.
 *
 * Usage:
 *   node scripts/seed-test-account.mjs                 # default test phone
 *   node scripts/seed-test-account.mjs --phone "11 98888 7777"   # your real
 *     phone → receive the real SMS OTP in the app
 *
 * Login options (APP → /api/member-login):
 *   A. Real phone: pass --phone with a number you own; login via actual SMS.
 *   B. Demo code (no SMS): set in Vercel env and redeploy —
 *        PLAY_DEMO_PHONE=11990000001   PLAY_DEMO_CODE=123456
 *      then log in with that phone + code.
 *   Web rider-app (/rider-login): email teste.qa@meponto.com / MePonto2026!
 *
 * All records use fixed ids (…-test-qa-…): re-running refreshes them, and
 * `node scripts/seed-test-account.mjs --purge` removes everything again.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---- Config -----------------------------------------------------------------
const argv = process.argv.slice(2);
const argValue = (flag) => {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : undefined;
};
const PURGE = argv.includes("--purge");
const TEST_PHONE = argValue("--phone") ?? "11 99000 0001";
const TEST_NAME = "TESTE QA MEPONTO";
const TEST_CPF = "390.533.447-05"; // valid-checksum sample CPF
const TEST_EMAIL = "teste.qa@meponto.com";
const TEST_PASSWORD = "MePonto2026!";
const NINETY_NINE_ID = "99-QA-0001";
const RIDER_ID = "r-test-qa-1";
const DAYS = 14;

// ---- Env / Supabase REST ------------------------------------------------------
const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
const env = Object.fromEntries(
  envFile.split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};
const TABLE = `${URL_BASE}/rest/v1/app_state_records`;

async function fetchCollection(name) {
  const res = await fetch(`${TABLE}?collection=eq.${name}&select=record_id,data`, { headers });
  if (!res.ok) throw new Error(`GET ${name}: ${res.status} ${await res.text()}`);
  return res.json();
}
async function upsert(collection, records) {
  if (!records.length) return;
  const rows = records.map((data) => ({ collection, record_id: data.id, data }));
  const res = await fetch(`${TABLE}?on_conflict=collection,record_id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`UPSERT ${collection}: ${res.status} ${await res.text()}`);
  console.log(`  ✓ ${collection}: ${records.length} record(s)`);
}
async function purgeTestRows() {
  // Covers BOTH this script's rows (record_id *test-qa*) and the rows the
  // 2026-07-11 browser-side seeding created through the production APIs
  // (rider r-mrfofje1-1268 / 99 ID 990000001 / TESTE QA MEPONTO).
  const filters = [
    "record_id=like.*test-qa*",
    "record_id=like.kpi-*-990000001", // riderDailyKpis
    "record_id=like.earn-*-990000001", // riderDailyEarnings
    "record_id=like.pts-ord-*-r-mrfofje1-1268", // auto-credited ORDER_POINTS
    "record_id=in.(pts-mrfop3za-1272,pts-mrfop3w6-1273,r-mrfofje1-1268,u-mrfofje2-24)", // missions + rider + login
    `collection=eq.memberMessages&data->>riderName=eq.${encodeURIComponent("TESTE QA MEPONTO")}`, // achievement notices
  ];
  for (const f of filters) {
    const res = await fetch(`${TABLE}?${f}`, { method: "DELETE", headers: { ...headers, Prefer: "count=exact" } });
    if (!res.ok) throw new Error(`PURGE ${f}: ${res.status} ${await res.text()}`);
    console.log(`  ✓ ${f} → ${res.headers.get("content-range") ?? "ok"}`);
  }
  console.log("✓ purge complete");
}

// ---- Helpers -----------------------------------------------------------------
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const hashPassword = (salt, password) => sha256(`${salt}:${password}`); // app/lib/server/password.ts
const dateNDaysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const todayStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

async function main() {
  if (PURGE) return purgeTestRows();

  console.log("Seeding QA test account →", URL_BASE);

  // ---- Station binding: pick a real approved station so QR check-in works ----
  const pontoRows = await fetchCollection("pontos");
  const stations = pontoRows.map((r) => r.data).filter((p) => p && p.status !== "pending");
  const station = stations.find((p) => p.franchise) ?? stations[0];
  if (!station) throw new Error("No approved Ponto found — create a station first.");
  console.log(`  station: ${station.name} (${station.id})${station.franchise ? " / " + station.franchise : ""}`);

  // ---- Rider profile ----------------------------------------------------------
  const rider = {
    id: RIDER_ID,
    name: TEST_NAME,
    cpf: TEST_CPF,
    pix: TEST_CPF,
    phone: TEST_PHONE,
    bairro: station.bairro ?? "São Paulo",
    ponto: station.name,
    leader: station.leader ?? "",
    invitedBy: "",
    chatRoom: "",
    ar: 97,
    status: "Active",
    vehicleType: "Moto",
    brand: "Honda",
    model: "CG 160",
    rentalStatus: "Own",
    isMottu: false,
    onlineHours: 8,
    nightShiftCount: 2,
    incidentCount: 0,
    joinDate: dateNDaysAgo(DAYS),
    registeredAt: dateNDaysAgo(DAYS),
    ninetyNineId: NINETY_NINE_ID,
    franchise: station.franchise ?? "",
    birthday: "1996-05-20",
  };

  // ---- Web login account (rider-app via /api/auth/login) -----------------------
  const salt = randomBytes(8).toString("hex");
  const appUser = {
    id: "u-test-qa-1",
    name: TEST_NAME,
    identifier: TEST_EMAIL,
    phone: TEST_PHONE,
    salt,
    passwordHash: hashPassword(salt, TEST_PASSWORD),
    role: "Rider",
    portal: "rider",
    organization: station.name,
    tenantId: "rider-self",
    defaultPath: "/rider-app",
    status: "active",
    createdAt: todayStamp(),
  };

  // ---- 14 days of KPIs + T+1 earnings (matched by riderName / rider99Id) -------
  const kpis = [];
  const earnings = [];
  for (let n = DAYS; n >= 1; n--) {
    const date = dateNDaysAgo(n);
    const orders = 14 + ((n * 7) % 11); // 14..24, deterministic
    const online = 6 + ((n * 3) % 4); // 6..9h
    kpis.push({
      id: `kpi-${date}-${NINETY_NINE_ID}`,
      date,
      rider99Id: NINETY_NINE_ID,
      riderName: TEST_NAME,
      phone: TEST_PHONE,
      cpf: TEST_CPF,
      city: "São Paulo",
      onlineHours: online,
      completedOrders: orders,
      signedShifts: 2,
      signedShiftHours: 8,
      inShiftOnlineHours: Math.min(online, 7.5),
      tsh: 93 + (n % 6),
      tshCritical: 0,
      ar: 95 + (n % 5),
      caa: 90 + (n % 8),
      overtime: 0,
      importedAt: `${date} 23:30`,
    });
    const tripIncome = Math.round(orders * 9.8 * 100) / 100;
    const tips = (n % 3) * 5;
    const total = Math.round((tripIncome + tips) * 100) / 100;
    earnings.push({
      id: `earn-${date}-${NINETY_NINE_ID}`,
      date,
      rider99Id: NINETY_NINE_ID,
      riderName: TEST_NAME,
      phone: TEST_PHONE,
      cpf: TEST_CPF,
      city: "São Paulo",
      total,
      tripIncome,
      cashDebt: 0,
      mealDeduction: 0,
      bonus: n % 4 === 0 ? 20 : 0,
      other: 0,
      tips,
      manualAdjust: 0,
      referralBonus: 0,
      pix: TEST_CPF,
      orders,
      settleAmount: Math.round((total + orders * 2.5) * 100) / 100,
      importedAt: `${date} 23:45`,
    });
  }

  // ---- Points ledger (append-only earns → OURO tier ≥ 6000 earned) -------------
  const ledger = [];
  let balance = 0;
  const pushEarn = (idSuffix, points, reasonCode, note, createdAt, sourceType = "mission") => {
    balance += points;
    ledger.push({
      id: `pts-test-qa-${idSuffix}`,
      riderId: RIDER_ID,
      accountId: `pts-${RIDER_ID}`,
      type: "earn",
      points,
      status: "approved",
      sourceType,
      sourceId: `pts-test-qa-${idSuffix}`,
      balanceAfter: balance,
      reasonCode,
      note,
      createdBy: "QA Seed",
      createdAt,
    });
  };
  pushEarn("welcome", 100, "REGISTRATION", "Bônus de boas-vindas", `${dateNDaysAgo(DAYS)} 10:00`);
  kpis.forEach((k, i) => pushEarn(`day-${k.date}`, k.completedOrders, "ORDER_POINTS", `Pedidos ${k.date} (${k.completedOrders})`, `${k.date} 23:50`, "delivery"));
  pushEarn("mission-1", 3000, "MISSION_REWARD", "Missão QA — dados de teste", `${dateNDaysAgo(7)} 12:00`);
  pushEarn("mission-2", 3200, "MISSION_REWARD", "Missão QA — dados de teste", `${dateNDaysAgo(2)} 12:00`);

  // ---- Welcome inbox message ----------------------------------------------------
  const message = {
    id: "msg-test-qa-1",
    riderId: RIDER_ID,
    riderName: TEST_NAME,
    title: "Conta de teste pronta 🎉",
    body: "Este é um cadastro de QA com KPIs, ganhos e pontos completos. Bom teste!",
    href: "/rider-app",
    createdAt: todayStamp(),
  };

  await upsert("riders", [rider]);
  await upsert("appUsers", [appUser]);
  await upsert("riderDailyKpis", kpis);
  await upsert("riderDailyEarnings", earnings);
  await upsert("pointsLedgerEntries", ledger);
  await upsert("memberMessages", [message]);

  console.log(`
Done. Test account summary
  Name        ${TEST_NAME}
  Phone       ${TEST_PHONE}   (APP login via SMS OTP — or PLAY_DEMO_PHONE/CODE)
  CPF         ${TEST_CPF}
  99 ID       ${NINETY_NINE_ID}
  Station     ${station.name}${station.franchise ? " / " + station.franchise : ""}
  KPIs        ${kpis.length} days · Earnings ${earnings.length} days
  Points      ${balance} earned → tier OURO (≥6000)
  Web login   ${TEST_EMAIL} / ${TEST_PASSWORD}  (rider-app)

Remove later with: node scripts/seed-test-account.mjs --purge`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
