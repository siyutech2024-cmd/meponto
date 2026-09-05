import { acceptClientId, appendServerAudit, makeServerId, memory, jsonResponse } from "../../lib/server/memory";
import { flushPendingToDatabase, persistDeleteRecord, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { getAvailablePoints } from "../../lib/points";
import { requirePermission, roleFromRequest, scopeFromRequest } from "../../lib/server/authz";
import { parseProRoster, type Rider, type RiderStatus } from "../../lib/data";
import { getRiderSensitiveRevealDecision, maskRiderSensitive } from "../../lib/masking";

const COLLECTIONS = ["riders", "riderDailyKpis", "pointsLedgerEntries"];
// riderDailyKpis is by far the largest collection here (months of daily rows)
// and only changes when a new report lands — refresh it at most once a minute
// per instance instead of on every list request.
const KPI_REFRESH_TTL_MS = 60_000;
let kpiRefreshedAt = 0;

/**
 * Lazy self-heal: merge duplicate rider profiles that share one 99 ID.
 * Cross-instance races in live-board auto-materialization created twins with
 * random ids, splitting one rider's points across two profiles (and making
 * the twin show a bogus "no PIX" badge). Idempotent; keeps the profile with
 * the most ledger history, unions missing fields from the twin, remaps every
 * rider-keyed record, then deletes the twin (with a delete record so it can't
 * resurrect from the DB).
 */
async function mergeDuplicateRiderProfiles(): Promise<number> {
  const groups = new Map<string, Rider[]>();
  const seenIds = new Set<string>();
  for (const rider of memory.riders) {
    const key = String(rider.ninetyNineId ?? "").trim();
    if (!key) continue;
    // Same id twice is NOT two profiles — it is one record that entered the
    // collection twice (a paged read that overlapped). Merging it "into
    // itself" spliced the record out of memory and queued a delete of its own
    // database row; the rider then rendered as an unassigned "日报·未建档"
    // row. Only distinct ids can be duplicates of each other.
    if (typeof rider.id === "string") {
      if (seenIds.has(rider.id)) continue;
      seenIds.add(rider.id);
    }
    const list = groups.get(key) ?? [];
    list.push(rider);
    groups.set(key, list);
  }
  if (![...groups.values()].some((list) => list.length > 1)) return 0;
  // Duplicates found (rare): pull the rider-keyed collections fresh BEFORE
  // remapping, so we never write stale copies of orders/cash rows back over
  // newer DB state.
  await refreshCollectionsFromDatabase(["marketplaceOrders", "cashLedgerEntries", "cashTopUps", "mallPayments", "memberMessages", "taskClaims"]);
  let mergedCount = 0;
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const ledgerRefs = (id: string) => memory.pointsLedgerEntries.filter((entry) => entry.riderId === id).length;
    const score = (rider: Rider) => ledgerRefs(rider.id) * 1000 + (String(rider.pix ?? "").trim() ? 100 : 0) + (rider.franchise && rider.franchise !== "Unassigned" ? 10 : 0);
    const sorted = [...list].sort((a, b) => score(b) - score(a));
    const primary = sorted[0];
    for (const dup of sorted.slice(1)) {
      // Remap every rider-keyed record to the surviving profile.
      const remap = <T extends { riderId?: string }>(rows: T[]) => {
        for (let index = 0; index < rows.length; index += 1) {
          if (rows[index].riderId === dup.id) rows[index] = { ...rows[index], riderId: primary.id };
        }
      };
      remap(memory.pointsLedgerEntries as Array<{ riderId?: string }>);
      remap(memory.marketplaceOrders as Array<{ riderId?: string }>);
      remap(memory.cashLedgerEntries as Array<{ riderId?: string }>);
      remap(memory.cashTopUps as Array<{ riderId?: string }>);
      remap(memory.mallPayments as Array<{ riderId?: string }>);
      remap(memory.memberMessages as Array<{ riderId?: string }>);
      // Task claims embed the rider id in their idempotency key — rebuild it.
      for (let index = 0; index < memory.taskClaims.length; index += 1) {
        const claim = memory.taskClaims[index] as { id: string; riderId?: string };
        if (claim.riderId === dup.id) {
          const rebuiltId = claim.id.includes(dup.id) ? claim.id.split(dup.id).join(primary.id) : claim.id;
          memory.taskClaims[index] = { ...memory.taskClaims[index], riderId: primary.id, id: rebuiltId };
          persistDeleteRecord("taskClaims", claim.id);
        }
      }
      // Union missing profile fields from the twin into the survivor.
      const primaryIndex = memory.riders.findIndex((rider) => rider.id === primary.id);
      if (primaryIndex !== -1) {
        const current = memory.riders[primaryIndex];
        memory.riders[primaryIndex] = {
          ...current,
          pix: String(current.pix ?? "").trim() || dup.pix || "",
          phone: String(current.phone ?? "").trim() || dup.phone || "",
          cpf: String(current.cpf ?? "").trim() || dup.cpf || "",
          bairro: String(current.bairro ?? "").trim() || dup.bairro || "",
          franchise: current.franchise && current.franchise !== "Unassigned" ? current.franchise : dup.franchise ?? current.franchise,
          ponto: current.ponto && current.ponto !== "Unassigned" ? current.ponto : dup.ponto ?? current.ponto,
        };
      }
      if (dup.id === primary.id) continue; // paranoia: never delete the survivor
      const dupIndex = memory.riders.findIndex((rider) => rider.id === dup.id);
      if (dupIndex !== -1) memory.riders.splice(dupIndex, 1);
      // Only queue the database delete once the id is really gone from memory
      // — a delete for a still-present id would race the flush guard.
      if (!memory.riders.some((rider) => rider.id === dup.id)) persistDeleteRecord("riders", dup.id);
      appendServerAudit({ actor: "System", action: "RIDER_DUPLICATE_MERGED", entity: "Rider", entityId: primary.id, detail: `99 ${key}: merged duplicate ${dup.id} into ${primary.id} (ledger/orders/cash/claims remapped).`, risk: "Medium" });
      mergedCount += 1;
    }
  }
  return mergedCount;
}

