import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission, roleFromRequest } from "../../lib/server/authz";
import { computeBalance, type RiderWithdrawal } from "../../lib/finance";

const COLLECTIONS = ["riderWithdrawals", "riderDailyEarnings", "riders"];

const today = () => new Date().toISOString().slice(0, 10);
const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

export async function GET(request: Request) {
  const url = new URL(request.url);
  const riderName = url.searchParams.get("riderName") ?? "";
  const riderId = url.searchParams.get("riderId") ?? "";
  // Rider wallet view only needs the rider-app permission.
  const forbidden = requirePermission(request, riderName || riderId ? "use_rider_app" : "view_finance");
  if (forbidden) return forbidden;

  await refreshCollectionsFromDatabase(COLLECTIONS);

  const franchiseScope = url.searchParams.get("franchise") ?? "";
  const stationScope = url.searchParams.get("station") ?? "";

  // Single-rider wallet (rider app).
  if (riderName || riderId) {
    const rider = memory.riders.find((item) => (riderId && item.id === riderId) || (riderName && item.name === riderName));
    if (!rider || !rider.ninetyNineId) {
      return jsonResponse({ data: { me: null, withdrawals: [] } });
    }
    const balance = computeBalance(memory.riderDailyEarnings, memory.riderWithdrawals, rider.ninetyNineId, today());
    const withdrawals = memory.riderWithdrawals
      .filter((w) => w.rider99Id === rider.ninetyNineId)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    return jsonResponse({
      data: { me: { riderId: rider.id, name: rider.name, pix: rider.pix, station: rider.ponto, franchise: rider.franchise, ...balance }, withdrawals },
    });
  }

  // HQ / franchise back-office view.
  let riders = memory.riders.filter((rider) => rider.ninetyNineId);
  if (franchiseScope) riders = riders.filter((rider) => (rider.franchise ?? "Unassigned") === franchiseScope);
  if (stationScope) riders = riders.filter((rider) => (rider.ponto ?? "Unassigned") === stationScope);

  const balances = riders
    .map((rider) => ({
      riderId: rider.id,
      name: rider.name,
      rider99Id: rider.ninetyNineId!,
      pix: rider.pix,
      franchise: rider.franchise ?? "Unassigned",
      station: rider.ponto ?? "Unassigned",
      ...computeBalance(memory.riderDailyEarnings, memory.riderWithdrawals, rider.ninetyNineId!, today()),
    }))
    .filter((row) => row.settled > 0 || row.paid > 0 || row.held > 0)
    .sort((a, b) => b.available - a.available);

  let withdrawals = memory.riderWithdrawals.slice().sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  if (franchiseScope) withdrawals = withdrawals.filter((w) => w.franchise === franchiseScope);
  if (stationScope) withdrawals = withdrawals.filter((w) => w.station === stationScope);

  // HQ settles with FRANCHISES: payable = riders' settled − franchise paid out.
  const franchiseMap = new Map<string, { settled: number; paid: number; held: number }>();
  for (const row of balances) {
    const entry = franchiseMap.get(row.franchise) ?? { settled: 0, paid: 0, held: 0 };
    entry.settled += row.settled;
    entry.paid += row.paid;
    entry.held += row.held;
    franchiseMap.set(row.franchise, entry);
  }
  const franchises = [...franchiseMap.entries()].map(([key, value]) => ({
    franchise: key,
    settled: value.settled,
    paidOut: value.paid,
    pendingRequests: value.held,
    payable: Math.max(0, value.settled - value.paid),
  }));

  return jsonResponse({ data: { balances, withdrawals, franchises } });
}

type Body =
  | { action: "requestWithdrawal"; riderId?: string; riderName?: string; amount: number }
  | { action: "confirmPayment"; withdrawalId: string; note?: string }
  | { action: "rejectWithdrawal"; withdrawalId: string; note?: string };

