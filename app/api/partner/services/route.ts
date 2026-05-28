import { getAvailablePartnerPoints, getAvailablePoints, shouldHoldPartnerService, type PartnerServiceCategory, type PartnerServiceStatus } from "../../../lib/points";
import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../../lib/server/memory";
import { requirePermission } from "../../../lib/server/authz";

const categories = new Set<PartnerServiceCategory>(["fuel", "maintenance", "phone_data", "equipment", "vehicle_service"]);

export function GET() {
  return jsonResponse({ data: memory.partnerServiceRecords });
}

export async function POST(request: Request) {
  const forbidden = requirePermission(request, "manage_partner_points");
  if (forbidden) return forbidden;

  const body = await request.json();
  const riderId = typeof body.riderId === "string" ? body.riderId : "";
  const partnerId = typeof body.partnerId === "string" ? body.partnerId : "";
  const category = typeof body.category === "string" ? (body.category as PartnerServiceCategory) : "maintenance";
  const amount = Number(body.amount);
  const receiptRef = typeof body.receiptRef === "string" ? body.receiptRef.trim() : "";

  if (!riderId || !partnerId || !categories.has(category) || !Number.isFinite(amount) || amount <= 0 || !receiptRef) {
    return jsonResponse({ error: "riderId, partnerId, category, positive amount and receiptRef are required" }, { status: 400 });
  }

  const rider = memory.riders.find((item) => item.id === riderId);
  const partner = memory.crmPartners.find((item) => item.id === partnerId);
  if (!rider) return jsonResponse({ error: "Rider not found" }, { status: 404 });
  if (!partner) return jsonResponse({ error: "Partner not found" }, { status: 404 });

  const holdReason = shouldHoldPartnerService({
    amount,
    receiptRef,
    partnerRisk: partner.risk,
    partnerStatus: partner.status,
    existingServices: memory.partnerServiceRecords,
    riderId,
    partnerId,
    category,
  });
  if (partner.category === "Supplier") {
    return jsonResponse({ error: "Suppliers do not participate in points accounts" }, { status: 400 });
  }

  const status: PartnerServiceStatus = holdReason ? "pending" : "paid";
  const chargedPoints = Math.min(Math.floor(amount), 300);

  if (status === "paid" && getAvailablePoints(memory.pointsLedgerEntries, riderId) < chargedPoints) {
    return jsonResponse({ error: "Insufficient rider points" }, { status: 409 });
  }

  const service = {
    id: makeServerId("psv", memory.partnerServiceRecords.length + 1),
    riderId,
    partnerId,
    category,
    amount,
    pointsCharged: chargedPoints,
    pointsPaid: status === "paid" ? chargedPoints : 0,
    status,
    receiptRef,
    createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    reviewReason: holdReason ?? undefined,
  };

  const riderLedger = {
    id: makeServerId("pts", memory.pointsLedgerEntries.length + 1),
    riderId,
    accountId: `pts-${riderId}`,
    type: "spend" as const,
    points: chargedPoints,
    status: status === "paid" ? "approved" as const : "pending" as const,
    sourceType: "partner_service" as const,
    sourceId: service.id,
    partnerId,
    balanceAfter: status === "paid" ? getAvailablePoints(memory.pointsLedgerEntries, riderId) - chargedPoints : getAvailablePoints(memory.pointsLedgerEntries, riderId),
    reasonCode: holdReason ?? "RIDER_SERVICE_POINTS_PAYMENT",
    note: `${rider.name} paid ${partner.name} for ${category} service`,
    createdBy: "Rider",
    createdAt: service.createdAt,
    approvedBy: status === "paid" ? "System" : undefined,
    approvedAt: status === "paid" ? service.createdAt : undefined,
  };
  const partnerLedger = {
    id: makeServerId("ppts", memory.partnerPointsLedgerEntries.length + 1),
    partnerId,
    accountId: `ppts-${partnerId}`,
    type: "earn" as const,
    points: chargedPoints,
    status: status === "paid" ? "approved" as const : "pending" as const,
    sourceType: "rider_service_payment" as const,
    sourceId: service.id,
    riderId,
    balanceAfter: status === "paid" ? getAvailablePartnerPoints(memory.partnerPointsLedgerEntries, partnerId) + chargedPoints : getAvailablePartnerPoints(memory.partnerPointsLedgerEntries, partnerId),
    reasonCode: holdReason ?? "RIDER_SERVICE_PAYMENT",
    note: `${partner.name} received points from rider service payment.`,
    createdBy: "Rider",
    createdAt: service.createdAt,
  };

  memory.partnerServiceRecords.unshift(service);
  memory.pointsLedgerEntries.unshift(riderLedger);
  memory.partnerPointsLedgerEntries.unshift(partnerLedger);
  appendServerAudit({
    actor: "Rider",
    action: status === "paid" ? "RIDER_PAID_PARTNER_POINTS" : "RIDER_PARTNER_PAYMENT_PENDING",
    entity: "PartnerService",
    entityId: service.id,
    detail: `${rider.name} paid ${service.pointsPaid} points to ${partner.name}.`,
    risk: status === "pending" ? "Medium" : "Low",
  });

  return jsonResponse({ data: { service, riderLedger, partnerLedger } }, { status: 201 });
}
