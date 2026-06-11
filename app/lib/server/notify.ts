import { memory } from "./memory";
import { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from "../push";

/**
 * Fire-and-forget web push to one rider's devices (by registered name).
 * Used by business events: mall arrival, withdrawal paid, signup approved.
 * Never throws — push failures must not break the business mutation.
 */
export async function sendPushToRider(riderName: string, title: string, body: string, url = "/rider-app"): Promise<number> {
  try {
    const targets = memory.pushSubscriptions.filter((sub) => sub.riderName === riderName);
    if (targets.length === 0) return 0;
    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    const payload = JSON.stringify({ title: title.slice(0, 80), body: body.slice(0, 300), url });
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
    return sent;
  } catch {
    return 0;
  }
}
