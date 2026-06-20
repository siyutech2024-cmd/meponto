import { appendServerAudit, makeServerId, memory, jsonResponse } from "../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { getAvailablePoints, type PointsLedgerEntry } from "../../lib/points";
import type { CrmPartner, CrmPartnerCategory } from "../../lib/crm";

/** Points awarded to a member who invited a partner that registers. */
const PARTNER_INVITE_POINTS = 500;
const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

/**
 * PUBLIC self-onboarding endpoint — a supplier or partner submits an
 * application. It lands as a `Prospect` in the CRM review queue (no login,
 * no points capability) until an operator approves and provisions an account.
 * "Invite" is simply sharing the /partner-register link.
 */
const ALLOWED: CrmPartnerCategory[] = ["Repair Shop", "Partner Vehicle Shop", "Supplier", "Vehicle Partner"];

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    category?: CrmPartnerCategory;
    contactName?: string;
    phone?: string;
    bairro?: string;
    notes?: string;
    lat?: number;
    lng?: number;
    inviterId?: string;
  };
  await refreshCollectionsFromDatabase(["riders", "pointsLedgerEntries"]);

  const name = (body.name ?? "").trim();
  const contactName = (body.contactName ?? "").trim();
  const phone = (body.phone ?? "").trim();
  const category = ALLOWED.includes(body.category as CrmPartnerCategory) ? (body.category as CrmPartnerCategory) : "Repair Shop";
  if (!name || !contactName || !phone) {
    return jsonResponse({ error: "Nome, contato e telefone são obrigatórios." }, { status: 400 });
  }

  // Light dedupe: same name + phone already pending/active.
  if (memory.crmPartners.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.phone === phone)) {
    return jsonResponse({ error: "Cadastro já recebido. Aguarde a análise." }, { status: 409 });
  }

  const partner: CrmPartner = {
    id: makeServerId("crm", memory.crmPartners.length + 1),
    name,
    category,
    status: "Prospect",
    tier: "Standard",
    contactName,
    phone,
    bairro: (body.bairro ?? "").trim() || "Unassigned",
    owner: "Self-registration",
    slaHours: 12,
    monthlyVolume: 0,
    activeDeals: 0,
    vehiclesAvailable: 0,
    contractRenewal: new Date().toISOString().slice(0, 10),
    risk: "Medium",
    notes: (body.notes ?? "").slice(0, 300),
    services: [],
    // Real service-point location from the registration map (NOT a pickup point
    // — pickups happen at Ponto stations). Falls back to São Paulo centre.
    lat: Number.isFinite(Number(body.lat)) ? Number(body.lat) : -23.5505,
    lng: Number.isFinite(Number(body.lng)) ? Number(body.lng) : -46.6333,
  };
  memory.crmPartners.unshift(partner);
  appendServerAudit({ actor: "Self-registration", action: "CRM_SELF_REGISTER", entity: "CrmPartner", entityId: partner.id, detail: `${name} (${category}) aguardando análise`, risk: "Low" });

  // Referral: a member (公开用户) who invited this partner earns points.
  const inviter = body.inviterId ? memory.riders.find((r) => r.id === body.inviterId) : undefined;
  let referral: { inviter: string; points: number } | null = null;
  if (inviter) {
    const available = getAvailablePoints(memory.pointsLedgerEntries, inviter.id);
    const entry: PointsLedgerEntry = {
      id: makeServerId("pts", memory.pointsLedgerEntries.length + 1),
      riderId: inviter.id,
      accountId: `pts-${inviter.id}`,
      type: "earn",
      points: PARTNER_INVITE_POINTS,
      status: "approved",
      sourceType: "admin_adjustment",
      sourceId: `refp-${partner.id}`,
      balanceAfter: available + PARTNER_INVITE_POINTS,
      reasonCode: "REFERRAL_PARTNER",
      note: `Convidou o parceiro ${name}`,
      createdBy: "PontoMall",
      createdAt: nowStamp(),
    };
    memory.pointsLedgerEntries.unshift(entry);
    referral = { inviter: inviter.name, points: PARTNER_INVITE_POINTS };
  }

  await flushPendingToDatabase();
  return jsonResponse({ data: { id: partner.id, status: partner.status, referral } }, { status: 201 });
}
