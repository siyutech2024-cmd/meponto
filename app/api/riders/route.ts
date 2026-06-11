import { acceptClientId, appendServerAudit, makeServerId, memory, jsonResponse } from "../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { getAvailablePoints } from "../../lib/points";
import { requirePermission, roleFromRequest } from "../../lib/server/authz";
import type { Rider, RiderStatus } from "../../lib/data";
import { getRiderSensitiveRevealDecision, maskRiderSensitive } from "../../lib/masking";

const COLLECTIONS = ["riders", "riderDailyKpis", "pointsLedgerEntries"];

/** Legacy/self-signup rows used lowercase statuses — normalize for filters. */
function normalizeStatus(status: string | undefined): RiderStatus {
  const map: Record<string, RiderStatus> = { active: "Active", inactive: "Inactive", risk: "Risk", "night shift": "Night Shift" };
  return map[String(status ?? "").toLowerCase()] ?? ((status as RiderStatus) || "Active");
}

export async function GET(request: Request) {
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

  await refreshCollectionsFromDatabase(COLLECTIONS);

  // Lifetime orders + last report date per Eastwind id (daily report data).
  const reportStats = new Map<string, { name: string; orders: number; lastDate: string; ar: number | null }>();
  for (const row of memory.riderDailyKpis) {
    if (!row.rider99Id) continue;
    const current = reportStats.get(row.rider99Id);
    const orders = (current?.orders ?? 0) + (row.completedOrders ?? 0);
    const isNewer = !current || row.date >= current.lastDate;
    reportStats.set(row.rider99Id, {
      name: isNewer && row.riderName ? row.riderName : current?.name ?? row.riderName ?? "",
      orders,
      lastDate: isNewer ? row.date : current!.lastDate,
      ar: isNewer ? (row.ar ?? current?.ar ?? null) : current?.ar ?? null,
    });
  }

  const base = reveal.allowed ? memory.riders : memory.riders.map(maskRiderSensitive);
  const known = new Set(memory.riders.map((rider) => rider.ninetyNineId).filter(Boolean));

  const data = base.map((rider) => {
    const stats = rider.ninetyNineId ? reportStats.get(rider.ninetyNineId) : undefined;
    return {
      ...rider,
      status: normalizeStatus(rider.status),
      pointsBalance: getAvailablePoints(memory.pointsLedgerEntries, rider.id),
      totalOrders: stats?.orders ?? 0,
      lastReportDate: stats?.lastDate ?? "",
      reportAr: stats?.ar ?? null,
      source: "profile" as const,
    };
  });

  // Riders that appear in daily reports but have NO profile yet.
  const reportOnly = [...reportStats.entries()]
    .filter(([rider99Id]) => !known.has(rider99Id))
    .map(([rider99Id, stats]) => ({
      id: `import-${rider99Id}`,
      name: stats.name || `99 ${rider99Id}`,
      cpf: "",
      pix: "",
      phone: "",
      bairro: "",
      ponto: "Unassigned",
      leader: "Unassigned",
      invitedBy: "Eastwind 日报",
      chatRoom: "",
      ar: stats.ar ?? 0,
      status: "Active" as RiderStatus,
      vehicleType: "",
      brand: "",
      model: "",
      rentalStatus: "",
      isMottu: false,
      onlineHours: 0,
      nightShiftCount: 0,
      incidentCount: 0,
      joinDate: "",
      ninetyNineId: rider99Id,
      franchise: "Unassigned",
      pointsBalance: 0,
      totalOrders: stats.orders,
      lastReportDate: stats.lastDate,
      reportAr: stats.ar,
      source: "report" as const,
    }));

  return jsonResponse({ data: [...data, ...reportOnly] });
}

type AssignBody = { action: "assign"; riderId: string; ponto?: string; franchise?: string; status?: string };

