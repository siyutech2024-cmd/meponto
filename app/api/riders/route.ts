import { appendServerAudit, makeServerId, memory, jsonResponse } from "../../lib/server/memory";
import { requirePermission } from "../../lib/server/authz";
import type { Rider, RiderStatus } from "../../lib/data";
import { getRiderSensitiveRevealDecision, maskRiderSensitive } from "../../lib/masking";

export function GET(request: Request) {
  const reveal = getRiderSensitiveRevealDecision(request);

  if (reveal.requested) {
    appendServerAudit({
      actor: reveal.role ?? "Unknown",
      action: reveal.allowed ? "REVEAL_RIDER_SENSITIVE" : "REVEAL_RIDER_SENSITIVE_DENIED",
      entity: "Rider",
      entityId: "all",
      detail: reveal.allowed
        ? "Sensitive rider fields revealed for rider collection API response."
        : "Sensitive rider reveal denied for rider collection API response.",
      risk: reveal.allowed ? "Medium" : "High",
    });
  }

  const data = reveal.allowed ? memory.riders : memory.riders.map(maskRiderSensitive);
  return jsonResponse({ data });
}

export async function POST(request: Request) {
  const forbidden = requirePermission(request, "manage_riders");
  if (forbidden) return forbidden;

  const body = (await request.json()) as Partial<Rider>;
  if (!body.name || !body.cpf || !body.phone) {
    return jsonResponse({ error: "name, cpf and phone are required" }, { status: 400 });
  }

  const rider: Rider = {
    id: makeServerId("r", memory.riders.length + 1),
    name: body.name,
    cpf: body.cpf,
    phone: body.phone,
    pix: body.pix ?? "",
    bairro: body.bairro ?? "",
    ponto: body.ponto ?? "Unassigned",
    leader: body.leader ?? "Unassigned",
    invitedBy: body.invitedBy ?? "MePonto Admin",
    chatRoom: body.chatRoom ?? "MePonto Intake",
    ar: body.ar ?? 100,
    status: (body.status ?? "Active") as RiderStatus,
    vehicleType: body.vehicleType ?? "Motorcycle",
    brand: body.brand ?? "Unknown",
    model: body.model ?? "To confirm",
    rentalStatus: body.rentalStatus ?? "Unknown",
    isMottu: body.isMottu ?? false,
    onlineHours: body.onlineHours ?? 0,
    nightShiftCount: body.nightShiftCount ?? 0,
    incidentCount: body.incidentCount ?? 0,
    joinDate: body.joinDate ?? new Date().toISOString().slice(0, 10),
  };

  memory.riders.unshift(rider);
  return jsonResponse({ data: rider }, { status: 201 });
}
