/**
 * Native push via Firebase Cloud Messaging (FCM), using the Firebase Admin SDK.
 *
 * This is the native-app counterpart to the Web Push path in notify.ts. The
 * Android (and future iOS) rider apps register an FCM registration token via
 * POST /api/push { action: "registerToken" }; business events then deliver to
 * those tokens through here.
 *
 * CAPABILITY GATE (off by default):
 *   FCM send only activates when a service-account credential is present in the
 *   environment. With no credential, every call is a clean no-op returning 0 —
 *   the same degrade-gracefully contract as web-push. No build/runtime break.
 *
 * CREDENTIAL (set ONE of these, in the server environment — never committed):
 *   - FIREBASE_SERVICE_ACCOUNT  : the service-account JSON as a single string
 *                                  (or base64 of it).
 *   - GOOGLE_APPLICATION_CREDENTIALS : absolute path to the service-account
 *                                  JSON file (standard Google ADC variable).
 *
 * The service-account key is downloaded by the project owner from
 * Firebase Console → Project settings → Service accounts → Generate new
 * private key, and injected as an env secret. It must NOT live in the repo.
 */

import { memory } from "./memory";

// Loose typing: firebase-admin is imported lazily and may be absent at build
// time, so we avoid a hard type dependency on the package.
type AdminApp = unknown;
type Messaging = {
  sendEachForMulticast(message: {
    tokens: string[];
    notification: { title: string; body: string };
    data?: Record<string, string>;
    android?: { priority?: "high" | "normal"; notification?: { channelId?: string } };
  }): Promise<{ responses: Array<{ success: boolean; error?: { code?: string } }> }>;
};

const globalState = globalThis as typeof globalThis & {
  mepontoFcm?: { app: AdminApp | null; messaging: Messaging | null; initTried: boolean };
};

const fcmState =
  globalState.mepontoFcm ?? (globalState.mepontoFcm = { app: null, messaging: null, initTried: false });

/** Parse the service-account credential from env. Returns null when absent. */
function readServiceAccount(): Record<string, unknown> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  try {
    // Accept either raw JSON or base64-encoded JSON.
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Lazily initialise the Admin SDK Messaging client. Returns null (no-op mode)
 * when the dependency or credential is missing. Never throws.
 */
async function getMessaging(): Promise<Messaging | null> {
  if (fcmState.messaging) return fcmState.messaging;
  if (fcmState.initTried) return fcmState.messaging; // already failed once
  fcmState.initTried = true;

  const hasInlineKey = !!process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  const hasAdcPath = !!process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!hasInlineKey && !hasAdcPath) return null; // capability off

  try {
    // Optional runtime capability. A non-literal specifier keeps TypeScript from
    // resolving firebase-admin at type-check time (typed as any) and keeps the
    // bundler from inlining it, so a missing dependency degrades to "no push"
    // instead of breaking the build (mirrors web-push in notify.ts).
    const moduleName = "firebase-admin";
    const admin = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ moduleName);
    const root = (admin as { default?: unknown }).default ?? admin;
    const a = root as {
      apps: unknown[];
      initializeApp: (opts?: unknown) => AdminApp;
      credential: { cert: (sa: unknown) => unknown; applicationDefault: () => unknown };
      messaging: () => Messaging;
    };

    if (!a.apps || a.apps.length === 0) {
      const sa = readServiceAccount();
      fcmState.app = a.initializeApp(
        sa ? { credential: a.credential.cert(sa) } : { credential: a.credential.applicationDefault() },
      );
    }
    fcmState.messaging = a.messaging();
    return fcmState.messaging;
  } catch {
    return null;
  }
}

/**
 * Send a notification to a set of FCM tokens. Returns the count delivered.
 * Prunes tokens the FCM service reports as unregistered/invalid. Never throws.
 */
export async function sendFcmToTokens(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, string> = {},
): Promise<number> {
  try {
    const unique = [...new Set(tokens.filter(Boolean))];
    if (unique.length === 0) return 0;

    const messaging = await getMessaging();
    if (!messaging) return 0; // capability off / dependency missing

    let sent = 0;
    const dead: string[] = [];
    // Multicast is capped at 500 tokens per call.
    for (let i = 0; i < unique.length; i += 500) {
      const batch = unique.slice(i, i + 500);
      const res = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: { title: title.slice(0, 80), body: body.slice(0, 300) },
        data,
        android: { priority: "high", notification: { channelId: "meponto_default" } },
      });
      res.responses.forEach((r, idx) => {
        if (r.success) {
          sent += 1;
        } else if (
          r.error?.code === "messaging/registration-token-not-registered" ||
          r.error?.code === "messaging/invalid-registration-token" ||
          r.error?.code === "messaging/invalid-argument"
        ) {
          dead.push(batch[idx]);
        }
      });
    }

    // Prune expired/invalid tokens so the store stays clean.
    for (const token of dead) {
      const index = memory.fcmTokens.findIndex((t) => t.token === token);
      if (index !== -1) memory.fcmTokens.splice(index, 1);
    }
    return sent;
  } catch {
    return 0;
  }
}

/** Convenience: send to all FCM tokens registered for one rider name. */
export async function sendFcmToRider(
  riderName: string,
  title: string,
  body: string,
  data: Record<string, string> = {},
): Promise<number> {
  const tokens = memory.fcmTokens.filter((t) => t.riderName === riderName).map((t) => t.token);
  return sendFcmToTokens(tokens, title, body, data);
}
