import { jsonResponse, memory } from "../../../lib/server/memory";
import { refreshCollectionsFromDatabase } from "../../../lib/server/persistence";
import { sessionFromRequest } from "../../../lib/auth-session";
import { defaultMallConfig, eligibleCoupons, resolveRiderTierStatus } from "../../../lib/mall";
import { isSupplierCategory } from "../../../lib/server/crm-categories";

/**
 * Rider Home dashboard aggregate (session-scoped). One read powering the
 * native/PWA Home + Wallet + Map dashboards from REAL collections — no mock.
 * Every section degrades to an empty array / null when its source has no data,
 * so the client hides that section instead of showing fabricated figures.
 *
 *   performance        ← riderDailyKpis (latest + week aggregate)
 *   weeklyGoalProgress ← riderDailyKpis online hours vs a 40h week
 *   cashLedger         ← riderWithdrawals (outflow) + walletPayments (inflow)
 *   partners           ← crmPartners (name / category / bairro / services / geo)
 *   missions           ← appTasks (rider/all, enabled) + taskClaims (progress)
 *   inbox              ← notifications (System announcements only — incident
 *                        alerts are ops-internal and never rider-facing)
 *   pontos             ← pontos (service-point name / address / geo for the Map)
 */

const COLLECTIONS = [
  "riders",
  "riderDailyKpis",
  "riderWithdrawals",
  "walletPayments",
  "crmPartners",
  "notifications",
  "appTasks",
  "taskClaims",
  "pontos",
  "pointsLedgerEntries",
  "marketplaceOrders",
  "mallConfigs",
  "memberMessages",
  "mallCoupons",
];