async function handlePost(request: Request) {
  const peek = (await request.clone().json().catch(() => ({}))) as { action?: string };
  const forbidden =
    peek.action === "requestWithdrawal"
      ? requirePermission(request, "use_rider_app") && requirePermission(request, "view_finance")
      : requirePermission(request, "view_finance");
  if (forbidden) return forbidden;

  await refreshCollectionsFromDatabase(COLLECTIONS);
  const body = (await request.json().catch(() => ({}))) as Partial<Body> & Record<string, unknown>;
  const actor = roleFromRequest(request);

  switch (body.action) {
    case "requestWithdrawal": {
      const { riderId, riderName } = body as { riderId?: string; riderName?: string };
      const rider = memory.riders.find((item) => (riderId && item.id === riderId) || (riderName && item.name === riderName));
      if (!rider || !rider.ninetyNineId) return jsonResponse({ error: "Cadastro não encontrado." }, { status: 404 });

      const balance = computeBalance(memory.riderDailyEarnings, memory.riderWithdrawals, rider.ninetyNineId, today());
      const amount = Math.round(Number(body.amount) * 100) / 100;
      if (!Number.isFinite(amount) || amount <= 0) return jsonResponse({ error: "Valor inválido." }, { status: 400 });
      if (amount > balance.available) {
        return jsonResponse({ error: `Saldo insuficiente: disponível R$ ${balance.available.toFixed(2)} (ganhos até ontem).` }, { status: 409 });
      }
      if (memory.riderWithdrawals.some((w) => w.rider99Id === rider.ninetyNineId && w.status === "requested")) {
        return jsonResponse({ error: "Você já tem um saque em análise. Aguarde a confirmação." }, { status: 409 });
      }

      const withdrawal: RiderWithdrawal = {
        id: makeServerId("wd", memory.riderWithdrawals.length + 1),
        riderId: rider.id,
        riderName: rider.name,
        rider99Id: rider.ninetyNineId,
        pix: rider.pix || rider.cpf,
        franchise: rider.franchise ?? "Unassigned",
        station: rider.ponto ?? "Unassigned",
        amount,
        status: "requested",
        requestedAt: nowStamp(),
      };
      memory.riderWithdrawals.unshift(withdrawal);

      appendServerAudit({
        actor,
        action: "WITHDRAWAL_REQUESTED",
        entity: "RiderWithdrawal",
        entityId: withdrawal.id,
        detail: `${rider.name} requested R$${amount.toFixed(2)} via PIX ${withdrawal.pix} (franchise ${withdrawal.franchise}).`,
        risk: "Medium",
      });

      return jsonResponse({ data: { withdrawal, balance: { ...balance, held: balance.held + amount, available: balance.available - amount } } }, { status: 201 });
    }

    case "confirmPayment":
    case "rejectWithdrawal": {
      const { withdrawalId, note = "" } = body as { withdrawalId?: string; note?: string };
      const index = memory.riderWithdrawals.findIndex((w) => w.id === withdrawalId);
      if (index === -1) return jsonResponse({ error: "withdrawal not found" }, { status: 404 });
      const current = memory.riderWithdrawals[index];
      if (current.status !== "requested") return jsonResponse({ error: `withdrawal is already ${current.status}` }, { status: 409 });

      const stamp = nowStamp();
      if (body.action === "confirmPayment") {
        memory.riderWithdrawals[index] = { ...current, status: "paid", paidAt: stamp, paidBy: actor, note: String(note).slice(0, 200) };
      } else {
        memory.riderWithdrawals[index] = { ...current, status: "rejected", rejectedAt: stamp, note: String(note).slice(0, 200) };
      }

      appendServerAudit({
        actor,
        action: body.action === "confirmPayment" ? "WITHDRAWAL_PAID" : "WITHDRAWAL_REJECTED",
        entity: "RiderWithdrawal",
        entityId: withdrawalId ?? "",
        detail: `${current.riderName} R$${current.amount.toFixed(2)} PIX ${current.pix} — ${body.action === "confirmPayment" ? "paid and balance reduced" : "rejected, hold released"}.`,
        risk: "Medium",
      });

      return jsonResponse({ data: memory.riderWithdrawals[index] });
    }

    default:
      return jsonResponse({ error: "unknown action" }, { status: 400 });
  }
}

// Ensure mutations are durably written before the serverless instance can freeze.
export async function POST(request: Request) {
  const response = await handlePost(request);
  await flushPendingToDatabase();
  return response;
}