/** Legacy/self-signup rows used lowercase statuses — normalize for filters. */
function normalizeStatus(status: string | undefined): RiderStatus {
  const map: Record<string, RiderStatus> = { active: "Active", inactive: "Inactive", risk: "Risk", "night shift": "Night Shift" };
  return map[String(status ?? "").toLowerCase()] ?? ((status as RiderStatus) || "Active");
}

export async function GET(request: Request) {
  const reveal = getRiderSensitiveRevealDecision(request, roleFromRequest(request));

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

  const refreshKpis = Date.now() - kpiRefreshedAt > KPI_REFRESH_TTL_MS;
  await refreshCollectionsFromDatabase(refreshKpis ? COLLECTIONS : ["riders", "pointsLedgerEntries"]);

  // Self-heal duplicate profiles (same 99 ID) before building the list —
  // repairs the split-points twins created by earlier materialization races.
  const mergedProfiles = await mergeDuplicateRiderProfiles();
  if (mergedProfiles > 0) await flushPendingToDatabase();
  if (refreshKpis) kpiRefreshedAt = Date.now();

  // Points ledger for one rider (detail page 积分明细).
  const pointsFor = new URL(request.url).searchParams.get("pointsFor");
  if (pointsFor) {
    const entries = memory.pointsLedgerEntries
      .filter((entry) => entry.riderId === pointsFor)
      .sort((a, b) => (b.id > a.id ? 1 : -1))
      .slice(0, 100)
      .map((entry) => ({ id: entry.id, type: entry.type, points: entry.points, status: entry.status, sourceType: entry.sourceType, note: entry.note, reasonCode: entry.reasonCode, expiresAt: entry.expiresAt ?? null, balanceAfter: entry.balanceAfter }));
    return jsonResponse({ data: { entries, balance: getAvailablePoints(memory.pointsLedgerEntries, pointsFor) } });
  }

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

  // Single pass over the ledger for ALL balances (same semantics as
  // getAvailablePoints) — the per-rider scan was O(riders × ledger) and the
  // main CPU cost of this endpoint.
  const balanceByRider = new Map<string, number>();
  for (const entry of memory.pointsLedgerEntries) {
    if (entry.status !== "approved") continue;
    const positive = entry.type === "earn" || entry.type === "refund" || entry.type === "release" || entry.type === "adjust";
    const negative = entry.type === "spend" || entry.type === "expire" || entry.type === "reverse" || entry.type === "hold";
    if (!positive && !negative) continue;
    balanceByRider.set(entry.riderId, (balanceByRider.get(entry.riderId) ?? 0) + (positive ? entry.points : -entry.points));
  }

  const data = base.map((rider) => {
    const stats = rider.ninetyNineId ? reportStats.get(rider.ninetyNineId) : undefined;
    return {
      ...rider,
      status: normalizeStatus(rider.status),
      pointsBalance: balanceByRider.get(rider.id) ?? 0,
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

  // CPF 搜索(2026-09-06,提报骑手选择器):客户端只拿到脱敏 CPF(***.***.***-39),
  // 无法自己按 CPF 找人,所以由服务端用完整 CPF 做包含匹配,只返回**命中的骑手 id**,
  // CPF 本身仍按脱敏规则输出。至少 4 位数字才搜,避免 1~2 位把全员都命中。
  const cpfSearch = (new URL(request.url).searchParams.get("cpfSearch") ?? "").replace(/\D/g, "");
  const cpfMatchIds = cpfSearch.length >= 4
    ? new Set(memory.riders.filter((rider) => (rider.cpf ?? "").replace(/\D/g, "").includes(cpfSearch)).map((rider) => rider.id))
    : null;
  const withCpfMatch = <T extends { id: string }>(rows: T[]) => (cpfMatchIds ? rows.filter((rider) => cpfMatchIds.has(rider.id)) : rows);

  // Franchise/station portals only see their own riders; report-only riders
  // (unassigned by definition) belong to HQ.
  const scope = await scopeFromRequest(request);
  if (scope.station) {
    return jsonResponse({ data: withCpfMatch(data.filter((rider) => rider.ponto === scope.station)), scoped: true });
  }
  if (scope.franchise) {
    return jsonResponse({ data: withCpfMatch(data.filter((rider) => rider.franchise === scope.franchise)), scoped: true });
  }

  return jsonResponse({ data: cpfMatchIds ? withCpfMatch(data) : [...data, ...reportOnly] });
}

type AssignBody = { action: "assign" | "updateProfile"; riderId: string; ponto?: string; franchise?: string; status?: string; pool?: "standard" | "pro" };

/** 模式二 · PRO 名单导入 (closure matrix §9) — parser lives in lib/data.ts. */
type ProImportBody = { action: "importPro"; text: string; ponto?: string; franchise?: string };


async function handlePost(request: Request) {
  const forbidden = requirePermission(request, "manage_riders");
  if (forbidden) return forbidden;

  await refreshCollectionsFromDatabase(COLLECTIONS);
  const body = (await request.json()) as Partial<Rider> & Partial<AssignBody> & Partial<ProImportBody> & { action?: string };
  const actor = roleFromRequest(request);

  // Update editable profile fields (detail page form).
  if (body.action === "updateProfile") {
    const riderId = String((body as { riderId?: string }).riderId ?? "");
    const index = memory.riders.findIndex((item) => item.id === riderId);
    if (index === -1) return jsonResponse({ error: "Rider not found" }, { status: 404 });
    const fields = ["name", "cpf", "phone", "pix", "bairro", "vehicleType", "brand", "model"] as const;
    const patch: Record<string, string> = {};
    for (const field of fields) {
      const value = (body as Record<string, unknown>)[field];
      if (typeof value === "string") patch[field] = value.trim();
    }
    if (typeof body.status === "string") patch.status = normalizeStatus(body.status);
    memory.riders[index] = { ...memory.riders[index], ...patch };
    appendServerAudit({ actor, action: "RIDER_PROFILE_UPDATED", entity: "Rider", entityId: riderId, detail: `${memory.riders[index].name}: ${Object.keys(patch).join(", ")} updated.`, risk: "Low" });
    await flushPendingToDatabase();
    return jsonResponse({ data: memory.riders[index] });
  }

  // 模式二 · PRO 名单批量建档 (closure matrix §9). HQ only — the pool gate is
  // "入池权收口在总部", and this creates riders, not just tags them.
  if (body.action === "importPro") {
    const scope = await scopeFromRequest(request);
    if (scope.franchise || scope.station) {
      return jsonResponse({ error: "Somente a matriz pode importar a lista PRO." }, { status: 403 });
    }
    const { text, ponto, franchise } = body as unknown as ProImportBody;
    const parsed = parseProRoster(String(text ?? ""));
    if (parsed.length === 0) {
      return jsonResponse({ error: "没有识别到任何骑手行(每行需含 99 ID)" }, { status: 400 });
    }

    const created: string[] = [];
    const promoted: string[] = [];
    const skipped: string[] = [];
    for (const row of parsed) {
      const existing = memory.riders.find((item) => item.ninetyNineId === row.rider99Id);
      if (existing) {
        // Already on file (e.g. moved over from the standard pool) — never
        // duplicate a profile, just move it into the PRO pool.
        if ((existing.pool ?? "standard") === "pro") {
          skipped.push(row.rider99Id);
          continue;
        }
        const index = memory.riders.findIndex((item) => item.id === existing.id);
        memory.riders[index] = { ...memory.riders[index], pool: "pro" };
        appendServerAudit({ actor, action: "RIDER_POOL_CHANGED", entity: "Rider", entityId: existing.id, detail: `${existing.name}: pool standard → pro (PRO roster import).`, risk: "Medium" });
        promoted.push(row.rider99Id);
        continue;
      }
      const rider: Rider = {
        id: makeServerId("r", memory.riders.length + 1 + created.length),
        name: row.name || `99 ${row.rider99Id}`,
        cpf: row.cpf,
        pix: "",
        phone: row.phone,
        bairro: "",
        ponto: ponto?.trim() || "Unassigned",
        leader: "Unassigned",
        invitedBy: "PRO roster import",
        chatRoom: "MePonto Intake",
        ar: 100,
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
        ninetyNineId: row.rider99Id,
        franchise: franchise?.trim() || "Unassigned",
        pool: "pro",
        birthday: "",
      };
      memory.riders.unshift(rider);
      created.push(row.rider99Id);
      appendServerAudit({ actor, action: "RIDER_POOL_CHANGED", entity: "Rider", entityId: rider.id, detail: `${rider.name} (99 ${row.rider99Id}) created directly in the PRO pool (roster import).`, risk: "Medium" });
    }

    appendServerAudit({
      actor,
      action: "RIDER_PRO_ROSTER_IMPORTED",
      entity: "Rider",
      entityId: new Date().toISOString().slice(0, 10),
      detail: `PRO roster import: ${created.length} created, ${promoted.length} promoted, ${skipped.length} already PRO (${parsed.length} rows parsed).`,
      risk: "Medium",
    });
    await flushPendingToDatabase();
    return jsonResponse({ data: { parsed: parsed.length, created: created.length, promoted: promoted.length, skipped: skipped.length } });
  }

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

    // Enforce station ⇄ franchise consistency server-side.
    await refreshCollectionsFromDatabase(["pontos"]);
    let nextPonto = body.ponto !== undefined ? String(body.ponto) || "Unassigned" : memory.riders[index].ponto;
    let nextFranchise = body.franchise !== undefined ? String(body.franchise) || "Unassigned" : memory.riders[index].franchise ?? "Unassigned";
    if (nextPonto !== "Unassigned") {
      const station = memory.pontos.find((p) => p.name === nextPonto);
      if (!station) return jsonResponse({ error: `站点「${nextPonto}」不存在` }, { status: 400 });
      if (station.franchise) nextFranchise = station.franchise; // station wins
    }
    if (nextFranchise !== "Unassigned" && nextPonto !== "Unassigned") {
      const station = memory.pontos.find((p) => p.name === nextPonto);
      if (station?.franchise && station.franchise !== nextFranchise) {
        return jsonResponse({ error: `站点「${nextPonto}」不属于加盟商「${nextFranchise}」` }, { status: 400 });
      }
    }
    // Franchise changed and current station no longer matches → reset station.
    if (body.franchise !== undefined && body.ponto === undefined && nextPonto !== "Unassigned") {
      const station = memory.pontos.find((p) => p.name === nextPonto);
      if (station?.franchise && station.franchise !== nextFranchise) nextPonto = "Unassigned";
    }

    // 模式二: pool changes are audited SEPARATELY (who moved whom in/out of
    // the PRO pool must always be answerable — plan doc §3-S0 / M1).
    const prevPool = memory.riders[index].pool ?? "standard";
    const nextPool = body.pool === "pro" || body.pool === "standard" ? body.pool : undefined;

    memory.riders[index] = {
      ...memory.riders[index],
      ponto: nextPonto,
      franchise: nextFranchise,
      ...(nextPool !== undefined ? { pool: nextPool } : {}),
      ...(body.status !== undefined ? { status: normalizeStatus(String(body.status)) } : {}),
    };
    appendServerAudit({ actor, action: "RIDER_ASSIGNED", entity: "Rider", entityId: riderId, detail: `${memory.riders[index].name} → ponto ${memory.riders[index].ponto} / franchise ${memory.riders[index].franchise} / ${memory.riders[index].status}.`, risk: "Low" });
    if (nextPool !== undefined && nextPool !== prevPool) {
      appendServerAudit({ actor, action: "RIDER_POOL_CHANGED", entity: "Rider", entityId: riderId, detail: `${memory.riders[index].name}: pool ${prevPool} → ${nextPool}.`, risk: "Medium" });
    }
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
