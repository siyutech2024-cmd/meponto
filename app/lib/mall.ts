/**
 * PontoMall — points mall domain: accrual config, membership tiers and
 * benefit schedule.
 *
 * Points accrual (configurable from HQ):
 * - perOrderPoints: every completed order earns N points (auto-credited when
 *   the T+1 Eastwind report is imported).
 * - referralPoints: inviting a rider who registers (QR / invite code).
 * - partnerServicePoints / partnerServiceCount: a partner earns N points
 *   after completing M services.
 *
 * Membership:
 * - Everyone becomes a basic member at registration (会员).
 * - A rider only becomes a TIERED member once they appear in imported
 *   Eastwind data; tier is driven by lifetime completed orders.
 */

export type MallConfig = {
  id: string; // "mall-config"
  perOrderPoints: number;
  referralPoints: number;
  partnerServicePoints: number;
  partnerServiceCount: number;
  /** Money equivalence: how many points equal R$1 (redemption/GMV reference). */
  pointsPerBrl?: number;
  /** Base birthday gift granted to EVERY member (tiers may grant more). */
  birthdayBasePoints?: number;
  /** Company PIX key shown for hybrid (points + cash) checkout transfers. */
  pixKey?: string;
  /** Points awarded per station check-in (rider app QR scan, 1×/day/station). */
  checkinPoints?: number;
  /** Tier window in days; 0 = lifetime cumulative (the default). */
  tierWindowDays?: number;
  /** 模式二 T3 · HqProRate: R$ per PRO completed order for the HQ→franchise
   *  settlement (v3.0 R5: 8月=12/单, monthly config, corrections roll into the
   *  next month's adjustment line). Changing it is money-sensitive → audited. */
  hqProRatePerOrder?: number;
  /** Inactivity decay: after [decayGraceDays] with no earning, available
   *  points shrink by [decayPointsPerDay] per idle day (ledgered, tier-safe). */
  decayGraceDays?: number;
  decayPointsPerDay?: number;
  tierPrataEarned?: number;
  tierOuroEarned?: number;
  tierDiamanteEarned?: number;
  /**
   * Redemption guardrails — adjustable from the mall back office. `0` means
   * "no limit" (the operator opts in by entering a positive value).
   * `dailyRedeemCount` and `highValueReviewPoints` default to the previously
   * hard-coded values so existing behavior is preserved.
   */
  dailyRedeemCount?: number;
  dailyRedeemPoints?: number;
  /** Points deducted per shift no-show beyond the free allowance (0 = off). */
  noShowPenaltyPoints?: number;
  monthlyRedeemPoints?: number;
  highValueReviewPoints?: number;
  newAccountWindowDays?: number;
  newAccountRedeemCap?: number;
  /**
   * Franchise procurement (docs/franchise-procurement-full-chain-plan.md).
   * `procurementEnabled` gates NEW orders only — in-flight FPOs always finish.
   * `procurementFrozen` is the emergency stop (blocks every procurement write).
   */
  procurementEnabled?: boolean;
  procurementFrozen?: boolean;
  /** FPOs at or below this total auto-approve (0/undefined = manual approval for all). */
  procurementAutoApproveBRL?: number;
  /** Single-FPO total cap (0/undefined = no cap). */
  procurementMaxOrderBRL?: number;
  /** Days after shipping before an FPO is flagged as stalled in the back office. */
  procurementShipTimeoutDays?: number;
  /** M3: redemption orders reserve/consume station stock pools. Default off. */
  stationStockEnforcement?: boolean;
  updatedAt: string;
  updatedBy: string;
};

export const defaultMallConfig: MallConfig = {
  id: "mall-config",
  perOrderPoints: 2,
  referralPoints: 20,
  partnerServicePoints: 20,
  partnerServiceCount: 3,
  pointsPerBrl: 10,
  birthdayBasePoints: 50,
  pixKey: "",
  checkinPoints: 10,
  tierWindowDays: 0,
  hqProRatePerOrder: 12, // 模式二 8月费率:R$12 / PRO 完单
  decayGraceDays: 30,
  decayPointsPerDay: 5,
  tierPrataEarned: 2000,
  tierOuroEarned: 6000,
  tierDiamanteEarned: 15000,
  dailyRedeemCount: 20,
  dailyRedeemPoints: 0,
  noShowPenaltyPoints: 50,
  monthlyRedeemPoints: 0,
  highValueReviewPoints: 8000,
  newAccountWindowDays: 7,
  newAccountRedeemCap: 0,
  // Franchise procurement ships disabled (Hard Rule #3 — flag off by default).
  procurementEnabled: false,
  procurementFrozen: false,
  procurementAutoApproveBRL: 0,
  procurementMaxOrderBRL: 0,
  procurementShipTimeoutDays: 7,
  stationStockEnforcement: false,
  updatedAt: "",
  updatedBy: "seed",
};

