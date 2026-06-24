import { redirect } from "next/navigation";

/**
 * Deprecated. The web rider PWA is retired in favor of the native MePonto app.
 * Hitting the rider web home now sends people to the app store to install it.
 * (Sub-pages under /rider-app can be redirected the same way if needed.)
 */
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.meponto.rider";

export default function RiderAppDeprecated() {
  redirect(PLAY_STORE_URL);
}
