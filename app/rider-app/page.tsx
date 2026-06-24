import { redirect } from "next/navigation";

/**
 * Deprecated. The web rider PWA is retired in favor of the native MePonto app.
 * Until the native app is published, send people to the signup/login page.
 * On launch, switch DEST to the Play Store URL:
 *   https://play.google.com/store/apps/details?id=com.meponto.rider
 */
const DEST = "/register";

export default function RiderAppDeprecated() {
  redirect(DEST);
}
