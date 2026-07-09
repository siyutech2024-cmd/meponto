/**
 * Franchise procurement end-to-end smoke + ledger invariants
 * (docs/franchise-procurement-full-chain-plan.md §7.1 #8/#14).
 *
 * Covers: flag gating, 选货→订货→审批→确认→发货→到站→收货入库 (consignment,
 * with a short-receipt discrepancy), buyout debit/refund on reject, red cases
 * (foreign station, insufficient balance, double receive, franchise approve),
 * and invariants (deposit ledger ⇔ balance, no negative stock, refund parity).
 *
 * Usage: PONTOSYS_BASE_URL=http://localhost:3100 node scripts/procurement-smoke.mjs
 */

const baseUrl = process.env.PONTOSYS_BASE_URL ?? "http://localhost:3000";

const accounts = {
  pontosys: { identifier: "hq@meponto.com", password: "pontosys-hq" },
  pontomall: { identifier: "mall@meponto.com", password: "pontomall-demo" },
  franchise: { identifier: "franchise@meponto.com", password: "franquia-demo" },
  ponto: { identifier: "ponto@meponto.com", password: "ponto-demo" },
};

const FRANCHISE = "SP Core Franchise"; // demo franchise portal organization
const STATION = "Ponto Paulista"; // demo ponto portal organization

const cookies = new Map();
let failures = 0;
let checks = 0;

