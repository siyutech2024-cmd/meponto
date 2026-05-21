import { makeServerId, memory, jsonResponse } from "../../lib/server/memory";
import { requirePermission } from "../../lib/server/authz";
import type { CrmPartner, CrmPartnerCategory, CrmPartnerRisk } from "../../lib/crm";

export function GET() {
  const summary = memory.crmPartners.reduce(
    (acc, partner) => {
      acc.byCategory[partner.category] = (acc.byCategory[partner.category] ?? 0) + 1;
      acc.byRisk[partner.risk] = (acc.byRisk[partner.risk] ?? 0) + 1;
      acc.monthlyVolume += partner.monthlyVolume;
      acc.vehiclesAvailable += partner.vehiclesAvailable;
      return acc;
    },
    {
      byCategory: {} as Partial<Record<CrmPartnerCategory, number>>,
      byRisk: {} as Partial<Record<CrmPartnerRisk, number>>,
      monthlyVolume: 0,
      vehiclesAvailable: 0,
    },
  );

  return jsonResponse({ data: memory.crmPartners, summary });
}

export async function POST(request: Request) {
  const forbidden = requirePermission(request, "view_analytics");
  if (forbidden) return forbidden;

  const body = (await request.json()) as Partial<CrmPartner>;
  if (!body.name || !body.category || !body.contactName || !body.phone) {
    return jsonResponse({ error: "name, category, contactName and phone are required" }, { status: 400 });
  }

  const partner: CrmPartner = {
    id: makeServerId("crm", memory.crmPartners.length + 1),
    name: body.name,
    category: body.category,
    status: body.status ?? "Prospect",
    tier: body.tier ?? "Standard",
    contactName: body.contactName,
    phone: body.phone,
    bairro: body.bairro ?? "Unassigned",
    owner: body.owner ?? "meponto Partnerships",
    slaHours: Number(body.slaHours ?? 12),
    monthlyVolume: Number(body.monthlyVolume ?? 0),
    activeDeals: Number(body.activeDeals ?? 0),
    vehiclesAvailable: Number(body.vehiclesAvailable ?? 0),
    contractRenewal: body.contractRenewal ?? new Date().toISOString().slice(0, 10),
    risk: body.risk ?? "Medium",
    notes: body.notes ?? "",
    services: body.services ?? [],
  };

  memory.crmPartners.unshift(partner);
  return jsonResponse({ data: partner }, { status: 201 });
}