export const mallConfigs: MallConfig[] = [defaultMallConfig];

/** Achievement badges driven by lifetime completed orders (Eastwind data). */
export const badgeMilestones = [
  { at: 1, icon: "🚀", label: "Primeira entrega" },
  { at: 50, icon: "🔥", label: "50 pedidos" },
  { at: 100, icon: "💪", label: "100 pedidos" },
  { at: 300, icon: "🏅", label: "300 pedidos" },
  { at: 600, icon: "👑", label: "600 pedidos" },
  { at: 1000, icon: "🏆", label: "1000 pedidos" },
  { at: 2000, icon: "💎", label: "2000 pedidos" },
  { at: 5000, icon: "🌟", label: "Lenda 5000" },
];

/**
 * Achievement badges beyond the lifetime-orders track — computed from the
 * rider's real metrics (hours online, acceptance rate, tenure, night shifts).
 * Keeps the same {at, icon, label, achieved} shape the app renders. `at` is a
 * nominal sort weight for non-order badges. (More badges — 2026-07-21.)
 */
export function extraBadges(m: {
  onlineHours: number;
  acceptanceRate: number; // 0..100
  tenureDays: number;
  nightShifts: number;
  weekOrders: number;
}) {
  return [
    { at: 100, icon: "⏱️", label: "100h online", achieved: m.onlineHours >= 100 },
    { at: 500, icon: "🕐", label: "500h online", achieved: m.onlineHours >= 500 },
    { at: 1000, icon: "⚡", label: "1000h online", achieved: m.onlineHours >= 1000 },
    { at: 90, icon: "🎯", label: "Aceite 90%+", achieved: m.acceptanceRate >= 90 },
    { at: 98, icon: "✅", label: "Aceite 98%+", achieved: m.acceptanceRate >= 98 },
    { at: 30, icon: "📅", label: "1 mês na base", achieved: m.tenureDays >= 30 },
    { at: 180, icon: "🗓️", label: "6 meses na base", achieved: m.tenureDays >= 180 },
    { at: 365, icon: "🎖️", label: "1 ano na base", achieved: m.tenureDays >= 365 },
    { at: 10, icon: "🌙", label: "10 turnos noturnos", achieved: m.nightShifts >= 10 },
    { at: 40, icon: "📦", label: "40 pedidos/semana", achieved: m.weekOrders >= 40 },
  ];
}

export type MembershipTier = "member" | "bronze" | "prata" | "ouro" | "diamante";

export type TierDefinition = {
  tier: MembershipTier;
  label: string;
  /** Lifetime completed orders (from imported Eastwind data) required. */
  minOrders: number | null; // null = registration only
  /** Multiplier applied to per-order points accrual. */
  pointsMultiplier: number;
  /** Discount on redemption points price (1 = full price). */
  redeemDiscount: number;
  /** Birthday bonus points (credited by ops on birthday month). */
  birthdayPoints: number;
  perks: string[];
};

/**
 * Benefit schedule — intentionally conservative so the program costs little:
 * multipliers top out at +15% and redemption discounts at 10%, and both only
 * reach riders who already deliver large volumes.
 */
export const tierDefinitions: TierDefinition[] = [
  {
    tier: "member",
    label: "Membro",
    minOrders: null,
    pointsMultiplier: 1,
    redeemDiscount: 1,
    birthdayPoints: 0,
    perks: ["Acesso à loja e resgates básicos", "Inscrição em turnos", "Avisos e novidades"],
  },
  {
    tier: "bronze",
    label: "Bronze",
    minOrders: 1,
    pointsMultiplier: 1,
    redeemDiscount: 1,
    birthdayPoints: 0,
    perks: ["Pontos a cada entrega concluída", "Resgate completo na loja"],
  },
  {
    tier: "prata",
    label: "Prata",
    minOrders: 100,
    pointsMultiplier: 1.05,
    redeemDiscount: 1,
    birthdayPoints: 50,
    perks: ["Pontos +5%", "Presente de aniversário: 50 pts", "Prioridade na inscrição em turnos"],
  },
  {
    tier: "ouro",
    label: "Ouro",
    minOrders: 300,
    pointsMultiplier: 1.1,
    redeemDiscount: 0.95,
    birthdayPoints: 100,
    perks: ["Pontos +10%", "5% de desconto nos resgates", "Presente de aniversário: 100 pts", "Prioridade em turnos premium"],
  },
  {
    tier: "diamante",
    label: "Diamante",
    minOrders: 600,
    pointsMultiplier: 1.15,
    redeemDiscount: 0.9,
    birthdayPoints: 200,
    perks: ["Pontos +15%", "10% de desconto nos resgates", "Presente de aniversário: 200 pts", "Suporte dedicado", "Resgate antecipado de novidades"],
  },
];

