import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../../lib/server/persistence";
import { requirePermission } from "../../../lib/server/authz";
import { sessionFromRequest } from "../../../lib/auth-session";
import { isSupplierCategory } from "../../../lib/server/crm-categories";
import { getAvailablePartnerPoints, partnerServiceBenefitRules, type PartnerServiceCategory, type PartnerServiceRecord } from "../../../lib/points";

/**
 * Rider-initiated partner service redemption (扫商户码核销折扣). The RIDER scans
 * a partner QR, gets a fixed member discount (paid offline), and the PARTNER
 * earns fixed points (append-only ledger). Anti-abuse: per-category rider
 * cooldown + per-partner daily cap. Identity is session-derived; writes are
 * idempotent via the Idempotency-Key header. Event: partner.benefit.redeemed.v1.
 */

const COLLECTIONS = ["partnerServiceRecords", "partnerPointsLedgerEntries", "crmPartners", "riders"];
const CATEGORIES = new Set<PartnerServiceCategory>(["fuel", "phone_data", "maintenance", "equipment", "vehicle_service"]);
const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");
const stampMs = (s: string) => new Date(`${s.replace(" ", "T")}:00Z`).getTime();

async function handlePost(request: Request) {
  const forbidden = requirePermission(request, "use_rider_app");
  if (forbidden) return forbidden;
  const session = await sessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Faça login.", code: "unauthenticated" }, { status: 401 });
  await refreshCollectionsFromDatabase(COLLECTIONS);

  const rider = memory.riders.find((r) => r.id === session.userId || r.name === session.name);
  if (!rider) return jsonResponse({ error: "Cadastro não encontrado.", code: "not_found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { partnerCode?: string; category?: string };
  const category = (body.category ?? "") as PartnerServiceCategory;
  if (!CATEGORIES.has(category)) return jsonResponse({ error: "Categoria inválida.", code: "invalid_category" }, { status: 400 });

  // Resolve the partner from the QR payload (id / name / prefixed code).
  const code = String(body.partnerCode ?? "").trim();
  const key = code.replace(/^(partner-|crm-)/i, "");
  const partner = memory.crmPartners.find((p) => p.id === code || p.id === key || p.name === code);
  if (!partner) return jsonResponse({ error: "Parceiro não encontrado.", code: "partner_not_found" }, { status: 404 });
  if (partner.status !== "Active") return jsonResponse({ error: "Parceiro indisponível.", code: "partner_not_found" }, { status: 404 });
  if (isSupplierCategory(partner.category)) return jsonResponse({ error: "Fornecedores não participam.", code: "partner_not_found" }, { status: 400 });

  const rule = partnerServiceBenefitRules[category];

  // Idempotency — same key returns the first result (no double points).
  const idemKey = request.headers.get("Idempotency-Key")?.trim();
  if (idemKey) {
    const prior = memory.partnerServiceRecords.find((s) => s.id === `psv-${idemKey}`);
    if (prior) {
      return jsonResponse({ data: { redeemId: prior.id, riderDiscountBrl: prior.riderDiscountBrl, partnerPoints: prior.partnerPoints, nextEligibleAt: new Date(stampMs(prior.createdAt) + rule.riderCooldownDays * 86_400_000).toISOString() } });
    }
  }

  // Rider cooldown per category.
  const lastSame = memory.partnerServiceRecords
    .filter((s) => s.riderId === rider.id && s.category === category && s.status !== "rejected")
    .sort((a, b) => stampMs(b.createdAt) - stampMs(a.createdAt))[0];
  if (lastSame) {
    const nextMs = stampMs(lastSame.createdAt) + rule.riderCooldownDays * 86_400_000;
    if (nextMs > Date.now()) {
      return jsonResponse({ error: "Aguarde o período de espera para esta categoria.", code: "cooldown_active", nextEligibleAt: new Date(nextMs).toISOString() }, { status: 409 });
    }
  }

  // Partner daily cap per category.
  const today = nowStamp().slice(0, 10);
  const todayCount = memory.partnerServiceRecords.filter((s) => s.partnerId === partner.id && s.category === category && s.status !== "rejected" && s.createdAt.startsWith(today)).length;
  if (todayCount >= rule.partnerDailyCap) {
    return jsonResponse({ error: "Limite diário deste parceiro atingido.", code: "partner_cap_reached" }, { status: 409 });
  }

  const createdAt = nowStamp();
  const service: PartnerServiceRecord = {
    id: idemKey ? `psv-${idemKey}` : makeServerId("psv", memory.partnerServiceRecords.length + 1),
    riderId: rider.id,
    partnerId: partner.id,
    category,
    amount: rule.riderDiscountBrl,
    riderTier: "",
    riderDiscountBrl: rule.riderDiscountBrl,
    partnerPoints: rule.partnerPoints,
    status: "confirmed",
    receiptRef: idemKey ?? "QR",
    createdAt,
  };
  memory.partnerServiceRecords.unshift(service);
  memory.partnerPointsLedgerEntries.unshift({
    id: makeServerId("ppts", memory.partnerPointsLedgerEntries.length + 1),
    partnerId: partner.id,
    accountId: `ppts-${partner.id}`,
    type: "earn",
    points: rule.partnerPoints,
    status: "approved",
    sourceType: "partner_service_benefit",
    sourceId: service.id,
    riderId: rider.id,
    balanceAfter: getAvailablePartnerPoints(memory.partnerPointsLedgerEntries, partner.id) + rule.partnerPoints,
    reasonCode: "PARTNER_SERVICE_BENEFIT",
    note: `${rider.name} resgatou ${rule.label}: desconto R$ ${rule.riderDiscountBrl}, parceiro +${rule.partnerPoints} pts.`,
    createdBy: "Partner",
    createdAt,
  });

  appendServerAudit({ actor: rider.name, action: "partner.benefit.redeemed.v1", entity: "PartnerService", entityId: service.id, detail: `${rider.name} @ ${partner.name} (${rule.label}): -R$${rule.riderDiscountBrl}, +${rule.partnerPoints} pts.`, risk: "Low" });

  return jsonResponse({ data: { redeemId: service.id, riderDiscountBrl: rule.riderDiscountBrl, partnerPoints: rule.partnerPoints, nextEligibleAt: new Date(stampMs(createdAt) + rule.riderCooldownDays * 86_400_000).toISOString() } }, { status: 201 });
}

export async function POST(request: Request) {
  const response = await handlePost(request);
  await flushPendingToDatabase();
  return response;
}
