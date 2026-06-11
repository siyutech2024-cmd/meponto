import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission, roleFromRequest } from "../../lib/server/authz";
import { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT, type PushSubscriptionRecord } from "../../lib/push";

const COLLECTIONS = ["pushSubscriptions"];
const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("publicKey") !== null) {
    return jsonResponse({ data: { publicKey: VAPID_PUBLIC_KEY } });
  }
  const forbidden = requirePermission(request, "view_audit");
  if (forbidden) return forbidden;
  await refreshCollectionsFromDatabase(COLLECTIONS);
  return jsonResponse({ data: { count: memory.pushSubscriptions.length, riders: [...new Set(memory.pushSubscriptions.map((s) => s.riderName))] } });
}

type Body =
  | { action: "subscribe"; riderName: string; subscription: { endpoint: string; keys: { p256dh: string; auth: string } } }
  | { action: "unsubscribe"; endpoint: string }
  | { action: "send"; title: string; body: string; url?: string; riderName?: string };

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

    case "send": {
      const forbidden = requirePermission(request, "view_audit");
      if (forbidden) return forbidden;
      const { title, body: text, url = "/rider-app", riderName } = body as { title?: string; body?: string; url?: string; riderName?: string };
      if (!title?.trim() || !text?.trim()) return jsonResponse({ error: "title and body are required" }, { status: 400 });

      const webpush = (await import("web-push")).default;
      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

      let targets = memory.pushSubscriptions;
      if (riderName?.trim()) targets = targets.filter((s) => s.riderName === riderName.trim());

      const payload = JSON.stringify({ title: title.slice(0, 80), body: text.slice(0, 300), url });
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

      appendServerAudit({ actor, action: "PUSH_SENT", entity: "PushNotification", entityId: nowStamp(), detail: `"${title}" → ${sent} devices${riderName ? ` (rider ${riderName})` : ""}.`, risk: "Low" });
      return jsonResponse({ data: { sent, removed: dead.length, targets: targets.length } });
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
