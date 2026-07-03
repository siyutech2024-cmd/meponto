import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission, roleFromRequest } from "../../lib/server/authz";
import { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT, type PushSubscriptionRecord, type FcmTokenRecord } from "../../lib/push";
import { sendFcmToTokens } from "../../lib/server/fcm";

const COLLECTIONS = ["pushSubscriptions", "fcmTokens"];
const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("publicKey") !== null) {
    return jsonResponse({ data: { publicKey: VAPID_PUBLIC_KEY } });
  }
  const forbidden = requirePermission(request, "view_audit");
  if (forbidden) return forbidden;
  await refreshCollectionsFromDatabase(COLLECTIONS);
  // Devices = Web Push subscriptions (PWA) + native FCM tokens (Android/iOS).
  const riders = [...new Set([...memory.pushSubscriptions.map((s) => s.riderName), ...memory.fcmTokens.map((t) => t.riderName)])].filter(Boolean).sort();
  return jsonResponse({
    data: {
      count: memory.pushSubscriptions.length + memory.fcmTokens.length,
      webCount: memory.pushSubscriptions.length,
      fcmCount: memory.fcmTokens.length,
      riders,
    },
  });
}

type Body =
  | { action: "subscribe"; riderName: string; subscription: { endpoint: string; keys: { p256dh: string; auth: string } } }
  | { action: "unsubscribe"; endpoint: string }
  | { action: "registerToken"; token: string; riderName?: string; platform?: string }
  | { action: "unregisterToken"; token: string }
  | { action: "send"; title: string; body: string; url?: string; riderName?: string; imageUrl?: string };

async function handlePost(request: Request) {
  await refreshCollectionsFromDatabase(COLLECTIONS);
  const body = (await request.json().catch(() => ({}))) as Partial<Body> & Record<string, unknown>;
  const actor = roleFromRequest(request);

  switch (body.action) {
    case "subscribe": {
      // Open endpoint — the rider app registers its own device.
      const { riderName, subscription } = body as { riderName?: string; subscription?: { endpoint: string; keys: { p256dh: string; auth: string } } };
      if (!riderName?.trim() || !subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
        return jsonResponse({ error: "riderName and subscription are required" }, { status: 400 });
      }
      const existing = memory.pushSubscriptions.findIndex((s) => s.endpoint === subscription.endpoint);
      const record: PushSubscriptionRecord = {
        id: existing !== -1 ? memory.pushSubscriptions[existing].id : makeServerId("psub", memory.pushSubscriptions.length + 1),
        riderName: riderName.trim().slice(0, 80),
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
        createdAt: existing !== -1 ? memory.pushSubscriptions[existing].createdAt : nowStamp(),
      };
      if (existing !== -1) memory.pushSubscriptions[existing] = record;
      else memory.pushSubscriptions.unshift(record);
      return jsonResponse({ data: { ok: true } }, { status: 201 });
    }

    case "unsubscribe": {
      const { endpoint } = body as { endpoint?: string };
      const index = memory.pushSubscriptions.findIndex((s) => s.endpoint === endpoint);
      if (index !== -1) memory.pushSubscriptions.splice(index, 1);
      return jsonResponse({ data: { ok: true } });
    }

    case "registerToken": {
      // Open endpoint — native apps (Android/iOS) register their FCM token.
      const { token, riderName, platform } = body as { token?: string; riderName?: string; platform?: string };
      if (!token?.trim()) return jsonResponse({ error: "token is required" }, { status: 400 });
      const existing = memory.fcmTokens.findIndex((t) => t.token === token);
      const record: FcmTokenRecord = {
        id: existing !== -1 ? memory.fcmTokens[existing].id : makeServerId("fcm", memory.fcmTokens.length + 1),
        riderName: (riderName ?? "").trim().slice(0, 80),
        token: token.trim(),
        platform: (platform ?? "android").trim().slice(0, 16),
        createdAt: existing !== -1 ? memory.fcmTokens[existing].createdAt : nowStamp(),
      };
      if (existing !== -1) memory.fcmTokens[existing] = record;
      else memory.fcmTokens.unshift(record);
      return jsonResponse({ data: { id: record.id, status: "ok" } }, { status: 201 });
    }

    case "unregisterToken": {
      const { token } = body as { token?: string };
      const index = memory.fcmTokens.findIndex((t) => t.token === token);
      if (index !== -1) memory.fcmTokens.splice(index, 1);
      return jsonResponse({ data: { status: "ok" } });
    }

    case "send": {
      const forbidden = requirePermission(request, "view_audit");
      if (forbidden) return forbidden;
      const { title, body: text, url = "/rider-app", riderName, imageUrl } = body as { title?: string; body?: string; url?: string; riderName?: string; imageUrl?: string };
      if (!title?.trim() || !text?.trim()) return jsonResponse({ error: "title and body are required" }, { status: 400 });
      // Big-picture image is optional; only absolute https URLs are accepted
      // (FCM rejects anything else and web push would show a broken image).
      const image = imageUrl?.trim().startsWith("https://") ? imageUrl.trim().slice(0, 500) : undefined;

      // Optional runtime capability — see notify.ts. Build never resolves it;
      // runtime returns 503 cleanly when the dependency is not installed.
      let webpush: typeof import("web-push").default;
      try {
        webpush = (await import("web-push")).default;
      } catch {
        return jsonResponse({ error: "Push indisponível: dependência web-push não instalada." }, { status: 503 });
      }
      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

      let targets = memory.pushSubscriptions;
      if (riderName?.trim()) targets = targets.filter((s) => s.riderName === riderName.trim());

      const payload = JSON.stringify({ title: title.slice(0, 80), body: text.slice(0, 500), url, ...(image ? { image } : {}) });
      let sent = 0;
      const dead: string[] = [];
      await Promise.all(
        targets.map(async (sub) => {
          try {
            await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
            sent += 1;
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) dead.push(sub.endpoint); // expired subscription
          }
        }),
      );
      for (const endpoint of dead) {
        const index = memory.pushSubscriptions.findIndex((s) => s.endpoint === endpoint);
        if (index !== -1) memory.pushSubscriptions.splice(index, 1);
      }

      // Also deliver to native FCM tokens (no-op when the FCM credential is
      // absent — see app/lib/server/fcm.ts). Pruning of dead tokens is handled
      // inside sendFcmToTokens.
      let fcmTargets = memory.fcmTokens;
      if (riderName?.trim()) fcmTargets = fcmTargets.filter((t) => t.riderName === riderName.trim());
      const fcmSent = await sendFcmToTokens(
        fcmTargets.map((t) => t.token),
        title,
        text,
        { url, ...(image ? { image } : {}) },
      );

      appendServerAudit({ actor, action: "PUSH_SENT", entity: "PushNotification", entityId: nowStamp(), detail: `"${title}" → ${sent} web + ${fcmSent} fcm devices${riderName ? ` (rider ${riderName})` : ""}.`, risk: "Low" });
      return jsonResponse({ data: { sent, fcmSent, removed: dead.length, targets: targets.length + fcmTargets.length } });
    }

    default:
      return jsonResponse({ error: "unknown action" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const response = await handlePost(request);
  await flushPendingToDatabase();
  return response;
}