async function handlePost(request: Request) {
  const forbidden = requirePermission(request, "manage_riders");
  if (forbidden) return forbidden;

  await refreshCollectionsFromDatabase(COLLECTIONS);
  const body = (await request.json()) as Partial<Rider> & Partial<AssignBody>;
  const actor = roleFromRequest(request);

  // Assign station/franchise/status — also materializes report-only riders.
  if (body.action === "assign") {
    let { riderId } = body as AssignBody;
    if (!riderId) return jsonResponse({ error: "riderId required" }, { status: 400 });

    if (riderId.startsWith("import-")) {
      const rider99Id = riderId.slice("import-".length);
      const existing = memory.riders.find((item) => item.ninetyNineId === rider99Id);
      if (existing) {
        riderId = existing.id;
      } else {
        const latest = memory.riderDailyKpis
          .filter((row) => row.rider99Id === rider99Id)
          .sort((a, b) => b.date.localeCompare(a.date))[0];
        const rider: Rider = {
          id: makeServerId("r", memory.riders.length + 1),
          name: latest?.riderName || `99 ${rider99Id}`,
          cpf: latest?.cpf ?? "",
          pix: "",
          phone: latest?.phone ?? "",
          bairro: "",
          ponto: "Unassigned",
          leader: "Unassigned",
          invitedBy: "Eastwind 日报",
          chatRoom: "MePonto Intake",
          ar: latest?.ar ?? 100,
          status: "Active",
          vehicleType: "Motorcycle",
          brand: "Unknown",
          model: "To confirm",
          rentalStatus: "Unknown",
          isMottu: false,
          onlineHours: 0,
          nightShiftCount: 0,
          incidentCount: 0,
          joinDate: new Date().toISOString().slice(0, 10),
          ninetyNineId: rider99Id,
          franchise: "Unassigned",
          birthday: "",
        };
        memory.riders.unshift(rider);
        riderId = rider.id;
        appendServerAudit({ actor, action: "RIDER_MATERIALIZED", entity: "Rider", entityId: rider.id, detail: `Profile created from daily reports for 99 ${rider99Id} (${rider.name}).`, risk: "Low" });
      }
    }

    const index = memory.riders.findIndex((item) => item.id === riderId);
    if (index === -1) return jsonResponse({ error: "rider not found" }, { status: 404 });
    memory.riders[index] = {
      ...memory.riders[index],
      ...(body.ponto !== undefined ? { ponto: String(body.ponto) || "Unassigned" } : {}),
      ...(body.franchise !== undefined ? { franchise: String(body.franchise) || "Unassigned" } : {}),
      ...(body.status !== undefined ? { status: normalizeStatus(String(body.status)) } : {}),
    };
    appendServerAudit({ actor, action: "RIDER_ASSIGNED", entity: "Rider", entityId: riderId, detail: `${memory.riders[index].name} → ponto ${memory.riders[index].ponto} / franchise ${memory.riders[index].franchise} / ${memory.riders[index].status}.`, risk: "Low" });
    return jsonResponse({ data: memory.riders[index] });
  }

  if (!body.name?.trim()) {
    return jsonResponse({ error: "请填写骑手姓名" }, { status: 400 });
  }
  if (body.ninetyNineId && memory.riders.some((item) => item.ninetyNineId === body.ninetyNineId)) {
    return jsonResponse({ error: "该 99 ID 已存在" }, { status: 409 });
  }

  const id = acceptClientId(body.id) ?? makeServerId("r", memory.riders.length + 1);
  const existing = memory.riders.find((item) => item.id === id);
  if (existing) return jsonResponse({ data: existing });

  const rider: Rider = {
    id,
    name: body.name.trim(),
    cpf: body.cpf ?? "",
    phone: body.phone ?? "",
    pix: body.pix ?? "",
    bairro: body.bairro ?? "",
    ponto: body.ponto || "Unassigned",
    leader: body.leader ?? "Unassigned",
    invitedBy: body.invitedBy ?? "MePonto Admin",
    chatRoom: body.chatRoom ?? "MePonto Intake",
    ar: body.ar ?? 100,
    status: normalizeStatus(body.status as string | undefined),
    vehicleType: body.vehicleType ?? "Motorcycle",
    brand: body.brand ?? "Unknown",
    model: body.model ?? "To confirm",
    rentalStatus: body.rentalStatus ?? "Unknown",
    isMottu: body.isMottu ?? false,
    onlineHours: body.onlineHours ?? 0,
    nightShiftCount: body.nightShiftCount ?? 0,
    incidentCount: body.incidentCount ?? 0,
    joinDate: body.joinDate ?? new Date().toISOString().slice(0, 10),
    ninetyNineId: body.ninetyNineId ?? "",
    franchise: body.franchise || "Unassigned",
    birthday: body.birthday ?? "",
  };

  memory.riders.unshift(rider);
  appendServerAudit({ actor, action: "RIDER_CREATED", entity: "Rider", entityId: rider.id, detail: `${rider.name} (${rider.ninetyNineId || "sem 99 ID"}) → ${rider.ponto}.`, risk: "Low" });
  return jsonResponse({ data: rider }, { status: 201 });
}

// Mutations must be durably written before the serverless instance can freeze.
export async function POST(request: Request) {
  const response = await handlePost(request);
  await flushPendingToDatabase();
  return response;
}
