import { appendServerAudit, jsonResponse, memory } from "../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { sessionFromRequest } from "../../lib/auth-session";
import { getAvailablePoints, type PointsLedgerEntry } from "../../lib/points";

/**
 * Station check-in (扫站点码签到得积分). A rider scans a Ponto QR code and earns
 * points — once per day per station. Identity is session-derived (no IDOR);
 * the award lands as an append-only `earn` ledger entry.
 * Event: ponto.checkin.recorded.v1.
 */

const COLLECTIONS = ["pointsLedgerEntries", "riders", "pontos", "mallConfigs"];
// Award size lives in the mall back office config (mall-config.checkinPoints).
const DEFAULT_CHECKIN_POINTS = 10;
const checkinPoints = () =>
  memory.mallConfigs.find((c) => c.id === "mall-config")?.checkinPoints ?? DEFAULT_CHECKIN_POINTS;
const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24);

type Body = { pontoId?: string; pontoCode?: string; code?: string };

async function handlePost(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Faça login para registrar presença.", code: "unauthenticated" }, { status: 401 });
  await refreshCollectionsFromDatabase(COLLECTIONS);

  const rider = memory.riders.find((r) => r.id === session.userId || r.name === session.name);
  if (!rider) return jsonResponse({ error: "Cadastro não encontrado.", code: "not_found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Body;
  const raw = String(body.pontoId ?? body.pontoCode ?? body.code ?? "").trim();
  // Resolve the target station. A SCANNED code must match a real Ponto —
  // otherwise any random QR string would mint a fresh per-day dedupe key and
  // farm unlimited points. Only an EMPTY code falls back to the home station.
  const codeKey = raw.replace(/^(ponto-|checkin-|p-)/i, "");
  const matched = memory.pontos.find((p) => p.id === raw || p.id === codeKey || p.name === raw);
  if (raw && !matched) {
    return jsonResponse({ error: "QR inválido: este código não é de um Ponto MePonto.", code: "invalid_code" }, { status: 404 });
  }
  // Ownership: a rider only checks in at their OWN station or another station
  // of the SAME franchise. Riders without a home base yet may use any Ponto
  // (first visit binds nothing — assignment stays an ops decision).
  if (matched && (rider.ponto || rider.franchise)) {
    const sameStation = !!rider.ponto && (matched.name === rider.ponto || matched.id === rider.ponto);
    const sameFranchise = !!rider.franchise && !!matched.franchise && matched.franchise === rider.franchise;
    if (!sameStation && !sameFranchise) {
      return jsonResponse(
        { error: `Este QR é do ponto ${matched.name} — faça check-in no seu ponto (${rider.ponto || rider.franchise}).`, code: "wrong_station" },
        { status: 403 },
      );
    }
  }
  const ponto =
    matched ??
    (rider.ponto ? memory.pontos.find((p) => p.name === rider.ponto || p.id === rider.ponto) : undefined);
  const pontoKey = ponto ? ponto.id : slug(rider.ponto ?? "home");
  const pontoName = ponto?.name ?? rider.ponto ?? "Ponto";

  const date = nowStamp().slice(0, 10);
  const checkinId = `pts-chk-${date}-${pontoKey}-${rider.id}`;
  if (memory.pointsLedgerEntries.some((e) => e.id === checkinId)) {
    return jsonResponse({ error: "Você já fez check-in nesta estação hoje.", code: "already_checked_in" }, { status: 409 });
  }

  const award = checkinPoints();
  const available = getAvailablePoints(memory.pointsLedgerEntries, rider.id);
  const entry: PointsLedgerEntry = {
    id: checkinId,
    riderId: rider.id,
    accountId: `pts-${rider.id}`,
    type: "earn",
    points: award,
    status: "approved",
    sourceType: "mission",
    sourceId: checkinId,
    balanceAfter: available + award,
    reasonCode: "PONTO_CHECKIN",
    note: `Check-in ${pontoName}`,
    createdBy: "Check-in",
    createdAt: nowStamp(),
  };
  memory.pointsLedgerEntries.unshift(entry);

  appendServerAudit({
    actor: session.name,
    action: "ponto.checkin.recorded.v1",
    entity: "PointsLedger",
    entityId: entry.id,
    detail: `${rider.name} check-in ${pontoName}: +${award} pts.`,
    risk: "Low",
  });

  return jsonResponse({ data: { awarded: award, available: available + award, ponto: pontoName } }, { status: 201 });
}

export async function POST(request: Request) {
  const response = await handlePost(request);
  await flushPendingToDatabase();
  return response;
}
