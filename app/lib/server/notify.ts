import { memory } from "./memory";
import { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from "../push";
import { sendFcmToRider } from "./fcm";

/**
 * Fire-and-forget push to one rider's devices (by registered name). Delivers to
 * BOTH Web Push subscriptions (PWA) and native FCM tokens (Android/iOS app).
 * Used by business events: mall arrival, withdrawal paid, signup approved.
 * Never throws — push failures must not break the business mutation.
 * Returns the combined count of devices reached.
 */
export async function sendPushToRider(riderName: string, title: string, body: string, url = "/rider-app"): Promise<number> {
  // Native FCM (no-op when the FCM credential is absent). Runs in parallel with
  // the web-push path below; either side failing must not break the mutation.
  const fcmPromise = sendFcmToRider(riderName, title, body, { url }).catch(() => 0);
  try {
    const targets = memory.pushSubscriptions.filter((sub) => sub.riderName === riderName);
    if (targets.length === 0) return await fcmPromise;
    // web-push is an optional runtime capability. The ignore comments keep the
    // bundler from resolving it at build time, so a missing dependency degrades
    // to "no push" (the outer try/catch returns 0) instead of failing the build.
    const webpush = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "web-push")).default;
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    const payload = JSON.stringify({ title: title.slice(0, 80), body: body.slice(0, 500), url });
    let sent = 0;
    await Promise.all(
      targets.map(async (sub) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
          sent += 1;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            const index = memory.pushSubscriptions.findIndex((s) => s.endpoint === sub.endpoint);
            if (index !== -1) memory.pushSubscriptions.splice(index, 1);
          }
        }
      }),
    );
    return sent + (await fcmPromise);
  } catch {
    return await fcmPromise;
  }
}
