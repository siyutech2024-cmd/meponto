import { jsonResponse, makeServerId, memory } from "../../lib/server/memory";
import { requirePermission } from "../../lib/server/authz";
import { leadTypes, type Lead, type LeadType } from "../../lib/leads";

/** Listing requires an operations role; submissions are public. */
export function GET(request: Request) {
  const forbidden = requirePermission(request, "view_analytics");
  if (forbidden) return forbidden;

  return jsonResponse({
    data: memory.leads,
    summary: {
      total: memory.leads.length,
      new: memory.leads.filter((lead) => lead.status === "new").length,
    },
  });
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const type = (typeof body.type === "string" && leadTypes.includes(body.type as LeadType) ? body.type : "") as LeadType | "";
  const name = cleanText(body.name, 120);
  const phone = cleanText(body.phone, 40);
  const email = cleanText(body.email, 160);
  const city = cleanText(body.city, 80);
  const message = cleanText(body.message, 1000);
  const language = cleanText(body.language, 5) || "pt";

  // Honeypot: bots fill every field — humans never see this one.
  if (typeof body.company_website === "string" && body.company_website.length > 0) {
    return jsonResponse({ ok: true });
  }

  if (!type || !name || !phone) {
    return jsonResponse({ error: "type, name and phone are required" }, { status: 400 });
  }

  const lead: Lead = {
    id: makeServerId("lead", memory.leads.length + 1),
    type,
    name,
    phone,
    email,
    city,
    message,
    language,
    source: "meponto.com",
    status: "new",
    createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
  };

  memory.leads.unshift(lead);
  return jsonResponse({ data: { id: lead.id, status: lead.status } }, { status: 201 });
}
