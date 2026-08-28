import { acceptClientId, appendServerAudit, makeServerId, memory, jsonResponse } from "../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission, scopeFromRequest } from "../../lib/server/authz";
import { sessionFromRequest } from "../../lib/auth-session";
import { insertApplication, listApplications, reviewApplication, type LeaderApplication } from "../../lib/server/db/leader-apps-repo";

export async function GET(request: Request) {
  const url = new URL(request.url);

  // ---- Leader Mode: application context for the rider-facing form ---------
  // Returns the rider's franchise (only if leaderMode), its stations, and the
  // rider's own pending applications. Empty when the flag is off.
  if (url.searchParams.get("applyContext") === "1") {
    const session = await sessionFromRequest(request);
    if (!session) return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    await refreshCollectionsFromDatabase(["riders", "franchises", "pontos"]);
    const rider = memory.riders.find((r) => r.id === session.userId || r.name === session.name);
    if (!rider) return jsonResponse({ data: { eligible: false } });
    const franchise = memory.franchises.find((f) => f.name === rider.franchise && f.leaderMode === true);
    if (!franchise) return jsonResponse({ data: { eligible: false } });
    const stations = memory.pontos
      .filter((p) => p.franchise === franchise.name && (p.stationStatus === undefined || p.stationStatus === "active" || p.stationStatus === "trial"))
      .map((p) => ({ id: p.id, name: p.name }));
    const mine = await listApplications({ applicantRiderId: rider.id });
    return jsonResponse({
      data: {
        eligible: true,
        riderId: rider.id,
        riderName: rider.name,
        franchise: franchise.name,
        currentStation: rider.ponto ?? null,
        stations,
        applications: mine.slice(0, 10),
      },
    });
  }

  // ---- Leader Mode: franchisee/HQ review queue ---------------------------
  if (url.searchParams.get("applications") === "1") {
    const forbidden = requirePermission(request, "view_dashboard");
    if (forbidden) return forbidden;
    const scope = await scopeFromRequest(request);
    const status = url.searchParams.get("status") ?? "pending";
    const rows = await listApplications({
      ...(scope.franchise ? { franchise: scope.franchise } : {}),
      ...(status !== "all" ? { status } : {}),
    });
    return jsonResponse({ data: rows });
  }

  await refreshCollectionsFromDatabase(["leaders"]);
  return jsonResponse({ data: memory.leaders });
}

const APP_KINDS = new Set(["open_station", "join_station", "transfer"]);

