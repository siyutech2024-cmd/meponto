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
  /** Company PIX key shown for hybrid (points + cash) checkout transfers. */
  pixKey?: string;
  /**
   * Redemption guardrails — adjustable from the mall back office. `0` means
   * "no limit" (the operator opts in by entering a positive value).
   * `dailyRedeemCount` and `highValueReviewPoints` default to the previously
   * hard-coded values so existing behavior is preserved.
   */
  dailyRedeemCount?: number;
  dailyRedeemPoints?: number;
  monthlyRedeemPoints?: number;
  highValueReviewPoints?: number;
  newAccountWindowDays?: number;
  newAccountRedeemCap?: number;
  updatedAt: string;
  updatedBy: string;
};

export const defaultMallConfig: MallConfig = {
  id: "mall-config",
  perOrderPoints: 2,
  referralPoints: 20,
  partnerServicePoints: 20,
  partnerServiceCount: 3,
  pixKey: "",
  dailyRedeemCount: 20,
  dailyRedeemPoints: 0,
  monthlyRedeemPoints: 0,
  highValueReviewPoints: 8000,
  newAccountWindowDays: 7,
  newAccountRedeemCap: 0,
  updatedAt: "",
  updatedBy: "seed",
};

export const mallConfigs: MallConfig[] = [defaultMallConfig];

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