/** Resolve tier from lifetime completed orders; null orders = never imported. */
export function resolveTier(lifetimeOrders: number | null): TierDefinition {
  if (lifetimeOrders === null || lifetimeOrders <= 0) return tierDefinitions[0];
  let result = tierDefinitions[1];
  for (const definition of tierDefinitions) {
    if (definition.minOrders !== null && lifetimeOrders >= definition.minOrders) result = definition;
  }
  return result;
}

// ---------------------------------------------------------------------------
// UNIFIED tier standard (the single source both PontoMall pricing and the
// rider app display use): points EARNED in a rolling window. Earning maps to
// real work (deliveries, check-ins, missions — all append-only ledger entries),
// spending never demotes, and the ledger makes the score tamper-resistant.
// Thresholds/window are operator-tunable in MallConfig.
// ---------------------------------------------------------------------------

// Coupon eligibility (pure — shared by the mall storefront and /rider/home).
type CouponLike = {
  id: string;
  minTier: string;
  perRiderLimit: number;
  active: boolean;
  expiresAt?: string;
};
type OrderLike = { couponId?: string; riderId?: string; status: string };

export function couponTierRank(name: string): number {
  return tierDefinitions.findIndex((t) => t.tier === name);
}

/** Coupons a rider is eligible for (tier + validity + per-rider limit). */
export function eligibleCoupons<T extends CouponLike>(
  coupons: T[],
  orders: OrderLike[],
  riderId: string,
  tierName: string,
  today: string = new Date().toISOString().slice(0, 10),
): T[] {
  const riderRank = couponTierRank(tierName);
  return coupons.filter((c) => {
    if (!c.active) return false;
    if (c.expiresAt && c.expiresAt < today) return false;
    if (riderRank < couponTierRank(c.minTier)) return false;
    if (c.perRiderLimit > 0) {
      const used = orders.filter((o) => o.couponId === c.id && o.riderId === riderId && o.status !== "cancelled").length;
      if (used >= c.perRiderLimit) return false;
    }
    return true;
  });
}

export type RiderTierStatus = {
  tier: MembershipTier;
  label: string;
  /** Points earned (approved, earn-side) inside the rolling window. */
  earnedInWindow: number;
  /** Points still needed to reach the next tier; null at the top. */
  nextTierAt: number | null;
  nextTierLabel: string | null;
  redeemDiscount: number;
  pointsMultiplier: number;
  perks: string[];
  windowDays: number;
};

type TierLedgerEntry = { riderId: string; type: string; status: string; points: number; createdAt: string };

const EARN_SIDE = new Set(["earn", "refund", "release"]);

export function tierThresholds(config: MallConfig): Array<{ def: TierDefinition; minEarned: number | null }> {
  return [
    { def: tierDefinitions[0], minEarned: null },
    { def: tierDefinitions[1], minEarned: 1 },
    { def: tierDefinitions[2], minEarned: config.tierPrataEarned ?? 2000 },
    { def: tierDefinitions[3], minEarned: config.tierOuroEarned ?? 6000 },
    { def: tierDefinitions[4], minEarned: config.tierDiamanteEarned ?? 15000 },
  ];
}

export function resolveRiderTierStatus(
  entries: TierLedgerEntry[],
  riderId: string,
  config: MallConfig,
  now: Date = new Date(),
): RiderTierStatus {
  // Tier = CUMULATIVE earned points (lifetime by default; tierWindowDays > 0
  // opts into a rolling window). Spending or inactivity decay never demotes —
  // only the earn side counts.
  const windowDays = config.tierWindowDays ?? 0;
  const cutoff = windowDays > 0
    ? new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 16).replace("T", " ")
    : "";
  const earned = entries.reduce((sum, e) => {
    if (e.riderId !== riderId || e.status !== "approved" || !EARN_SIDE.has(e.type)) return sum;
    if (cutoff && (e.createdAt ?? "") < cutoff) return sum;
    return sum + Math.max(0, e.points);
  }, 0);

  const ladder = tierThresholds(config);
  let current = ladder[0];
  for (const step of ladder) {
    if (step.minEarned !== null && earned >= step.minEarned) current = step;
  }
  const next = ladder[ladder.indexOf(current) + 1] ?? null;
  return {
    tier: current.def.tier,
    label: current.def.label,
    earnedInWindow: earned,
    nextTierAt: next?.minEarned ?? null,
    nextTierLabel: next?.def.label ?? null,
    redeemDiscount: current.def.redeemDiscount,
    pointsMultiplier: current.def.pointsMultiplier,
    perks: current.def.perks,
    windowDays,
  };
}
