import { redirect } from "next/navigation";

/**
 * Deprecated. Rider login is unified into the member page /register (riders are
 * members; login is phone + OTP there). Kept as a redirect so old links/QRs and
 * bookmarks keep working.
 */
export default function RiderLoginRedirect() {
  redirect("/register");
}
