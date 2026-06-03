import { getAvailablePartnerPoints, partnerServiceBenefitRules, shouldHoldPartnerService, type PartnerServiceCategory, type PartnerServiceStatus } from "../../../lib/points";
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

  const riderTier = getRiderTier(rider);
  if (riderTier.stars < 2) {
    return jsonResponse({ error: "Rider must be tier 2 or higher to use Partner discounts", riderTier: riderTier.label }, { status: 409 });
  }

  const rule = partnerServiceBenefitRules[category];
  const status: PartnerServiceStatus = holdReason ? "pending" : "confirmed";
  const service = {
    id: makeServerId("psv", memory.partnerServiceRecords.length + 1),
    riderId,
    partnerId,
    category,
    amount,
    riderTier: riderTier.label,
    riderDiscountBrl: rule.riderDiscountBrl,
    partnerPoints: rule.partnerPoints,
    status,
    receiptRef,
    createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    reviewReason: holdReason ?? undefined,
  };

  const partnerLedger = {
    id: makeServerId("ppts", memory.partnerPointsLedgerEntries.length + 1),
    partnerId,
    accountId: `ppts-${partnerId}`,
    type: "earn" as const,
    points: rule.partnerPoints,
    status: "pending" as const,
    sourceType: "partner_service_benefit" as const,
    sourceId: service.id,
    riderId,
    balanceAfter: getAvailablePartnerPoints(memory.partnerPointsLedgerEntries, partnerId),
    reasonCode: holdReason ?? "PARTNER_SERVICE_BENEFIT",
    note: `${partner.name} earned fixed points for ${rule.label}. Rider paid Partner directly with member discount.`,
    createdBy: "Partner",
    createdAt: service.createdAt,
  };

  memory.partnerServiceRecords.unshift(service);
  memory.partnerPointsLedgerEntries.unshift(partnerLedger);
  appendServerAudit({
    actor: "Partner",
    action: status === "confirmed" ? "PARTNER_CONFIRMED_MEMBER_BENEFIT" : "PARTNER_BENEFIT_PENDING_REVIEW",
    entity: "PartnerService",
    entityId: service.id,
    detail: `${partner.name} scanned ${rider.name} member QR for ${rule.label}; rider discount R$ ${rule.riderDiscountBrl}, partner points ${rule.partnerPoints}.`,
    risk: status === "pending" ? "Medium" : "Low",
  });

  return jsonResponse({ data: { service, partnerLedger } }, { status: 201 });
}

function getRiderTier(rider: { ar: number; nightShiftCount: number; incidentCount: number }) {
  const score = rider.ar + Math.min(rider.nightShiftCount, 24) - rider.incidentCount * 8;
  if (score >= 108) return { label: "Diamond", stars: 5 };
  if (score >= 100) return { label: "Gold", stars: 4 };
  if (score >= 86) return { label: "3 estrelas", stars: 3 };
  if (score >= 72) return { label: "2 estrelas", stars: 2 };
  return { label: "1 estrela", stars: 1 };
}
