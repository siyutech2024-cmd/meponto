import { jsonResponse, memory } from "../../lib/server/memory";
import { requirePermission } from "../../lib/server/authz";

function nowStamp() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

export function GET() {
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

export async function POST(request: Request) {
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

export async function PUT(request: Request) {
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
