import { jsonResponse, memory, type HotZoneAssignment } from "../../../lib/server/memory";
import { requirePermission, roleFromRequest } from "../../../lib/server/authz";
import { persistDeleteRecord, refreshCollectionsFromDatabase } from "../../../lib/server/persistence";

/**
 * Hot-zone → franchise assignments (HQ selects and assigns; franchise portals
 * use the result to limit their live map to their own zones). A zone can be
 * shared by MULTIPLE franchises.
 *
 *   GET  /api/eastwind/zone-assignments   → { data: HotZoneAssignment[] }
 *   POST /api/eastwind/zone-assignments   HQ only — full replace per zone:
 *        { zoneId: string, franchises: string[] }   [] = unassign
 *        (legacy body { zoneId, franchise } is accepted as a 1-element list)
 *
 * Zone ids are the stable ids in app/rider-monitor/hot-zones.ts (hz57, sc1…).
 * Writes go through the tracked collection (write-through persistence).
 */

const HQ_ROLES = new Set(["Super Admin", "Regional Manager"]);

/** Normalize legacy single-franchise rows to the franchises[] shape. */
function normalized(list: HotZoneAssignment[]): HotZoneAssignment[] {
  return list.map((a) => ({
    id: a.id,
    franchises: Array.isArray(a.franchises) ? a.franchises : a.franchise ? [a.franchise] : [],
    updatedAt: a.updatedAt,
  }));
}

export async function GET() {
  await refreshCollectionsFromDatabase(["hotZoneAssignments"]);
  return jsonResponse({ data: normalized(memory.hotZoneAssignments) });
}

export async function POST(request: Request) {
  // Baseline RBAC (also audits denied attempts), then narrow to HQ roles:
  // franchise admins must not re-draw the city zone ownership map.
  const forbidden = requirePermission(request, "manage_pontos");
  if (forbidden) return forbidden;
  if (!HQ_ROLES.has(roleFromRequest(request))) {
    return jsonResponse({ error: "HQ only" }, { status: 403 });
  }

  let body: { zoneId?: string; franchises?: unknown; franchise?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }
  const zoneId = body.zoneId?.trim();
  if (!zoneId) return jsonResponse({ error: "zoneId is required" }, { status: 400 });

  // franchises[] preferred; legacy single `franchise` accepted.
  const raw = Array.isArray(body.franchises)
    ? body.franchises
    : body.franchise !== undefined
      ? [body.franchise]
      : null;
  if (raw === null) return jsonResponse({ error: "franchises[] is required" }, { status: 400 });
  const franchises = [...new Set(raw.map((f) => String(f ?? "").trim()).filter(Boolean))];

  await refreshCollectionsFromDatabase(["hotZoneAssignments"]);
  const list = memory.hotZoneAssignments;
  const idx = list.findIndex((a) => a.id === zoneId);

  if (!franchises.length) {
    if (idx >= 0) {
      list.splice(idx, 1); // unassign completely
      persistDeleteRecord("hotZoneAssignments", zoneId); // remove the DB row too
    }
    return jsonResponse({ data: normalized(list) });
  }

  const record: HotZoneAssignment = { id: zoneId, franchises, updatedAt: new Date().toISOString() };
  if (idx >= 0) list.splice(idx, 1, record);
  else list.push(record);
  return jsonResponse({ data: normalized(list) });
}
