import { getAvailablePoints, type PointsSourceType } from "../../../lib/points";
import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../../lib/server/memory";
import { requirePermission } from "../../../lib/server/authz";

const allowedSources = new Set<PointsSourceType>(["delivery", "mission", "admin_adjustment"]);

export async function POST(request: Request) {
  const forbidden = requirePermission(request, "manage_points");
  if (forbidden) return forbidden;

  const body = await request.json();
  const riderId = typeof body.riderId === "string" ? body.riderId : "";
  const sourceType = typeof body.sourceType === "string" ? (body.sourceType as PointsSourceType) : "mission";
  const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : "";
  const points = Number(body.points);
  const partnerId = typeof body.partnerId === "string" ? body.partnerId : undefined;

  if (!riderId || !sourceId || !Number.isFinite(points) || points <= 0 || !allowedSources.has(sourceType)) {
    return jsonResponse({ error: "riderId, sourceId, positive points and valid sourceType are required" }, { status: 400 });
  }

  const rider = memory.riders.find((item) => item.id === riderId);
  if (!rider) return jsonResponse({ error: "Rider not found" }, { status: 404 });

  const status = "approved" as const;
  const reasonCode = "POINTS_EARN_APPROVED";

  const entry = {
    id: makeServerId("pts", memory.pointsLedgerEntries.length + 1),
    riderId,
    accountId: `pts-${riderId}`,
    type: "earn" as const,
    points,
    status,
    sourceType,
    sourceId,
    partnerId,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    balanceAfter: status === "approved" ? getAvailablePoints(memory.pointsLedgerEntries, riderId) + points : getAvailablePoints(memory.pointsLedgerEntries, riderId),
    reasonCode,
    note: typeof body.note === "string" ? body.note : "Points earn request",
    createdBy: "Operations",
    createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    approvedBy: status === "approved" ? "Operations" : undefined,
    approvedAt: status === "approved" ? new Date().toISOString().slice(0, 16).replace("T", " ") : undefined,
  };

  memory.pointsLedgerEntries.unshift(entry);
  appendServerAudit({
    actor: "Operations",
    action: "POINTS_EARN_APPROVED",
    entity: "PointsLedger",
    entityId: entry.id,
    detail: `${points} points for ${rider.name} from ${sourceType}`,
    risk: "Low",
  });

  return jsonResponse({ data: entry }, { status: 201 });
}
