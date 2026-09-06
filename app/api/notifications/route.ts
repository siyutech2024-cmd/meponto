import { DEMO_NOTIFICATION_IDS, demoSeedsActive, jsonResponse, memory } from "../../lib/server/memory";
import { flushPendingToDatabase, persistDeleteRecord, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission } from "../../lib/server/authz";

function nowStamp() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

/** 生产库里残留的演示通知(2026-05 的 Felipe Rocha / Carlos Mendes)读一次就清掉。 */
function purgeDemoNotifications() {
  if (demoSeedsActive()) return;
  // 就地 splice:memory.* 是持久化代理数组,整个替换引用会脱离跟踪。
  let removed = 0;
  for (let i = memory.notifications.length - 1; i >= 0; i -= 1) {
    const n = memory.notifications[i];
    if (!DEMO_NOTIFICATION_IDS.has(n.id)) continue;
    memory.notifications.splice(i, 1);
    persistDeleteRecord("notifications", n.id);
    removed += 1;
  }
  return removed > 0;
}

export async function GET(request: Request) {
  const forbidden = requirePermission(request, "view_dashboard");
  if (forbidden) return forbidden;
  await refreshCollectionsFromDatabase(["notifications"]);
  if (purgeDemoNotifications()) await flushPendingToDatabase();
  const unreadCount = memory.notifications.filter((notification) => !notification.readAt).length;
  const unacknowledgedCount = memory.notifications.filter((notification) => !notification.acknowledgedAt).length;

  return jsonResponse({
    data: memory.notifications,
    summary: {
      unreadCount,
      unacknowledgedCount,
    },
  });
}

async function postImpl(request: Request) {
  const forbidden = requirePermission(request, "view_dashboard");
  if (forbidden) return forbidden;

  const body = (await request.json()) as Partial<import("../../lib/notifications").NotificationItem>;
  if (!body.id || !body.title) {
    return jsonResponse({ error: "id and title are required" }, { status: 400 });
  }

  const existing = memory.notifications.find((notification) => notification.id === body.id);
  if (existing) return jsonResponse({ data: existing });

  const notification = {
    id: String(body.id),
    title: String(body.title),
    body: String(body.body ?? ""),
    href: String(body.href ?? "/dashboard"),
    source: (body.source === "System" ? "System" : "Incident") as "Incident" | "System",
    sourceId: String(body.sourceId ?? ""),
    severity: (["Low", "Medium", "High", "Critical"].includes(String(body.severity))
      ? body.severity
      : "Medium") as "Low" | "Medium" | "High" | "Critical",
    createdAt: typeof body.createdAt === "string" ? body.createdAt : nowStamp(),
    readAt: typeof body.readAt === "string" ? body.readAt : undefined,
    acknowledgedAt: typeof body.acknowledgedAt === "string" ? body.acknowledgedAt : undefined,
  };

  memory.notifications.unshift(notification);
  return jsonResponse({ data: notification }, { status: 201 });
}

async function putImpl(request: Request) {
  const forbidden = requirePermission(request, "view_dashboard");
  if (forbidden) return forbidden;

  const body = (await request.json()) as { id?: string; status?: "read" | "acknowledged" };
  if (!body.id || !body.status) {
    return jsonResponse({ error: "id and status are required" }, { status: 400 });
  }

  const index = memory.notifications.findIndex((notification) => notification.id === body.id);
  if (index === -1) return jsonResponse({ error: "Notification not found" }, { status: 404 });

  const stampedAt = nowStamp();
  memory.notifications[index] = {
    ...memory.notifications[index],
    readAt: memory.notifications[index].readAt ?? stampedAt,
    acknowledgedAt: body.status === "acknowledged" ? stampedAt : memory.notifications[index].acknowledgedAt,
  };

  return jsonResponse({ data: memory.notifications[index] });
}

// Serverless safety: flush mutations to the database BEFORE returning —
// the instance may freeze right after the response, losing a debounced flush.
export async function POST(...args: Parameters<typeof postImpl>) {
  const response = await postImpl(...args);
  await flushPendingToDatabase();
  return response;
}
export async function PUT(...args: Parameters<typeof putImpl>) {
  const response = await putImpl(...args);
  await flushPendingToDatabase();
  return response;
}
