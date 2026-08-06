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
  if (card.audience === "pro" && pool !== "pro") return false;
  if (card.startsAt && today < card.startsAt) return false;
  if (card.endsAt && today > card.endsAt) return false;
  return true;
}

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