async function postImpl(request: Request) {
  const body = await request.json().catch(() => ({}));

  // ---- Leader Mode: rider submits an application (no leader in the loop) --
  if (body.action === "submitApplication") {
    const session = await sessionFromRequest(request);
    if (!session) return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    const kind = String(body.kind ?? "");
    if (!APP_KINDS.has(kind)) return jsonResponse({ error: "invalid kind" }, { status: 400 });

    await refreshCollectionsFromDatabase(["riders", "franchises", "pontos", "riderDailyKpis"]);
    const rider = memory.riders.find((r) => r.id === session.userId || r.name === session.name);
    if (!rider) return jsonResponse({ error: "rider not found" }, { status: 404 });
    const franchise = memory.franchises.find((f) => f.name === rider.franchise && f.leaderMode === true);
    if (!franchise) return jsonResponse({ error: "leader mode not enabled for your franchise" }, { status: 403 });

    // One pending application per rider (any kind).
    const mine = await listApplications({ applicantRiderId: rider.id, status: "pending" });
    if (mine.length > 0) return jsonResponse({ error: "you already have a pending application" }, { status: 409 });

    // Eligibility snapshot from the last 28 days of T+1 rows (frozen at submit).
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 28);
    const sinceYmd = since.toISOString().slice(0, 10);
    const rows = memory.riderDailyKpis.filter((row) => row.rider99Id === rider.ninetyNineId && row.date >= sinceYmd);
    const eligibility = {
      orders28d: rows.reduce((sum, row) => sum + (row.completedOrders ?? 0), 0),
      activeDays28d: new Set(rows.filter((row) => (row.completedOrders ?? 0) > 0).map((row) => row.date)).size,
    };

    const targetStationId = body.targetStationId ? String(body.targetStationId) : undefined;
    if ((kind === "join_station" || kind === "transfer") && !targetStationId) {
      return jsonResponse({ error: "targetStationId is required" }, { status: 400 });
    }
    const proposedStationName = body.proposedStationName ? String(body.proposedStationName).slice(0, 60) : undefined;
    if (kind === "open_station" && !proposedStationName) {
      return jsonResponse({ error: "proposedStationName is required" }, { status: 400 });
    }

    const application: LeaderApplication = {
      id: `lapp-${rider.id}-${Date.now()}`,
      kind: kind as LeaderApplication["kind"],
      franchise: franchise.name,
      applicantRiderId: rider.id,
      applicantName: rider.name,
      ...(targetStationId ? { targetStationId } : {}),
      ...(proposedStationName ? { proposedStationName } : {}),
      channel: "self",
      eligibility,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    await insertApplication(application);
    appendServerAudit({
      actor: "rider",
      action: "LEADER_APPLICATION_SUBMITTED",
      entity: "LeaderApplication",
      entityId: application.id,
      detail: `${rider.name} 提交${kind === "open_station" ? "开站" : kind === "join_station" ? "入站" : "转站"}申请（${franchise.name}）。`,
      risk: "Low",
    });
    return jsonResponse({ data: application }, { status: 201 });
  }

  // ---- Leader Mode: franchisee/HQ review — approval EXECUTES the change ---
  if (body.action === "reviewApplication") {
    const forbidden = requirePermission(request, "manage_leaders");
    if (forbidden) return forbidden;
    const id = String(body.id ?? "");
    const decision = body.decision === "approved" ? "approved" : body.decision === "rejected" ? "rejected" : null;
    if (!id || !decision) return jsonResponse({ error: "id and decision (approved|rejected) are required" }, { status: 400 });

    const scope = await scopeFromRequest(request);
    const pending = await listApplications({ status: "pending", ...(scope.franchise ? { franchise: scope.franchise } : {}) });
    const application = pending.find((row) => row.id === id);
    if (!application) return jsonResponse({ error: "pending application not found" }, { status: 404 });

    await refreshCollectionsFromDatabase(["riders", "pontos"]);
    const riderIndex = memory.riders.findIndex((r) => r.id === application.applicantRiderId);

    if (decision === "approved") {
      if (riderIndex === -1) return jsonResponse({ error: "applicant rider no longer exists" }, { status: 409 });
      if (application.kind === "open_station") {
        // Create the trial station and bind the applicant as its leader.
        const stationId = makeServerId("p", memory.pontos.length + 1);
        const today = new Date().toISOString().slice(0, 10);
        memory.pontos.unshift({
          id: stationId,
          name: application.proposedStationName ?? `Estação ${application.applicantName}`,
          bairro: "",
          ridersCount: 1,
          nightShiftLevel: "—",
          leader: application.applicantName,
          safetyScore: 0,
          lat: 0,
          lng: 0,
          franchise: application.franchise,
          status: "approved",
          virtual: true,
          stationStatus: "trial",
          trialStartedAt: today,
          leaderRiderId: application.applicantRiderId,
        });
        memory.riders[riderIndex] = { ...memory.riders[riderIndex], ponto: application.proposedStationName ?? `Estação ${application.applicantName}` };
      } else {
        // join_station / transfer: rebind to the target station.
        const station = memory.pontos.find((p) => p.id === application.targetStationId);
        if (!station) return jsonResponse({ error: "target station not found" }, { status: 409 });
        memory.riders[riderIndex] = { ...memory.riders[riderIndex], ponto: station.name, franchise: application.franchise };
      }
    }

    await reviewApplication(id, decision, "franchise", String(body.note ?? ""));
    appendServerAudit({
      actor: "franchise",
      action: decision === "approved" ? "LEADER_APPLICATION_APPROVED" : "LEADER_APPLICATION_REJECTED",
      entity: "LeaderApplication",
      entityId: id,
      detail: `${application.applicantName} 的${application.kind === "open_station" ? "开站" : application.kind === "join_station" ? "入站" : "转站"}申请${decision === "approved" ? "已批准并执行" : "被拒绝"}。`,
      risk: "Medium",
    });
    return jsonResponse({ data: { id, decision } });
  }

  // ---- Legacy: create leader profile (HQ) --------------------------------
  const forbidden = requirePermission(request, "manage_leaders");
  if (forbidden) return forbidden;

  if (!body.name || !body.phone) {
    return jsonResponse({ error: "name and phone are required" }, { status: 400 });
  }

  const id = acceptClientId(body.id) ?? makeServerId("l", memory.leaders.length + 1);
  const existing = memory.leaders.find((item) => item.id === id);
  if (existing) return jsonResponse({ data: existing });

  const leader = {
    id,
    name: String(body.name),
    phone: String(body.phone),
    ponto: String(body.ponto ?? "Unassigned"),
    ridersCount: Number(body.ridersCount ?? 0),
    nightShiftCoverage: Number(body.nightShiftCoverage ?? 0),
    rating: Number(body.rating ?? 4),
    level: String(body.level ?? "New"),
    joinDate: String(body.joinDate ?? new Date().toISOString().slice(0, 10)),
    incidents: Number(body.incidents ?? 0),
  };

  memory.leaders.unshift(leader);
  return jsonResponse({ data: leader }, { status: 201 });
}

// Serverless safety: flush mutations to the database BEFORE returning —
// the instance may freeze right after the response, losing a debounced flush.
export async function POST(...args: Parameters<typeof postImpl>) {
  const response = await postImpl(...args);
  await flushPendingToDatabase();
  return response;
}
