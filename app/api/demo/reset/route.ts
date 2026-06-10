import { incidents, leaders, ledgerEntries, pontos, rewards, riders } from "../../../lib/data";
import { seedNotificationsFromIncidents } from "../../../lib/notifications";
import { jsonResponse, memory } from "../../../lib/server/memory";
import { persistAllCollections } from "../../../lib/server/persistence";
import { requirePermission } from "../../../lib/server/authz";

/** Restore the core demo collections to their seed state (server + database). */
export async function POST(request: Request) {
  const forbidden = requirePermission(request, "reset_demo");
  if (forbidden) return forbidden;

  memory.riders.splice(0, memory.riders.length, ...riders.map((item) => ({ ...item })));
  memory.pontos.splice(0, memory.pontos.length, ...pontos.map((item) => ({ ...item })));
  memory.leaders.splice(0, memory.leaders.length, ...leaders.map((item) => ({ ...item })));
  memory.incidents.splice(0, memory.incidents.length, ...incidents.map((item) => ({ ...item })));
  memory.rewards.splice(0, memory.rewards.length, ...rewards.map((item) => ({ ...item })));
  memory.ledgerEntries.splice(0, memory.ledgerEntries.length, ...ledgerEntries.map((item) => ({ ...item })));
  memory.notifications.splice(0, memory.notifications.length, ...seedNotificationsFromIncidents(incidents));
  memory.auditEntries.splice(0, memory.auditEntries.length);

  persistAllCollections();

  return jsonResponse({ ok: true, resetAt: new Date().toISOString() });
}
