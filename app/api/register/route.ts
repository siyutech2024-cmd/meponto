import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import type { Rider } from "../../lib/data";

/**
 * LEGACY public member self-registration (公开用户), kept for older clients.
 * The web funnel now signs members up phone-first through /api/member-login
 * (request-otp with `signup` + verify-otp), which verifies the phone by SMS
 * before creating the record.
 *
 * Referral points are NOT paid here any more: an unverified registration could
 * farm points with fake numbers (?ref=self). The reward is credited by
 * /api/member-login when the invited member verifies their phone.
 */
const COLLECTIONS = ["riders"];

const onlyDigits = (s: string) => s.replace(/\D/g, "");
/** Normalize a BR phone to digits with country code 55 — must match member-login. */
function normalizeBR(raw: string): string {
  const d = onlyDigits(raw);
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

export async function POST(request: Request) {
  await refreshCollectionsFromDatabase(COLLECTIONS);
  const body = (await request.json().catch(() => ({}))) as { name?: string; phone?: string; cpf?: string; inviterId?: string; birthday?: string };
  const name = (body.name ?? "").trim();
  const phone = (body.phone ?? "").trim();
  if (!name || !phone) return jsonResponse({ error: "Nome e telefone são obrigatórios." }, { status: 400 });
  // Normalized dedup — same number in any format maps to one account (matches
  // member-login), so "11 9..." and "+55 11 9..." can't create duplicates.
  const normalizedPhone = normalizeBR(phone);
  if (memory.riders.some((r) => r.phone && normalizeBR(r.phone) === normalizedPhone)) {
    return jsonResponse({ error: "Este telefone já está cadastrado." }, { status: 409 });
  }

  const id = makeServerId("r", memory.riders.length + 1);
  const member: Rider = {
    id,
    name,
    cpf: (body.cpf ?? "").trim(),
    phone,
    pix: "",
    bairro: "",
    ponto: "Unassigned",
    leader: "Unassigned",
    invitedBy: body.inviterId ? `member:${body.inviterId}` : "Self-registration",
    chatRoom: "PontoMall",
    ar: 100,
    status: "Active",
    vehicleType: "—",
    brand: "—",
    model: "—",
    rentalStatus: "—",
    isMottu: false,
    onlineHours: 0,
    nightShiftCount: 0,
    incidentCount: 0,
    joinDate: new Date().toISOString().slice(0, 10),
    ninetyNineId: "",
    franchise: "Unassigned",
    birthday: /^\d{4}-\d{2}-\d{2}$/.test((body.birthday ?? "").trim()) ? (body.birthday ?? "").trim() : "",
  };
  memory.riders.unshift(member);
  appendServerAudit({ actor: "Self-registration", action: "MEMBER_REGISTERED", entity: "Rider", entityId: id, detail: `${name} (membro público, sem 99 ID, legacy)`, risk: "Low" });

  await flushPendingToDatabase();
  return jsonResponse({ data: { id, name, referral: null } }, { status: 201 });
}
