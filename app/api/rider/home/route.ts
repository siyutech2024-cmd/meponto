import { jsonResponse, memory } from "../../../lib/server/memory";
import { refreshCollectionsFromDatabase } from "../../../lib/server/persistence";
import { sessionFromRequest } from "../../../lib/auth-session";
import { badgeMilestones, defaultMallConfig, eligibleCoupons, extraBadges, resolveRiderTierStatus, tierThresholds } from "../../../lib/mall";
import { applyInactivityDecay, getAvailablePoints, type PointsLedgerEntry } from "../../../lib/points";
import { taskProgress } from "../../../lib/tasks";
import { isSupplierCategory } from "../../../lib/server/crm-categories";
import { dbDirectReadEnabled, fetchRows } from "../../../lib/server/db-read";
import type { RiderDailyKpi } from "../../../lib/performance";
import { kpisByRider99, kpisByRiderName, perfMode } from "../../../lib/server/db/performance-repo";

/**
 * Rider Home dashboard aggregate (session-scoped). One read powering the
 * native/PWA Home + Wallet + Map dashboards from REAL collections — no mock.
 * Every section degrades to an empty array / null when its source has no data,
 * so the client hides that section instead of showing fabricated figures.
 *
 *   performance        ← riderDailyKpis (latest + week aggregate)
 *   weeklyGoalProgress ← riderDailyKpis online hours vs a 40h week
 *   cashLedger         ← riderWithdrawals (outflow) + walletPayments (inflow)
 *                        + cashLedgerEntries (PontoMall cash: topup/spend/
 *                        refund/adjust with balance snapshot + source id)
 *   partners           ← crmPartners (name / category / bairro / services / geo)
 *   missions           ← appTasks (rider/all, enabled) + taskClaims (progress)
 *   inbox              ← memberMessages addressed to the rider (ops
 *                        notifications NEVER surface in the rider app)
 *   pontos             ← pontos (service-point name / address / geo for the Map)
 */

const COLLECTIONS = [
  "riders",
  "riderDailyKpis",
  "riderWithdrawals",
  "walletPayments",
  "crmPartners",
  "appTasks",
  "taskClaims",
  "pontos",
  "pointsLedgerEntries",
  "marketplaceOrders",
  "mallConfigs",
  "memberMessages",
  "mallCoupons",
  "cashLedgerEntries",
  "slotEnrollments",
];

