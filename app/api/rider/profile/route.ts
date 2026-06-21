import { appendServerAudit, jsonResponse, memory } from "../../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../../lib/server/persistence";
import { sessionFromRequest } from "../../../lib/auth-session";

/**
 * Rider self-service profile (个人信息): name / CPF / phone / PIX.
 *  - GET  : read own profile + read-only ponto/leader/99ID + isComplete.
 *  - POST : update editable fields (session-derived identity — never trusts a
 *           client riderId). `isComplete = cpf && pix && phone`, gating 提现.
 * Events/audit: rider.profile.updated.v1.
 */

const COLLECTIONS = ["riders"];
const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");
const onlyDigits = (s: string) => s.replace(/\D/g, "");

function findRider(session: { userId?: string; name: string }) {
  return memory.riders.find((r) => r.id === session.userId || r.name === session.name);
}

function profileView(r: (typeof memory.riders)[number]) {
  const cpf = r.cpf ?? "";
  const pix = r.pix ?? "";
  const phone = r.phone ?? "";
  return {
    name: r.name,
    cpf,
    phone,
    pix,
    ponto: r.ponto ?? "",
    leader: r.leader ?? "",
    nineId: r.ninetyNineId ?? "",
    isComplete: !!cpf && !!pix && !!phone,
  };
}

export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Faça login para ver seu perfil.", code: "unauthenticated" }, { status: 401 });
  await refreshCollectionsFromDatabase(COLLECTIONS);
  const rider = findRider(session);
  if (!rider) return jsonResponse({ error: "Cadastro não encontrado.", code: "not_found" }, { status: 404 });
  return jsonResponse({ data: profileView(rider) });
}

type Body = { name?: string; cpf?: string; phone?: string; pix?: string };

async function handlePost(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Faça login para atualizar seu perfil.", code: "unauthenticated" }, { status: 401 });
  await refreshCollectionsFromDatabase(COLLECTIONS);
  const index = memory.riders.findIndex((r) => r.id === session.userId || r.name === session.name);
  if (index === -1) return jsonResponse({ error: "Cadastro não encontrado.", code: "not_found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as Body;
  const prev = memory.riders[index];

  // Validate only the fields the client actually sent.
  if (body.cpf !== undefined && body.cpf !== "" && onlyDigits(body.cpf).length !== 11) {
    return jsonResponse({ error: "CPF inválido (11 dígitos).", code: "invalid_cpf" }, { status: 422 });
  }
  if (body.phone !== undefined && body.phone !== "" && onlyDigits(body.phone).length < 8) {
    return jsonResponse({ error: "Telefone inválido.", code: "invalid_phone" }, { status: 422 });
  }
  if (body.pix !== undefined && body.pix !== "" && body.pix.trim().length < 3) {
    return jsonResponse({ error: "Chave PIX inválida.", code: "invalid_pix" }, { status: 422 });
  }

  const pixChanged = body.pix !== undefined && body.pix.trim() !== (prev.pix ?? "");
  const next = {
    ...prev,
    ...(body.name !== undefined ? { name: String(body.name).trim().slice(0, 80) || prev.name } : {}),
    ...(body.cpf !== undefined ? { cpf: String(body.cpf).trim().slice(0, 20) } : {}),
    ...(body.phone !== undefined ? { phone: String(body.phone).trim().slice(0, 30) } : {}),
    ...(body.pix !== undefined ? { pix: String(body.pix).trim().slice(0, 120) } : {}),
  };
  memory.riders[index] = next;

  appendServerAudit({
    actor: session.name,
    action: "rider.profile.updated.v1",
    entity: "Rider",
    entityId: next.id,
    detail: `${next.name} atualizou perfil${pixChanged ? " (PIX alterado)" : ""}.`,
    risk: pixChanged ? "Medium" : "Low",
  });

  return jsonResponse({ data: profileView(next) });
}

export async function POST(request: Request) {
  const response = await handlePost(request);
  await flushPendingToDatabase();
  return response;
}
