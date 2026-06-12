import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission, roleFromRequest } from "../../lib/server/authz";
import { sendPushToRider } from "../../lib/server/notify";
import { computeBalance, type RiderWithdrawal, type WalletPayment } from "../../lib/finance";
import { scopeFromRequest } from "../../lib/server/authz";

const COLLECTIONS = ["riderWithdrawals", "riderDailyEarnings", "riderDailyKpis", "riders", "franchises", "walletPayments"];

const today = () => new Date().toISOString().slice(0, 10);
const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

/** Monday-anchored natural week containing `date` → [start..start+6]. */
function weekWindow(date: string): { from: string; to: string } {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const back = (day - 1 + 7) % 7; // days since the most recent Monday
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - back);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

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

  // Periodic billing statement: per-rider daily settle rows for one franchise.
  const statementFranchise = url.searchParams.get("statement") ?? "";
  if (statementFranchise) {
    const to = url.searchParams.get("to") || today();
    const from = url.searchParams.get("from") || new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const byNinetyNine = new Map(memory.riders.filter((r) => r.ninetyNineId).map((r) => [r.ninetyNineId!, r]));
    const kpiByKey = new Map(memory.riderDailyKpis.map((k) => [`${k.date}|${k.rider99Id}`, k]));
    const r2 = (n: number) => Math.round((n ?? 0) * 100) / 100;
    const rows = memory.riderDailyEarnings
      .filter((row) => row.date >= from && row.date <= to)
      .map((row) => ({ row, rider: byNinetyNine.get(row.rider99Id) }))
      .filter(({ rider }) => statementFranchise === "all" || (rider?.franchise ?? "Unassigned") === statementFranchise)
      .map(({ row, rider }) => {
        const kpi = kpiByKey.get(`${row.date}|${row.rider99Id}`);
        return {
          date: row.date,
          riderName: rider?.name ?? row.riderName ?? row.rider99Id,
          rider99Id: row.rider99Id,
          cpf: rider?.cpf ?? row.cpf ?? "",
          pix: rider?.pix ?? row.pix ?? "",
          franchise: rider?.franchise ?? "Unassigned",
          station: rider?.ponto ?? "Unassigned",
          orders: row.orders ?? 0,
          onlineHours: kpi?.onlineHours ?? null,
          ar: kpi?.ar ?? null,
          tripIncome: r2(row.tripIncome),
          bonus: r2(row.bonus),
          tips: r2(row.tips),
          cashDebt: r2(row.cashDebt),
          mealDeduction: r2(row.mealDeduction),
          other: r2(row.other),
          settleAmount: r2(row.settleAmount),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.riderName.localeCompare(b.riderName));
    const total = Math.round(rows.reduce((sum, row) => sum + row.settleAmount, 0) * 100) / 100;
    return jsonResponse({ data: { franchise: statementFranchise, from, to, rows, total } });
  }

  // Raw payment records in a window (paid-status lookup for T+1 board).
  if (url.searchParams.get("payments") === "1") {
    const from = url.searchParams.get("from") || today();
    const to = url.searchParams.get("to") || today();
    return jsonResponse({ data: memory.walletPayments.filter((p) => p.weekFrom >= from && p.weekTo <= to) });
  }

  // Weekly settlement, folded franchise → rider (the main HQ wallet view).
  if (url.searchParams.get("view") === "weekly") {
    const anchor = url.searchParams.get("week") || today();
    const win = weekWindow(anchor);
    const scope = await scopeFromRequest(request);
    const byNinetyNine = new Map(memory.riders.filter((r) => r.ninetyNineId).map((r) => [r.ninetyNineId!, r]));
    const round = (n: number) => Math.round(n * 100) / 100;

    // Sum settle per rider within the window.
    const riderAgg = new Map<string, { name: string; rider99Id: string; franchise: string; station: string; settle: number; orders: number; days: number }>();
    for (const row of memory.riderDailyEarnings) {
      if (row.date < win.from || row.date > win.to) continue;
      const rider = byNinetyNine.get(row.rider99Id);
      const franchise = rider?.franchise ?? "Unassigned";
      if (scope.franchise && franchise !== scope.franchise) continue;
      const key = row.rider99Id;
      const cur = riderAgg.get(key) ?? { name: rider?.name ?? row.rider99Id, rider99Id: row.rider99Id, franchise, station: rider?.ponto ?? "Unassigned", settle: 0, orders: 0, days: 0 };
      cur.settle += row.settleAmount ?? 0;
      cur.orders += row.orders ?? 0;
      cur.days += 1;
      riderAgg.set(key, cur);
    }

    // Payments recorded for this window (weekly entries match the window
    // exactly; daily entries fall inside it).
    const paymentsInWindow = memory.walletPayments.filter((p) => p.weekFrom >= win.from && p.weekTo <= win.to);
    const paidToRider = new Map<string, number>();
    const paidToFranchise = new Map<string, number>();
    for (const p of paymentsInWindow) {
      if (p.target === "rider") paidToRider.set(p.refName, (paidToRider.get(p.refName) ?? 0) + p.amount);
      else paidToFranchise.set(p.refName, (paidToFranchise.get(p.refName) ?? 0) + p.amount);
    }

    // Group into franchise → riders.
    const groups = new Map<string, { franchise: string; settle: number; riders: Array<{ name: string; rider99Id: string; station: string; settle: number; orders: number; days: number; paid: number }> }>();
    for (const r of riderAgg.values()) {
      const g = groups.get(r.franchise) ?? { franchise: r.franchise, settle: 0, riders: [] };
      g.settle = round(g.settle + r.settle);
      g.riders.push({ name: r.name, rider99Id: r.rider99Id, station: r.station, settle: round(r.settle), orders: r.orders, days: r.days, paid: round(paidToRider.get(r.name) ?? 0) });
      groups.set(r.franchise, g);
    }
    const franchises = [...groups.values()]
      .map((g) => ({ ...g, riders: g.riders.sort((a, b) => b.settle - a.settle), franchisePaid: round(paidToFranchise.get(g.franchise) ?? 0) }))
      .sort((a, b) => b.settle - a.settle);
    const grandTotal = round(franchises.reduce((s, g) => s + g.settle, 0));

    return jsonResponse({ data: { week: win, franchises, grandTotal, payments: paymentsInWindow, scoped: Boolean(scope.franchise) } });
  }

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
  | { action: "rejectWithdrawal"; withdrawalId: string; note?: string }
  | { action: "recordPayment"; target: "franchise" | "rider"; refName: string; franchise?: string; amount: number; period?: "weekly" | "daily"; weekFrom: string; weekTo: string; note?: string };

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
    case "recordPayment": {
      const { target, refName, franchise = "", period = "weekly", weekFrom, weekTo, note = "" } = body as {
        target: "franchise" | "rider"; refName?: string; franchise?: string; period?: "weekly" | "daily"; weekFrom?: string; weekTo?: string; note?: string;
      };
      const amount = Math.round(Number(body.amount) * 100) / 100;
      if (target !== "franchise" && target !== "rider") return jsonResponse({ error: "target inválido" }, { status: 400 });
      if (!refName?.trim() || !Number.isFinite(amount) || amount <= 0) return jsonResponse({ error: "请填写有效的对象与金额" }, { status: 400 });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekFrom ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(weekTo ?? "")) return jsonResponse({ error: "结算周期无效" }, { status: 400 });
      const payment: WalletPayment = {
        id: makeServerId("pay", memory.walletPayments.length + 1),
        target,
        refName: refName.trim(),
        franchise: (target === "franchise" ? refName : franchise).trim(),
        amount,
        period: period === "daily" ? "daily" : "weekly",
        weekFrom: weekFrom!,
        weekTo: weekTo!,
        note: String(note).slice(0, 200),
        paidBy: actor,
        paidAt: nowStamp(),
      };
      memory.walletPayments.unshift(payment);
      // HQ→franchise payment also draws down the franchise prepaid balance.
      if (target === "franchise") {
        const fIndex = memory.franchises.findIndex((f) => f.name === refName.trim());
        if (fIndex !== -1) {
          const next = Math.round(((memory.franchises[fIndex].depositBalance ?? 0) - amount) * 100) / 100;
          memory.franchises[fIndex] = { ...memory.franchises[fIndex], depositBalance: next };
        }
      }
      appendServerAudit({ actor, action: "WALLET_PAYMENT_RECORDED", entity: "WalletPayment", entityId: payment.id, detail: `${target} ${refName} R$${amount.toFixed(2)} (${payment.period}, ${weekFrom}~${weekTo})${note ? ` — ${note}` : ""}.`, risk: "Medium" });
      return jsonResponse({ data: payment }, { status: 201 });
    }

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
        // Auto-deduct the payout from the franchise's prepaid deposit (may go
        // negative — a negative balance means the franchise owes HQ a top-up).
        const fIndex = memory.franchises.findIndex((f) => f.name === current.franchise);
        if (fIndex !== -1) {
          const nextBalance = Math.round(((memory.franchises[fIndex].depositBalance ?? 0) - current.amount) * 100) / 100;
          memory.franchises[fIndex] = { ...memory.franchises[fIndex], depositBalance: nextBalance };
          appendServerAudit({
            actor,
            action: "FRANCHISE_DEPOSIT_AUTO_DEDUCT",
            entity: "Franchise",
            entityId: memory.franchises[fIndex].id,
            detail: `Payout ${current.riderName} R$${current.amount.toFixed(2)} → ${current.franchise} deposit R$${nextBalance.toFixed(2)}${nextBalance < 0 ? " (OVERDRAWN)" : ""}.`,
            risk: nextBalance < 0 ? "High" : "Medium",
          });
        }
        await sendPushToRider(current.riderName, "Pagamento enviado 💰", `Seu saque de R$ ${current.amount.toFixed(2)} foi pago via PIX. Confira seu extrato.`, "/rider-app/wallet");
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
