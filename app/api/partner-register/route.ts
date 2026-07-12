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
 * "Invite" is simply sharing the /partner-register?ref=<inviter> link.
 */

/** Accepts http(s) URLs only (map links pasted from Google Maps etc.). */
function isValidHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    category?: CrmPartnerCategory;
    contactName?: string;
    phone?: string;
    bairro?: string;
    address?: string;
    mapUrl?: string;
    notes?: string;
    lat?: number;
    lng?: number;
    inviterId?: string;
  };
  await refreshCollectionsFromDatabase(["riders", "pointsLedgerEntries", "crmPartners", "crmCategories"]);

  const name = (body.name ?? "").trim();
  const contactName = (body.contactName ?? "").trim();
  const phone = (body.phone ?? "").trim();
  const address = (body.address ?? "").trim();
  const mapUrl = (body.mapUrl ?? "").trim();
  const rawCategory = String(body.category ?? "").trim();

  // Service type must be one of the configurable, active CRM categories
  // (same list the console manages and GET /api/crm?public=categories serves).
  const activeCategories = memory.crmCategories.filter((c) => c.active).map((c) => c.label);
  const category = activeCategories.find((label) => label === rawCategory);

  // Server-side required-field validation (mirror of the form). `fields`
  // lets the client highlight exactly what is missing.
  const missing: string[] = [];
  if (!name) missing.push("name");
  if (!category) missing.push("category");
  if (!contactName) missing.push("contactName");
  if (!phone) missing.push("phone");
  if (!mapUrl) missing.push("mapUrl");
  if (!address) missing.push("address");
  if (missing.length > 0) {
    return jsonResponse(
      { error: "Preencha todos os campos obrigatórios: nome, tipo de serviço, responsável, telefone, link do mapa e endereço.", fields: missing },
      { status: 400 },
    );
  }
  if (!isValidHttpUrl(mapUrl)) {
    return jsonResponse({ error: "Link do mapa inválido — cole uma URL http(s) válida.", fields: ["mapUrl"] }, { status: 400 });
  }

  // Light dedupe: same name + phone already pending/active.
  if (memory.crmPartners.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.phone === phone)) {
    return jsonResponse({ error: "Cadastro já recebido. Aguarde a análise." }, { status: 409 });
  }

  const partner: CrmPartner = {
    id: makeServerId("crm", memory.crmPartners.length + 1),
    name,
    category: category as CrmPartnerCategory,
    // Always lands as a pending application (Prospect). It only reaches the
    // service map / rider app / redemption after an operator approves (Active).
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
    address: address.slice(0, 200),
    mapUrl: mapUrl.slice(0, 400),
    ...(body.inviterId ? { invitedBy: String(body.inviterId).trim().slice(0, 60) } : {}),
    services: [],
    // Real service-point location from the registration map (NOT a pickup point
    // — pickups happen at Ponto stations). Falls back to São Paulo centre.
    lat: Number.isFinite(Number(body.lat)) ? Number(body.lat) : -23.5505,
    lng: Number.isFinite(Number(body.lng)) ? Number(body.lng) : -46.6333,
  };
  memory.crmPartners.unshift(partner);
  appendServerAudit({ actor: "Self-registration", action: "CRM_SELF_REGISTER", entity: "CrmPartner", entityId: partner.id, detail: `${name} (${category}) aguardando análise`, risk: "Low" });

  // Referral: a member (公开用户) who invited this partner earns points.
  // Accept any stable identifier (rider id / 99 ID / name) — same contract as
  // the member referral in /api/member-login.
  const ref = String(body.inviterId ?? "").trim();
  const inviter = ref ? memory.riders.find((r) => r.id === ref || r.ninetyNineId === ref || r.name === ref) : undefined;
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
