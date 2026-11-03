import { acceptClientId, appendServerAudit, makeServerId, memory, jsonResponse } from "../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission, scopeFromRequest } from "../../lib/server/authz";
import { sessionFromRequest } from "../../lib/auth-session";
import { insertApplication, listApplications, reviewApplication, type LeaderApplication } from "../../lib/server/db/leader-apps-repo";

/** The rider behind a session and the leader team they run (if any). */
async function leaderContext(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return { error: jsonResponse({ error: "Unauthorized" }, { status: 401 }) } as const;
  await refreshCollectionsFromDatabase(["riders", "franchises", "pontos"]);
  const me = memory.riders.find((r) => r.id === session.userId || r.name === session.name);
  const team = me
    ? memory.pontos.find((p) => p.leaderRiderId === me.id && (p.stationStatus === "trial" || p.stationStatus === "active" || p.stationStatus === undefined))
    : undefined;
  const franchise = team ? memory.franchises.find((f) => f.name === team.franchise && f.leaderMode === true) : undefined;
  if (!me || !team || !franchise) return { error: jsonResponse({ error: "Só o líder de uma equipe pode convidar." }, { status: 403 }) } as const;
  return { me, team, franchise } as const;
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

export async function GET(request: Request) {
  const url = new URL(request.url);

  // ---- Leader Mode: a leader looks up a rider to invite (same city only) ---
  // Returns name + last 4 of the 99 ID + which team they are in — no CPF,
  // phone or Pix. Name (≥3 letters) or 99 ID / phone digits (≥4).
  if (url.searchParams.get("inviteSearch") !== null) {
    const ctx = await leaderContext(request);
    if ("error" in ctx) return ctx.error;
    const q = (url.searchParams.get("inviteSearch") ?? "").trim();
    const digits = q.replace(/\D/g, "");
    const byDigits = digits.length >= 4 && digits.length === q.replace(/[\s.()+-]/g, "").length;
    const { TEAM_SIZE, teamMemberCount } = await import("../../lib/leader-mode");
    const capacity = { members: teamMemberCount(ctx.team, memory.riders), max: TEAM_SIZE.max, min: TEAM_SIZE.min, reviewRequired: ctx.franchise.leaderInviteReview === true };
    if (!byDigits && fold(q).length < 3) return jsonResponse({ data: { results: [], ...capacity } });
    const stationByName = new Map(memory.pontos.map((p) => [p.name, p]));
    const results = memory.riders
      .filter((r) => r.franchise === ctx.franchise.name && r.id !== ctx.me.id)
      .filter((r) =>
        byDigits
          ? String(r.ninetyNineId ?? "").endsWith(digits) || String(r.phone ?? "").replace(/\D/g, "").endsWith(digits)
          : fold(r.name).includes(fold(q)),
      )
      .slice(0, 8)
      .map((r) => {
        const st = r.ponto ? stationByName.get(r.ponto) : undefined;
        const inTeam = !!st?.leaderRiderId;
        return {
          id: r.id,
          name: r.name,
          id4: String(r.ninetyNineId ?? "").slice(-4),
          team: inTeam ? st!.name : null,
          inMyTeam: st?.id === ctx.team.id,
          isLeader: memory.pontos.some((p) => p.leaderRiderId === r.id && p.stationStatus !== "closed"),
        };
      });
    return jsonResponse({ data: { results, ...capacity } });
  }

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
    // Joinable = leader teams (a station with a leader). The pool / parent
    // stations have no leader, so there is nothing to "join" there.
    const stations = memory.pontos
      .filter((p) => p.franchise === franchise.name && !!p.leaderRiderId && (p.stationStatus === undefined || p.stationStatus === "active" || p.stationStatus === "trial"))
      .map((p) => ({ id: p.id, name: p.leader ? `${p.name} (líder: ${p.leader})` : p.name }));
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

  // ---- Leader Mode: a leader invites a rider into their team ---------------
  // 业务方 2026-10-31. Rider with no team → joins at once (HQ notified) unless
  // HQ switched invites to review; rider already in another team → transfer
  // request for HQ review. Team cap TEAM_SIZE.max (leader excluded).
  if (body.action === "inviteToTeam") {
    const ctx = await leaderContext(request);
    if ("error" in ctx) return ctx.error;
    await refreshCollectionsFromDatabase(["notifications"]);
    const { TEAM_SIZE, teamMemberCount } = await import("../../lib/leader-mode");
    const riderIndex = memory.riders.findIndex((r) => r.id === String(body.riderId ?? ""));
    const invitee = riderIndex === -1 ? undefined : memory.riders[riderIndex];
    if (!invitee || invitee.franchise !== ctx.franchise.name) return jsonResponse({ error: "Entregador não encontrado na sua cidade." }, { status: 404 });
    if (invitee.id === ctx.me.id) return jsonResponse({ error: "Você já é o líder desta equipe." }, { status: 400 });
    if (invitee.ponto === ctx.team.name) return jsonResponse({ error: "Este entregador já está na sua equipe." }, { status: 409 });
    if (memory.pontos.some((p) => p.leaderRiderId === invitee.id && p.stationStatus !== "closed")) {
      return jsonResponse({ error: "Este entregador é líder de outra equipe." }, { status: 409 });
    }
    if (teamMemberCount(ctx.team, memory.riders) >= TEAM_SIZE.max) {
      return jsonResponse({ error: `Sua equipe já tem ${TEAM_SIZE.max} entregadores (máximo).`, code: "team_full" }, { status: 409 });
    }
    const pendingMine = await listApplications({ applicantRiderId: invitee.id, status: "pending" });
    if (pendingMine.length > 0) return jsonResponse({ error: "Este entregador já tem um pedido em análise." }, { status: 409 });

    const current = invitee.ponto ? memory.pontos.find((p) => p.name === invitee.ponto) : undefined;
    const inOtherTeam = !!current?.leaderRiderId;
    const needsReview = inOtherTeam || ctx.franchise.leaderInviteReview === true;
    const stamp = new Date().toISOString();
    const application: LeaderApplication = {
      id: `lapp-inv-${invitee.id}-${Date.now()}`,
      kind: inOtherTeam ? "transfer" : "join_station",
      franchise: ctx.franchise.name,
      applicantRiderId: invitee.id,
      applicantName: invitee.name,
      targetStationId: ctx.team.id,
      channel: "leader_referral",
      referrerStationId: ctx.team.id,
      eligibility: { orders28d: 0, activeDays28d: 0 },
      status: needsReview ? "pending" : "approved",
      ...(needsReview ? {} : { reviewedBy: "auto (convite do líder)", reviewedAt: stamp }),
      createdAt: stamp,
    };
    await insertApplication(application);
    if (!needsReview) {
      memory.riders[riderIndex] = { ...invitee, ponto: ctx.team.name };
    }
    memory.notifications.unshift({
      id: `ntf-linv-${invitee.id}-${Date.now()}`,
      title: needsReview ? `组长邀请待审核:${ctx.team.name}` : `组长邀请已入组:${ctx.team.name}`,
      body: needsReview
        ? `组长 ${ctx.me.name} 邀请 ${invitee.name}${inOtherTeam ? `(现属「${current!.name}」,需转队)` : ""} 加入「${ctx.team.name}」,请到「组长考核」审核。`
        : `组长 ${ctx.me.name} 邀请 ${invitee.name} 加入「${ctx.team.name}」,已直接入组(原:${invitee.ponto || "未分配"})。`,
      href: "/assessment/boavista",
      source: "System",
      sourceId: application.id,
      severity: needsReview ? "Medium" : "Low",
      createdAt: nowStamp(),
    } as (typeof memory.notifications)[number]);
    appendServerAudit({
      actor: ctx.me.name,
      action: needsReview ? "LEADER_INVITE_SUBMITTED" : "LEADER_INVITE_JOINED",
      entity: "Rider",
      entityId: invitee.id,
      detail: `${ctx.me.name} 邀请 ${invitee.name} → ${ctx.team.name}${needsReview ? "(待后台审核)" : `(直接入组,原 ${invitee.ponto || "Unassigned"})`}`,
      risk: "Low",
    });
    return jsonResponse({ data: { status: application.status, team: ctx.team.name } }, { status: 201 });
  }

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
    const proposedStationName = body.proposedStationName ? String(body.proposedStationName).trim().slice(0, 60) : undefined;
    if (kind === "open_station" && !proposedStationName) {
      return jsonResponse({ error: "proposedStationName is required" }, { status: 400 });
    }
    // Station names are the binding key (rider.ponto / import tagging match by
    // name) — a duplicate would cross-wire two stations' data. Reject early.
    if (proposedStationName && memory.pontos.some((p) => p.name.trim().toLowerCase() === proposedStationName.toLowerCase())) {
      return jsonResponse({ error: "Já existe uma estação com esse nome — escolha outro." }, { status: 409 });
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
        // Re-check name uniqueness at approval time (another station may have
        // been created between submit and review).
        const proposed = application.proposedStationName ?? `Estação ${application.applicantName}`;
        if (memory.pontos.some((p) => p.name.trim().toLowerCase() === proposed.trim().toLowerCase())) {
          return jsonResponse({ error: `站名已存在：${proposed}。请让申请人换名重新提交。` }, { status: 409 });
        }
        // Create the trial station and bind the applicant as its leader.
        const stationId = makeServerId("p", memory.pontos.length + 1);
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
        // One station, many leaders: the new team sits under the franchise's
        // pool station (same name as the franchise) when there is one.
        const pool = memory.pontos.find((p) => p.franchise === application.franchise && p.name === application.franchise && !p.parentStationId);
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
          leaderHistory: [{ riderId: application.applicantRiderId, from: today }],
          ...(pool ? { parentStationId: pool.id } : {}),
        });
        memory.riders[riderIndex] = { ...memory.riders[riderIndex], ponto: application.proposedStationName ?? `Estação ${application.applicantName}` };
      } else {
        // join_station / transfer: rebind to the target station.
        const station = memory.pontos.find((p) => p.id === application.targetStationId);
        if (!station) return jsonResponse({ error: "target station not found" }, { status: 409 });
        if (station.leaderRiderId) {
          const { TEAM_SIZE, teamMemberCount } = await import("../../lib/leader-mode");
          if (memory.riders[riderIndex].ponto !== station.name && teamMemberCount(station, memory.riders) >= TEAM_SIZE.max) {
            return jsonResponse({ error: `团队「${station.name}」已满 ${TEAM_SIZE.max} 人,不能再加入` }, { status: 409 });
          }
        }
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
