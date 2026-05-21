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
