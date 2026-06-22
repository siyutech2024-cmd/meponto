/**
 * Web Push domain. The rider PWA subscribes via the service worker and HQ
 * sends announcements (new shifts, mall arrivals, payments) through /api/push.
 *
 * VAPID keys identify this server to the push services (FCM/Mozilla/Apple).
 * The public key ships to clients; the private key signs the requests.
 */

export const VAPID_PUBLIC_KEY = "BBrfYE8XSCdsRK_fqup65zKjnnXKI_L9p7De04KxlfFhIhyJnBQ2s0Vp78RmZkmHnS9v4HtMLYwuXfNIr5ESiKo";
/** Demo-grade: kept in code alongside the demo auth model; move to env for production. */
export const VAPID_PRIVATE_KEY = "m20YHi_4MeU6irMCAUlbeRl_6CEHa0k4nhH-XvE8wdQ";
export const VAPID_SUBJECT = "mailto:siyutech2024@gmail.com";

export type PushSubscriptionRecord = {
  id: string;
  riderName: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
  lastSentAt?: string;
};

export const pushSubscriptions: PushSubscriptionRecord[] = [];

/**
 * Native FCM device token (Android/iOS native apps). Distinct from Web Push
 * subscriptions: native clients register a single FCM registration token via
 * POST /api/push { action: "registerToken" }. Delivery goes through the
 * Firebase Admin SDK (see app/lib/server/fcm.ts), gated by the presence of a
 * service-account credential in the environment (off by default).
 */
export type FcmTokenRecord = {
  id: string;
  riderName: string;
  token: string;
  platform: string; // "android" | "ios" | ...
  createdAt: string;
  lastSentAt?: string;
};

export const fcmTokens: FcmTokenRecord[] = [];
