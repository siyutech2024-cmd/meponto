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
    label: "注册会员",
    minOrders: null,
    pointsMultiplier: 1,
    redeemDiscount: 1,
    birthdayPoints: 0,
    perks: ["商城浏览与基础兑换资格", "班次报名资格", "活动通知"],
  },
  {
    tier: "bronze",
    label: "铜牌会员",
    minOrders: 1,
    pointsMultiplier: 1,
    redeemDiscount: 1,
    birthdayPoints: 0,
    perks: ["每完单自动累积积分", "完整商城兑换资格"],
  },
  {
    tier: "prata",
    label: "银牌会员",
    minOrders: 100,
    pointsMultiplier: 1.05,
    redeemDiscount: 1,
    birthdayPoints: 50,
    perks: ["积分累积 +5%", "生日礼 50 分", "报名审核优先"],
  },
  {
    tier: "ouro",
    label: "金牌会员",
    minOrders: 300,
    pointsMultiplier: 1.1,
    redeemDiscount: 0.95,
    birthdayPoints: 100,
    perks: ["积分累积 +10%", "兑换 95 折", "生日礼 100 分", "重点班次优先排班"],
  },
  {
    tier: "diamante",
    label: "钻石会员",
    minOrders: 600,
    pointsMultiplier: 1.15,
    redeemDiscount: 0.9,
    birthdayPoints: 200,
    perks: ["积分累积 +15%", "兑换 9 折", "生日礼 200 分", "专属运营支持", "新品优先兑换"],
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