// GET-path split (perf(riders api) pattern): tiny actively-mutated collections
// refresh on every read; the GIANT ones re-download at most once a minute per
// instance. `pointsLedgerEntries` (the biggest hot collection — it drives the
// points balance riders wait for after login) and `riderDailyKpis` are served
// by L2 rider-scoped direct reads when READPATH_DB_DIRECT is on, so they drop
// out of the wholesale refresh entirely on that path.
const HOT_COLLECTIONS = ["riders", "appTasks", "taskClaims", "mallConfigs", "mallCoupons", "slotEnrollments"];
const HEAVY_TTL_MS = 60_000;
let heavyRefreshedAt = 0;

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
  // L2 direct read: this rider's KPI + points-ledger rows come straight from
  // the database (rider-scoped, a few hundred rows) — riderDailyKpis and
  // pointsLedgerEntries are the biggest collections this route used to hydrate
  // wholesale on every APP home load.
  const direct = dbDirectReadEnabled();
  const wantHeavy = Date.now() - heavyRefreshedAt > HEAVY_TTL_MS;
  const wanted = wantHeavy ? COLLECTIONS : HOT_COLLECTIONS;
  await refreshCollectionsFromDatabase(direct ? wanted.filter((c) => c !== "riderDailyKpis" && c !== "pointsLedgerEntries") : wanted);
  if (wantHeavy) heavyRefreshedAt = Date.now();

  const rider = findRider(session);
  if (!rider) return jsonResponse({ error: "Cadastro não encontrado.", code: "not_found" }, { status: 404 });
  const name = rider.name;
  const nineId = rider.ninetyNineId ?? "";

  // --- Performance (latest KPI for rates, week sum for totals) ---
  let kpiRows: RiderDailyKpi[] | null = null;
  if (direct) {
    try {
      // Legacy semantics: match by riderName OR rider99Id → two scoped
      // fetches, merged unique by row id. M1 read switch: fact table when
      // CORE_MODE_PERF=read (docs/data-core-cure-plan.md W2).
      const factRead = perfMode() === "read";
      const [byName, byId] = await Promise.all([
        factRead
          ? kpisByRiderName(name)
          : fetchRows<RiderDailyKpi>("riderDailyKpis", [{ op: "eq", field: "riderName", value: name }]),
        !nineId
          ? Promise.resolve([] as RiderDailyKpi[])
          : factRead
            ? kpisByRider99(nineId)
            : fetchRows<RiderDailyKpi>("riderDailyKpis", [{ op: "eq", field: "rider99Id", value: nineId }]),
      ]);
      const seen = new Map<string, RiderDailyKpi>();
      for (const row of [...byName, ...byId]) seen.set(row.id, row);
      kpiRows = [...seen.values()];
    } catch (error) {
      console.warn(`[rider/home] direct kpi read failed, legacy path. (${(error as Error).message})`);
    }
  }
  if (!kpiRows) {
    await refreshCollectionsFromDatabase(["riderDailyKpis"]);
    kpiRows = memory.riderDailyKpis.filter((k) => k.riderName === name || (!!nineId && k.rider99Id === nineId));
  }
  const kpis = kpiRows.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first

  // --- Points ledger view (rider-scoped) ---
  // Direct path: fetch ONLY this rider's ledger rows (indexed, one round
  // trip) instead of re-downloading the whole append-only ledger. Rows that
  // exist only in this instance's memory (just-appended, not flushed yet) are
  // overlaid on top so we always read our own writes.
  let ledgerView: PointsLedgerEntry[] | null = null;
  if (direct) {
    try {
      ledgerView = await fetchRows<PointsLedgerEntry>("pointsLedgerEntries", [{ op: "eq", field: "riderId", value: rider.id }]);
    } catch (error) {
      console.warn(`[rider/home] direct ledger read failed, legacy path. (${(error as Error).message})`);
    }
  }
  if (!ledgerView) {
    await refreshCollectionsFromDatabase(["pointsLedgerEntries"]);
    ledgerView = memory.pointsLedgerEntries.filter((entry) => entry.riderId === rider.id);
  }
  /** Merge memory-only entries (e.g. decay appended below) into the view. */
  const mergedLedger = () => {
    const seen = new Set(ledgerView!.map((entry) => entry.id));
    const localOnly = memory.pointsLedgerEntries.filter((entry) => entry.riderId === rider.id && !seen.has(entry.id));
    return localOnly.length === 0 ? ledgerView! : [...localOnly, ...ledgerView!];
  };

  const mallConfig = memory.mallConfigs.find((c) => c.id === "mall-config") ?? defaultMallConfig;
  // Inactivity decay first (append-only, idempotent per day), THEN every
  // ledger-derived read — decay shrinks the balance but never the
  // cumulative-earned tier score. Decay must be COMPUTED on the fresh
  // rider-scoped view (stale memory could see an old lastEarn and decay a
  // rider who just earned on a sibling instance); the resulting entry is then
  // copied into the TRACKED collection so it persists.
  const riderLedger = mergedLedger();
  const decayedNow = applyInactivityDecay(riderLedger, rider.id, mallConfig);
  if (decayedNow > 0 && riderLedger[0] && !memory.pointsLedgerEntries.some((e) => e.id === riderLedger[0].id)) {
    memory.pointsLedgerEntries.unshift(riderLedger[0]);
  }
  // Read-only ledger sum (same math as PontoMall me.balance) — never mutated.
  const pointsAvailable = getAvailablePoints(riderLedger, rider.id);
  const latest = kpis[0];
  // Every KPI block reads the LATEST imported day (T+1 = yesterday): orders,
  // TSH hours, acceptance rate and cancellations all describe the same day,
  // matching what the rider remembers doing.
  // Complete latest-day KPI. NOTE: tsh/ar/caa are PERCENTAGES in the T+1
  // report; onlineHours is the actual hours figure. (tshHours used to carry
  // the tsh percent — v1.3 displayed it as hours. It now carries real hours
  // so older clients render correctly; tshPercent is the explicit new field.)
  const week = kpis.filter((k) => k.date > new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10));
  const performance = latest
    ? {
        date: latest.date,
        orders: latest.completedOrders ?? 0,
        tshHours: latest.onlineHours ?? 0,
        onlineHours: latest.onlineHours ?? 0,
        tshPercent: latest.tsh,
        acceptanceRate: Math.round(latest.ar ?? 0),
        // cancelledOrders is typed Int on the app (Moshi): a fractional caa
        // (e.g. 5.9) made the WHOLE /rider/home parse throw, so the KPI panel —
        // and every home section — vanished on any rider whose latest CAA was
        // not a whole number (field report 2026-07-20). The exact decimal is
        // carried by caaPercent; keep this one integer for legacy clients.
        cancelledOrders: Math.round(latest.caa ?? 0),
        caaPercent: latest.caa,
        overtimePercent: latest.overtime,
        weekOrders: week.reduce((s2, k) => s2 + (k.completedOrders ?? 0), 0),
        weekOnlineHours: Math.round(week.reduce((s2, k) => s2 + (k.onlineHours ?? 0), 0) * 10) / 10,
      }
    : null;
  const onlineHoursWeek = kpis.slice(0, 7).reduce((s, k) => s + (k.onlineHours ?? 0), 0);
  const weeklyGoalProgress = kpis.length ? Math.min(100, Math.round((onlineHoursWeek / 40) * 100)) : 0;

  // --- Cash ledger, newest first. Three REAL sources merged: ---
  //   riderWithdrawals   (saque, outflow)
  //   walletPayments     (repasse, inflow)
  //   cashLedgerEntries  (PontoMall cash account: topup/spend/refund/adjust,
  //                       immutable ledger with balance snapshot + source id)
  // Every item keeps the legacy {title, subtitle, amount, status, tone} shape
  // (older APP builds) and adds {at, type, balanceAfter, sourceId} for the
  // richer statement view (date-time, signed amount, snapshot, 单号).
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
        type: "withdrawal",
        balanceAfter: null as number | null,
        sourceId: w.id,
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
      type: "payout",
      balanceAfter: null as number | null,
      sourceId: p.id,
    }));
  const cashTypeMeta: Record<string, { title: string; tone: string }> = {
    topup: { title: "Recarga", tone: "OK" },
    spend: { title: "Compra", tone: "DANGER" },
    refund: { title: "Reembolso", tone: "OK" },
    adjust: { title: "Ajuste", tone: "WARNING" },
  };
  let cashTotalBRL = 0;
  const mallCash = memory.cashLedgerEntries
    .filter((entry) => entry.riderId === rider.id)
    .map((entry) => {
      const negative = entry.type === "spend" || entry.amountBRL < 0;
      const meta = cashTypeMeta[entry.type] ?? { title: entry.type, tone: "WARNING" };
      return {
        title: meta.title,
        subtitle: entry.note || (entry.sourceId ? `Ref ${entry.sourceId}` : ""),
        amount: `${negative ? "-" : "+"}${brl(entry.amountBRL)}`,
        status: `Saldo ${brl(entry.balanceAfter)}`,
        tone: meta.tone,
        at: entry.createdAt ?? "",
        type: entry.type,
        balanceAfter: entry.balanceAfter as number | null,
        sourceId: entry.sourceId,
      };
    });
  for (const entry of memory.cashLedgerEntries) {
    if (entry.riderId !== rider.id) continue;
    cashTotalBRL += entry.type === "spend" ? -entry.amountBRL : entry.amountBRL;
  }
  cashTotalBRL = Math.round(cashTotalBRL * 100) / 100;
  const cashLedger = [...withdrawals, ...payments, ...mallCash]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 20);

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

  // --- Missions (rider/all enabled tasks; LIVE progress from real metrics —
  // same shared engine as /api/tasks, fed with the fresh rider-scoped KPI and
  // ledger views instead of a claimed/not-claimed binary) ---
  const claimedTaskIds = new Set(
    memory.taskClaims.filter((c) => c.riderId === rider.id).map((c) => c.taskId),
  );
  const missionSources = {
    riderDailyKpis: kpis,
    pointsLedgerEntries: riderLedger,
    marketplaceOrders: memory.marketplaceOrders,
    slotEnrollments: memory.slotEnrollments,
  };
  const missions = memory.appTasks
    .filter((t) => t.enabled && (t.audience === "rider" || t.audience === "all"))
    .map((t) => {
      const done = taskProgress(t, rider, missionSources);
      return {
        title: t.title,
        reward: `+${t.rewardPoints} pts`,
        // Fraction 0..1 (legacy shape); claimed tasks stay pinned at 1.
        progress: claimedTaskIds.has(t.id) ? 1 : Math.min(1, done / Math.max(1, t.target)),
        current: done,
        target: t.target,
        claimed: claimedTaskIds.has(t.id),
      };
    });

  // --- Inbox: messages addressed to THIS rider only (memberMessages —
  // chegou/retire notices, HQ direct messages). The ops notifications
  // collection (review nudges, incident alerts) is console-internal and is
  // NEVER surfaced in the rider app, whatever its source flag says.
  // Auto-expire: notices older than 7 days disappear (field feedback
  // 2026-07-17 — stale "welcome"/"test" notices were piling up on Início).
  const inboxCutoff = Date.now() - 7 * 24 * 3600_000;
  const inbox = memory.memberMessages
    .filter((m) => m.riderName === rider.name || m.riderId === rider.id)
    .filter((m) => {
      const t = Date.parse(m.createdAt);
      return Number.isNaN(t) || t >= inboxCutoff;
    })
    .slice(0, 6)
    .map((m) => ({ title: m.title, detail: m.body, time: relativeTime(m.createdAt) }));

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
  const tier = {
    ...resolveRiderTierStatus(riderLedger, rider.id, mallConfig),
    ladder: tierThresholds(mallConfig).map((s) => ({ tier: s.def.tier, label: s.def.label, minEarned: s.minEarned ?? 0 })),
  };

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

  // --- Achievement badges: lifetime-orders track + hours / acceptance /
  // tenure / night-shift / weekly badges, all from the rider's real metrics. ---
  const lifetimeOrders = kpis.reduce((s2, k) => s2 + (k.completedOrders ?? 0), 0);
  const lifetimeHours = Math.round(kpis.reduce((s2, k) => s2 + (k.onlineHours ?? 0), 0));
  const bestAr = kpis.reduce((mx, k) => Math.max(mx, k.ar ?? 0), 0);
  const tenureDays = rider.joinDate ? Math.max(0, Math.floor((Date.now() - Date.parse(rider.joinDate)) / 864e5)) : 0;
  const weekOrdersForBadge = week.reduce((s2, k) => s2 + (k.completedOrders ?? 0), 0);
  const badges = [
    ...badgeMilestones.map((m) => ({ ...m, achieved: lifetimeOrders >= m.at })),
    ...extraBadges({
      onlineHours: lifetimeHours,
      acceptanceRate: bestAr,
      tenureDays,
      nightShifts: rider.nightShiftCount ?? 0,
      weekOrders: weekOrdersForBadge,
    }),
  ];

  // --- Mall messages (chegou/retire notices) + eligible coupons ---
  // Same 7-day auto-expiry as the Início inbox.
  const messages = memory.memberMessages
    .filter((m) => m.riderName === rider.name || m.riderId === rider.id)
    .filter((m) => {
      const t = Date.parse(m.createdAt);
      return Number.isNaN(t) || t >= inboxCutoff;
    })
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
      // Second performance source (both shown in the app): the rider-status
      // scraper aggregate stored on the roster record.
      statusTotals: (rider.totalOrders ?? 0) > 0 || (rider.onlineHours ?? 0) > 0
        ? {
            totalOrders: rider.totalOrders ?? 0,
            onlineHours: rider.onlineHours ?? 0,
            ar: rider.reportAr ?? rider.ar ?? 0,
            lastReportDate: rider.lastReportDate ?? "",
          }
        : null,
      // Derived from the points-economy money equivalence (R$1 = pointsPerBrl pts).
      pointCashRateBRL: (mallConfig.pointsPerBrl ?? 0) > 0 ? 1 / (mallConfig.pointsPerBrl as number) : 0,
      weeklyGoalProgress,
      // Points balance (same ledger math as PontoMall `me.balance`) so the APP
      // home can show pontos without a second round trip to /api/mall.
      pointsBalance: pointsAvailable,
      // PontoMall cash account balance (immutable cashLedgerEntries sum).
      cashBalance: cashTotalBRL,
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
      badges,
    },
  });
}
