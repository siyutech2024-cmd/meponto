import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { getAvailablePoints, type PointsLedgerEntry } from "../../lib/points";
import { defaultMallConfig } from "../../lib/mall";
import type { Rider } from "../../lib/data";

/**
 * PUBLIC member self-registration (公开用户). Creates a member record with NO
 * 99 ID → 会员一级 (member tier). Members accumulate points and redeem in the
 * mall (pickup at any Ponto). Binding a 99 ID later auto-promotes to 会员二级.
 * Optional referral: the inviter (an existing member) earns referral points.
 */
const COLLECTIONS = ["riders", "pointsLedgerEntries", "mallConfigs"];

const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

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
  const body = (await request.json().catch(() => ({}))) as { name?: string; phone?: string; cpf?: string; inviterId?: string };
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
    birthday: "",
  };
  memory.riders.unshift(member);
  appendServerAudit({ actor: "Self-registration", action: "MEMBER_REGISTERED", entity: "Rider", entityId: id, detail: `${name} (membro público, sem 99 ID)`, risk: "Low" });

  // Referral: a public user who invited this registrant earns referral points.
  let referral: { inviter: string; points: number } | null = null;
  const inviter = body.inviterId ? memory.riders.find((r) => r.id === body.inviterId) : undefined;
  if (inviter && inviter.id !== id) {
    const config = memory.mallConfigs.find((c) => c.id === "mall-config") ?? defaultMallConfig;
    const points = config.referralPoints || 20;
    const available = getAvailablePoints(memory.pointsLedgerEntries, inviter.id);
    const entry: PointsLedgerEntry = {
      id: makeServerId("pts", memory.pointsLedgerEntries.length + 1),
      riderId: inviter.id,
      accountId: `pts-${inviter.id}`,
      type: "earn",
      points,
      status: "approved",
      sourceType: "admin_adjustment",
      sourceId: `ref-${id}`,
      balanceAfter: available + points,
      reasonCode: "REFERRAL_REWARD",
      note: `Convidou ${name} para o PontoMall`,
      createdBy: "PontoMall",
      createdAt: nowStamp(),
    };
    memory.pointsLedgerEntries.unshift(entry);
    referral = { inviter: inviter.name, points };
  }

  await flushPendingToDatabase();
  return jsonResponse({ data: { id, name, referral } }, { status: 201 });
}
