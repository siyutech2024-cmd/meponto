import { jsonResponse, memory, type HotZoneAssignment } from "../../../lib/server/memory";
import { requirePermission, roleFromRequest } from "../../../lib/server/authz";
import { persistDeleteRecord, refreshCollectionsFromDatabase } from "../../../lib/server/persistence";

/**
 * Hot-zone → franchise assignments (HQ selects and assigns; franchise portals
 * use the result to limit their live map to their own zones).
 *
 *   GET  /api/eastwind/zone-assignments            → { data: HotZoneAssignment[] }
 *   POST /api/eastwind/zone-assignments            HQ only
 *        { zoneId: string, franchise: string }     franchise "" = unassign
 *
 * Zone ids are the stable ids in app/rider-monitor/hot-zones.ts (hz57, sc1…).
 * Writes go through the tracked collection (write-through persistence).
 */

const HQ_ROLES = new Set(["Super Admin", "Regional Manager"]);

export async function GET() {
  await refreshCollectionsFromDatabase(["hotZoneAssignments"]);
  return jsonResponse({ data: memory.hotZoneAssignments });
}

export async function POST(request: Request) {
  // Baseline RBAC (also audits denied attempts), then narrow to HQ roles:
  // franchise admins may manage their own network but must not re-draw the
  // city zone ownership map.
  const forbidden = requirePermission(request, "manage_pontos");
  if (forbidden) return forbidden;
  if (!HQ_ROLES.has(roleFromRequest(request))) {
    return jsonResponse({ error: "HQ only" }, { status: 403 });
  }

  let body: { zoneId?: string; franchise?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }
  const zoneId = body.zoneId?.trim();
  const franchise = (body.franchise ?? "").trim();
  if (!zoneId) return jsonResponse({ error: "zoneId is required" }, { status: 400 });

  await refreshCollectionsFromDatabase(["hotZoneAssignments"]);
  const list = memory.hotZoneAssignments;
  const idx = list.findIndex((a) => a.id === zoneId);

  if (!franchise) {
    if (idx >= 0) {
      list.splice(idx, 1); // unassign
      persistDeleteRecord("hotZoneAssignments", zoneId); // remove the DB row too
    }
    return jsonResponse({ data: list });
  }

  const record: HotZoneAssignment = { id: zoneId, franchise, updatedAt: new Date().toISOString() };
  if (idx >= 0) list.splice(idx, 1, record);
  else list.push(record);
  return jsonResponse({ data: list });
}