function ok(name, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function login(portal) {
  if (cookies.has(portal)) return cookies.get(portal);
  const response = await fetch(new URL("/api/auth/login", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...accounts[portal], portal }),
  });
  if (!response.ok) throw new Error(`login ${portal} failed: ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error(`login ${portal}: no session cookie`);
  cookies.set(portal, cookie);
  return cookie;
}

async function call(portal, path, body) {
  const cookie = await login(portal);
  const response = await fetch(new URL(path, baseUrl), {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, data: payload.data, error: payload.error, errorKey: payload.errorKey };
}

const round2 = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
console.log("procurement-smoke: provisioning fixtures");

// HQ: franchise + station bound to the demo portal accounts (idempotent).
{
  const add = await call("pontosys", "/api/network", { action: "addFranchise", name: FRANCHISE, owner: "Smoke", city: "São Paulo" });
  ok("addFranchise (or exists)", add.status === 201 || add.status === 409, `${add.status} ${add.error ?? ""}`);
  const network = await call("pontosys", "/api/network");
  const franchise = (network.data?.franchises ?? []).find((f) => f.name === FRANCHISE);
  ok("franchise exists", Boolean(franchise));
  const station = await call("pontosys", "/api/network", { action: "addStation", name: STATION, franchise: FRANCHISE, address: "Av. Paulista, 1000", leader: "Smoke" });
  ok("addStation (or exists)", station.status === 201 || station.status === 409, `${station.status} ${station.error ?? ""}`);
  const deposit = await call("pontosys", "/api/network", { action: "depositFranchise", franchiseId: franchise?.id, amount: 500, note: "smoke top-up" });
  ok("deposit +500 posted", deposit.status === 200, `${deposit.status} ${deposit.error ?? ""}`);
}

// Office: flag OFF red case first, then enable.
{
  const off = await call("pontomall", "/api/mall/procurement", { action: "setProcurementConfig", procurementEnabled: false });
  ok("config: disable", off.status === 200);
  const denied = await call("franchise", "/api/mall/procurement", { action: "createFPO", stationId: "x", mode: "consignment", items: [] });
  ok("flag off blocks createFPO", denied.status === 409 && denied.errorKey === "fpErrFlagOff", `${denied.status} ${denied.errorKey ?? denied.error ?? ""}`);
  const on = await call("pontomall", "/api/mall/procurement", { action: "setProcurementConfig", procurementEnabled: true, procurementAutoApproveBRL: 0, procurementMaxOrderBRL: 0, procurementFrozen: false });
  ok("config: enable", on.status === 200 && on.data?.procurementEnabled === true);
}

// Office: pick two products and open them for procurement.
const office = await call("pontomall", "/api/mall/procurement");
// Physical goods only — virtual vouchers can never be stocked at a station.
const products = (office.data?.products ?? []).filter((p) => p.status === "active" && !p.isVirtual);
const productA = products[0];
const productB = products[1] ?? products[0];
ok("active products available", Boolean(productA && productB));
await call("pontomall", "/api/mall/procurement", { action: "setProductProcurement", productId: productA.id, procurementMode: "consignment", minOrderQty: 1, maxOrderQty: 0 });
await call("pontomall", "/api/mall/procurement", { action: "setProductProcurement", productId: productB.id, procurementMode: "both", franchiseBuyoutPrice: 10, minOrderQty: 1, maxOrderQty: 0 });

// Franchise view: station id + starting balance.
const franchiseView = await call("franchise", "/api/mall/procurement");
const myStation = (franchiseView.data?.stations ?? []).find((s) => s.name === STATION);
ok("franchise sees own station", Boolean(myStation));
const startBalance = round2(franchiseView.data?.depositBalance ?? 0);
const foreignStation = (await call("pontosys", "/api/network")).data?.stations?.find((s) => s.franchise !== FRANCHISE);

// Red: order to a station of another franchise.
if (foreignStation) {
  const foreign = await call("franchise", "/api/mall/procurement", { action: "createFPO", stationId: foreignStation.id, mode: "consignment", items: [{ productId: productA.id, qty: 1 }] });
  ok("foreign station rejected", foreign.status === 403 && foreign.errorKey === "fpErrStationNotOwned", `${foreign.status} ${foreign.errorKey ?? ""}`);
}

// ---------------------------------------------------------------------------
console.log("procurement-smoke: consignment full chain (short receipt)");
let consignmentId = "";
{
  const created = await call("franchise", "/api/mall/procurement", { action: "createFPO", stationId: myStation.id, mode: "consignment", items: [{ productId: productA.id, qty: 3 }] });
  ok("createFPO consignment", created.status === 201 && Array.isArray(created.data) && created.data.length === 1, `${created.status} ${created.error ?? ""}`);
  consignmentId = created.data?.[0]?.id ?? "";

  // Red: franchise cannot approve its own order.
  const selfApprove = await call("franchise", "/api/mall/procurement", { action: "approveFPO", fpoId: consignmentId });
  ok("franchise cannot approve", selfApprove.status === 403, String(selfApprove.status));

  const approve = await call("pontomall", "/api/mall/procurement", { action: "approveFPO", fpoId: consignmentId });
  ok("office approves", approve.status === 200 && approve.data?.status === "approved");
  const confirm = await call("pontomall", "/api/mall/procurement", { action: "confirmFPO", fpoId: consignmentId });
  ok("confirm", confirm.status === 200 && confirm.data?.status === "confirmed");
  const ship = await call("pontomall", "/api/mall/procurement", { action: "shipFPO", fpoId: consignmentId, shipNote: "SMOKE-TRACK-1" });
  ok("ship", ship.status === 200 && ship.data?.status === "shipped", `${ship.status} ${ship.error ?? ""}`);
  const arrive = await call("pontomall", "/api/mall/procurement", { action: "arriveFPO", fpoId: consignmentId });
  ok("arrive", arrive.status === 200 && arrive.data?.status === "arrived");

  // Station receives 2 of 3 → inbound 2 + short discrepancy.
  const receive = await call("ponto", "/api/mall/procurement", { action: "receiveFPO", fpoId: consignmentId, received: [{ productId: productA.id, receivedQty: 2 }] });
  ok("station receives (short)", receive.status === 200 && receive.data?.status === "received", `${receive.status} ${receive.error ?? ""}`);

  // Red: double receive must be rejected (idempotent state machine).
  const again = await call("ponto", "/api/mall/procurement", { action: "receiveFPO", fpoId: consignmentId, received: [] });
  ok("double receive rejected", again.status === 409, String(again.status));

  const stationView = await call("ponto", "/api/mall/procurement");
  const bucket = (stationView.data?.stock ?? []).find((b) => b.productId === productA.id && b.mode === "consignment");
  ok("station stock = 2 (consignment pool)", bucket?.qty === 2, `qty=${bucket?.qty}`);
  const discrepancy = (stationView.data?.discrepancies ?? []).find((d) => d.fpoId === consignmentId);
  ok("short discrepancy recorded", discrepancy?.kind === "short" && discrepancy?.receivedQty === 2);
}

// ---------------------------------------------------------------------------
console.log("procurement-smoke: buyout debit / refund");
{
  // Red: buyout larger than the deposit balance.
  const over = await call("franchise", "/api/mall/procurement", { action: "createFPO", stationId: myStation.id, mode: "buyout", items: [{ productId: productB.id, qty: 100000 }] });
  ok("insufficient balance rejected", over.status === 409 && over.errorKey === "fpErrInsufficientBalance", `${over.status} ${over.errorKey ?? ""}`);

  const created = await call("franchise", "/api/mall/procurement", { action: "createFPO", stationId: myStation.id, mode: "buyout", items: [{ productId: productB.id, qty: 5 }] });
  ok("createFPO buyout (5 × R$10)", created.status === 201, `${created.status} ${created.error ?? ""}`);
  const buyoutId = created.data?.[0]?.id ?? "";

  const afterDebit = await call("franchise", "/api/mall/procurement");
  ok("deposit debited 50", round2(startBalance - (afterDebit.data?.depositBalance ?? 0)) === 50, `start=${startBalance} now=${afterDebit.data?.depositBalance}`);

  const reject = await call("pontomall", "/api/mall/procurement", { action: "rejectFPO", fpoId: buyoutId, reason: "smoke reject" });
  ok("office rejects buyout", reject.status === 200 && reject.data?.status === "rejected");

  const afterRefund = await call("franchise", "/api/mall/procurement");
  ok("refund restores balance", round2(afterRefund.data?.depositBalance ?? 0) === startBalance, `now=${afterRefund.data?.depositBalance}`);
}

// ---------------------------------------------------------------------------
console.log("procurement-smoke: deposit top-up loop");
{
  const request = await call("franchise", "/api/mall/procurement", { action: "requestDepositTopUp", amountBRL: 25, pixRef: "SMOKE-PIX-1" });
  ok("top-up requested", request.status === 201, `${request.status} ${request.error ?? ""}`);
  const topUpId = request.data?.id;
  const before = round2((await call("franchise", "/api/mall/procurement")).data?.depositBalance ?? 0);
  const confirm = await call("pontomall", "/api/mall/procurement", { action: "confirmDepositTopUp", topUpId });
  ok("top-up confirmed", confirm.status === 200 && confirm.data?.status === "confirmed");
  const after = round2((await call("franchise", "/api/mall/procurement")).data?.depositBalance ?? 0);
  ok("balance +25", round2(after - before) === 25, `before=${before} after=${after}`);
}

// ---------------------------------------------------------------------------
console.log("procurement-smoke: ledger invariants");
{
  const snapshot = await call("pontomall", "/api/mall/procurement");
  const ledger = snapshot.data?.depositLedger ?? [];
  const fpos = snapshot.data?.fpos ?? [];
  const stock = snapshot.data?.stock ?? [];

  // 1. No stock pool is negative.
  ok("no negative stock pools", stock.every((b) => b.qty >= 0 && b.reserved >= 0));

  // 2. Every rejected/cancelled buyout FPO has refunds equal to its debits.
  let refundParity = true;
  for (const fpo of fpos) {
    if (fpo.mode !== "buyout" || !["rejected", "cancelled"].includes(fpo.status)) continue;
    const rows = ledger.filter((e) => e.sourceType === "fpo" && (e.sourceId === fpo.id || e.sourceId.startsWith(`${fpo.id}:`)));
    const net = round2(rows.reduce((sum, e) => sum + e.amountBRL, 0));
    if (net !== 0) { refundParity = false; console.error(`    parity break on ${fpo.id}: net=${net}`); }
  }
  ok("buyout refund parity (net 0 after reject/cancel)", refundParity);

  // 3. Ledger entries reconcile with the projected balance per franchise.
  const franchises = snapshot.data?.franchises ?? [];
  const row = franchises.find((f) => f.name === FRANCHISE);
  const newestEntry = ledger.filter((e) => e.franchise === FRANCHISE)[0];
  ok(
    "newest ledger balanceAfter matches balance",
    !newestEntry || round2(newestEntry.balanceAfter) === round2(row?.depositBalance ?? 0),
    `entry=${newestEntry?.balanceAfter} balance=${row?.depositBalance}`,
  );
}

console.log(`procurement-smoke: ${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  process.exitCode = 1;
}