const brl = (n: number) => "R$ " + Math.abs(n).toFixed(2).replace(".", ",");

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "Agora";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h`;
  return `${Math.round(hrs / 24)} d`;
}

function findRider(session: { userId?: string; name: string }) {
  return memory.riders.find((r) => r.id === session.userId || r.name === session.name);
}

export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Faça login.", code: "unauthenticated" }, { status: 401 });
  await refreshCollectionsFromDatabase(COLLECTIONS);

  const rider = findRider(session);
  if (!rider) return jsonResponse({ error: "Cadastro não encontrado.", code: "not_found" }, { status: 404 });
  const name = rider.name;
  const nineId = rider.ninetyNineId ?? "";

  // --- Performance (latest KPI for rates, week sum for totals) ---
  const kpis = memory.riderDailyKpis
    .filter((k) => k.riderName === name || (!!nineId && k.rider99Id === nineId))
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
  const latest = kpis[0];
  const performance = latest
    ? {
        orders: kpis.reduce((s, k) => s + (k.completedOrders ?? 0), 0),
        tshHours: latest.tsh ?? 0,
        acceptanceRate: Math.round(latest.ar ?? 0),
        cancelledOrders: kpis.reduce((s, k) => s + (k.caa ?? 0), 0),
      }
    : null;
  const onlineHoursWeek = kpis.slice(0, 7).reduce((s, k) => s + (k.onlineHours ?? 0), 0);
  const weeklyGoalProgress = kpis.length ? Math.min(100, Math.round((onlineHoursWeek / 40) * 100)) : 0;

  // --- Cash ledger (withdrawals out + rider payments in), newest first ---
  const withdrawals = memory.riderWithdrawals
    .filter((w) => w.riderName === name || (!!nineId && w.rider99Id === nineId))
    .map((w) => {
      const status =
        w.status === "paid" ? { label: "Pago", tone: "OK" } : w.status === "rejected" ? { label: "Recusado", tone: "DANGER" } : { label: "Processando", tone: "WARNING" };
      return {
        title: "Saque",
        subtitle: `PIX${w.pix ? ` ${w.pix}` : ""}${w.station ? ` · ${w.station}` : ""}`,
        amount: `-${brl(w.amount)}`,
        status: status.label,
        tone: status.tone,
        at: w.paidAt ?? w.requestedAt ?? "",
      };
    });
  const payments = memory.walletPayments
    .filter((p) => p.target === "rider" && p.refName === name)
    .map((p) => ({
      title: "Repasse",
      subtitle: p.note || "Repasse de corridas",
      amount: `+${brl(p.amount)}`,
      status: "Disponível",
      tone: "OK",
      at: p.paidAt ?? "",
    }));
  const cashLedger = [...withdrawals, ...payments]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 12)
    .map(({ title, subtitle, amount, status, tone }) => ({ title, subtitle, amount, status, tone }));

  // --- Partners (real geo + services + rider offer) ---
  // Riders see SERVICE partners only (oficina, combustível, celular…);
  // supply-chain vendors (供应商) are back-office and never rider-facing.
  const activePartners = memory.crmPartners.filter(
    (p) => p.status === "Active" && !isSupplierCategory(p.category),
  );
  const partners = activePartners.map((p) => ({
    id: p.id,
    name: p.name,
    neighborhood: p.bairro ?? "",
    category: p.category ?? "",
    services: (p.services ?? []).join(" / "),
    discountBRL: p.riderDiscountBRL ?? 0,
    partnerPoints: p.riderRewardPoints ?? 0,
    distance: "",
    latitude: p.lat ?? 0,
    longitude: p.lng ?? 0,
  }));

  // --- Partner benefits (only partners with an active rider offer) ---
  const partnerBenefits = activePartners
    .filter((p) => (p.riderDiscountBRL ?? 0) > 0 || (p.riderRewardPoints ?? 0) > 0)
    .map((p) => ({
      partner: p.name,
      service: p.services?.[0] ?? p.category ?? "",
      discount: (p.riderDiscountBRL ?? 0) > 0 ? brl(p.riderDiscountBRL as number) : "",
      status: (p.riderRewardPoints ?? 0) > 0 ? `+${p.riderRewardPoints} pts` : "Ativo",
      tone: "OK",
    }));

  // --- Missions (rider/all enabled tasks; progress from claim state) ---
  const claimedTaskIds = new Set(
    memory.taskClaims.filter((c) => c.riderId === rider.id).map((c) => c.taskId),
  );
  const missions = memory.appTasks
    .filter((t) => t.enabled && (t.audience === "rider" || t.audience === "all"))
    .map((t) => ({
      title: t.title,
      reward: `+${t.rewardPoints} pts`,
      progress: claimedTaskIds.has(t.id) ? 1 : 0,
    }));

  // --- Inbox (rider-facing announcements ONLY) ---
  // The notifications collection is seeded from ops incidents; those alerts
  // are internal and must never reach the rider app. Only deliberate System
  // announcements make the cut.
  const inbox = memory.notifications
    .filter((n) => n.source === "System")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 6)
    .map((n) => ({ title: n.title, detail: n.body, time: relativeTime(n.createdAt) }));

  // --- Service points (Ponto locations for the rider Map tab) ---
  const pontos = memory.pontos.map((p) => ({
    id: p.id,
    name: p.name,
    bairro: p.bairro ?? "",
    address: p.address ?? "",
    leader: p.leader ?? "",
    latitude: p.lat ?? 0,
    longitude: p.lng ?? 0,
  }));

  // --- UNIFIED membership tier (rolling-window earned points; the same
  // engine PontoMall uses to price redemptions — one standard everywhere) ---
  const mallConfig = memory.mallConfigs.find((c) => c.id === "mall-config") ?? defaultMallConfig;
  const tier = resolveRiderTierStatus(memory.pointsLedgerEntries, rider.id, mallConfig);

  // --- Mall orders (the rider's own redemptions, newest first) ---
  const mallOrders = memory.marketplaceOrders
    .filter((order) => order.riderId === rider.id)
    .slice(0, 20)
    .map((order) => ({
      id: order.id,
      productName: order.productName ?? order.productId,
      pointsSpent: order.pointsSpent,
      status: order.status,
      createdAt: order.createdAt,
      pickupStoreName: order.pickupStoreName ?? order.station ?? "",
      voucherCode: order.voucherCode ?? "",
    }));

  // --- Mall messages (chegou/retire notices) + eligible coupons ---
  const messages = memory.memberMessages
    .filter((m) => m.riderName === rider.name || m.riderId === rider.id)
    .slice(0, 20)
    .map((m) => ({ id: m.id, title: m.title, body: m.body, createdAt: m.createdAt, read: !!m.readAt }));
  const unreadMessages = messages.filter((m) => !m.read).length;
  const coupons = eligibleCoupons(memory.mallCoupons, memory.marketplaceOrders, rider.id, tier.tier).map((c) => ({
    id: c.id,
    title: c.title,
    type: c.type,
    value: c.value,
    minPoints: c.minPoints,
    expiresAt: c.expiresAt ?? "",
  }));

  return jsonResponse({
    data: {
      performance,
      weeklyGoalProgress,
      cashLedger,
      partners,
      partnerBenefits,
      missions,
      inbox,
      pontos,
      tier,
      mallOrders,
      messages,
      unreadMessages,
      coupons,
    },
  });
}
