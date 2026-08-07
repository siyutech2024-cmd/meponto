/**
 * App launch (启动页 / splash) configuration, managed from the PontoSys main
 * back office and consumed by the rider apps (web PWA/TWA + native iOS/Android).
 *
 * Both clients fetch `GET /api/app/rider/splash` on every launch, so any change
 * HQ saves here is reflected on the next app start. The field shape mirrors the
 * native `SplashConfig` (ios-rider-app) so one endpoint serves all clients.
 */

/**
 * A4 · 活动入口卡 (rider home banner).
 *
 * Deliberately stored INSIDE the splash record rather than as its own
 * collection: the app-launch config and the activity banner are edited by the
 * same person on the same screen, they are both "what HQ pushes to the app",
 * and a new collection would cost a trackCollection slot for one row of data.
 *
 * Delivered through `rider/home` (payload only ever grows, so old clients keep
 * working and simply don't render the card). Windowing is server-side: an
 * expired card must not depend on the client's clock.
 */
export type AppActivityCard = {
  enabled: boolean;
  title: string;
  subtitle: string;
  /** Corner tag, e.g. "NOVO" / "限时". Empty → no tag drawn. */
  badge: string;
  imageURL: string;
  /** Tap-through. Only *.meponto.com opens in-app (A5 白名单); anything else
   *  is handed to the system browser by the client. */
  linkURL: string;
  /** "pro" = PRO-pool riders only; absent/"all" = everyone. Same gate as splash. */
  audience?: "all" | "pro";
  /** YYYY-MM-DD, inclusive. Empty = open-ended on that side. */
  startsAt?: string;
  endsAt?: string;
};

export const defaultActivityCard: AppActivityCard = {
  enabled: false,
  title: "",
  subtitle: "",
  badge: "",
  imageURL: "",
  linkURL: "",
  audience: "all",
  startsAt: "",
  endsAt: "",
};

/** Server-side window + audience check — never trust the client's clock. */
export function activityCardVisible(card: AppActivityCard | undefined, pool: string, today: string): boolean {
  if (!card?.enabled) return false;
  // 没有标题就不下发。APP 端的卡片是 title + 可选图/角标/副标题,标题为空时
  // 整张卡渲染成一个**空白框** —— 骑手看不出那是入口,运营也看不出哪里错了
  // (后台明明勾了、接口明明返回了)。宁可不下发,也不要给一个看不见的入口。
  if (!card.title?.trim()) return false;
  if (card.audience === "pro" && pool !== "pro") return false;
  if (card.startsAt && today < card.startsAt) return false;
  if (card.endsAt && today > card.endsAt) return false;
  return true;
}

/**
 * 骑手排行榜配置(活动运营用,主后台开关)。
 *
 * 数据口径 = 实时抓取快照(业务方 2026-08-06 定)。注意快照里的 finishedCnt 是
 * **当日累计**,所以每人每天取 MAX,绝不能 SUM —— 一天有十几个批次,SUM 会把
 * 同一个人的单量重复累加,排名彻底失真。周榜 = 7 天各自 MAX 再相加。
 *
 * 一张总榜,PRO 标金(业务方定),显示全名(业务方定)。
 */
export type AppLeaderboardConfig = {
  /** 总开关。关掉后 APP 完全看不到排行榜入口。 */
  enabled: boolean;
  /** 日榜(昨日/今日实时) */
  daily: boolean;
  /** 周榜(本周至今) */
  weekly: boolean;
  /** 榜上显示多少人。骑手自己的名次总是额外附带,哪怕排在榜外。 */
  topN: number;
};

export const defaultLeaderboardConfig: AppLeaderboardConfig = {
  enabled: false,
  daily: true,
  weekly: true,
  topN: 20,
};

export type AppSplashConfig = {
  enabled: boolean;
  headline: string; // brand title, e.g. "MePonto"
  tagline: string; // subtitle / slogan (empty → client default)
  durationMs: number; // how long the splash stays before auto-dismiss
  backgroundHex: string; // "#07090d"
  accentHex: string; // "#ffd100"
  imageURL: string; // optional remote banner/ad image (empty → bundled logo)
  linkURL: string; // optional tap-through for the banner
  /** 模式二 S3: "pro" = only PRO-pool riders receive this splash (server-gated
   *  by session, so even old clients can't show it to the wrong audience);
   *  absent/"all" = everyone. */
  audience?: "all" | "pro";
  /** A4 · 活动入口卡 — see AppActivityCard. Absent on legacy records. */
  activityCard?: AppActivityCard;
  /** 排行榜开关 — see AppLeaderboardConfig. Absent on legacy records. */
  leaderboard?: AppLeaderboardConfig;
  /** Bumped on every save; clients can use it to detect a fresh config. */
  version: number;
  updatedAt?: string;
  updatedBy?: string;
};

export const defaultSplashConfig: AppSplashConfig = {
  enabled: true,
  headline: "MePonto",
  tagline: "",
  durationMs: 2200,
  // Brand-yellow launch (the logo's exact background) + navy ink text — keep
  // in sync with the app-side default (android-rider-app SplashConfig.DEFAULT).
  backgroundHex: "#ffd400",
  accentHex: "#171b33",
  imageURL: "",
  linkURL: "",
  version: 1,
};

/** Persisted as a single fixed-id record so it flows through trackCollection. */
export type AppSplashRecord = AppSplashConfig & { id: "app-splash" };

export const appSplashConfigs: AppSplashRecord[] = [{ id: "app-splash", ...defaultSplashConfig }];
