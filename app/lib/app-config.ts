/**
 * App launch (启动页 / splash) configuration, managed from the PontoSys main
 * back office and consumed by the rider apps (web PWA/TWA + native iOS/Android).
 *
 * Both clients fetch `GET /api/app/rider/splash` on every launch, so any change
 * HQ saves here is reflected on the next app start. The field shape mirrors the
 * native `SplashConfig` (ios-rider-app) so one endpoint serves all clients.
 */

export type AppSplashConfig = {
  enabled: boolean;
  headline: string; // brand title, e.g. "MePonto"
  tagline: string; // subtitle / slogan (empty → client default)
  durationMs: number; // how long the splash stays before auto-dismiss
  backgroundHex: string; // "#07090d"
  accentHex: string; // "#ffd100"
  imageURL: string; // optional remote banner/ad image (empty → bundled logo)
  linkURL: string; // optional tap-through for the banner
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
