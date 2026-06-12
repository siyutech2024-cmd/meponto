import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../lib/server/memory";
import { flushPendingToDatabase, persistDeleteRecord, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission, roleFromRequest, scopeFromRequest } from "../../lib/server/authz";
import type { Franchise } from "../../lib/network";

const COLLECTIONS = ["franchises", "pontos"];
const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

export async function GET(request: Request) {
  // Public marketing summary: franchise names + station counts only.
  if (new URL(request.url).searchParams.get("public") === "1") {
    await refreshCollectionsFromDatabase(COLLECTIONS);
    const counts = new Map<string, number>();
    for (const ponto of memory.pontos) {
      if (ponto.status === "pending") continue;
      counts.set(ponto.franchise ?? "São Paulo", (counts.get(ponto.franchise ?? "São Paulo") ?? 0) + 1);
    }
    const markers = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 6);
    return jsonResponse({ data: { markers, totalStations: memory.pontos.length, totalFranchises: memory.franchises.length } });
  }

  const forbidden = requirePermission(request, "view_dashboard");
  if (forbidden) return forbidden;
  await refreshCollectionsFromDatabase(COLLECTIONS);
  const scope = await scopeFromRequest(request);

  let stations = memory.pontos;
  let franchiseRows = memory.franchises;
  if (scope.station) {
    stations = stations.filter((ponto) => ponto.name === scope.station);
    const parent = stations[0]?.franchise;
    franchiseRows = franchiseRows.filter((f) => f.name === parent);
  } else if (scope.franchise) {
    stations = stations.filter((ponto) => ponto.franchise === scope.franchise);
    franchiseRows = franchiseRows.filter((f) => f.name === scope.franchise);
  }

  // Franchise list enriched with its station count.
  const franchises = franchiseRows.map((franchise) => ({
    ...franchise,
    stationCount: memory.pontos.filter((ponto) => ponto.franchise === franchise.name).length,
  }));
  return jsonResponse({ data: { franchises, stations, scoped: Boolean(scope.franchise || scope.station) } });
}

type Body =
  | { action: "addFranchise"; name: string; owner?: string; phone?: string; city?: string }
  | { action: "deleteFranchise"; franchiseId: string }
  | { action: "depositFranchise"; franchiseId: string; amount: number; note?: string }
  | { action: "addStation"; name: string; franchise: string; address?: string; mapUrl?: string; leader?: string; bairro?: string }
  | { action: "updateStation"; stationId: string; franchise?: string; address?: string; mapUrl?: string; leader?: string; name?: string }
  | { action: "approveStation"; stationId: string }
  | { action: "rejectStation"; stationId: string };

async function handlePost(request: Request) {
  const forbidden = requirePermission(request, "manage_pontos");
  if (forbidden) return forbidden;
  await refreshCollectionsFromDatabase(COLLECTIONS);
  const body = (await request.json().catch(() => ({}))) as Partial<Body> & Record<string, unknown>;
  const actor = roleFromRequest(request);

  switch (body.action) {
    case "addFranchise": {
      const { name, owner = "", phone = "", city = "São Paulo" } = body as Record<string, string>;
      if (!name?.trim()) return jsonResponse({ error: "加盟商名称必填" }, { status: 400 });
      if (memory.franchises.some((f) => f.name === name.trim())) return jsonResponse({ error: "该加盟商已存在" }, { status: 409 });
      const franchise: Franchise = {
        id: makeServerId("fr", memory.franchises.length + 1),
        name: name.trim().slice(0, 60),
        owner: owner.trim().slice(0, 60),
        phone: phone.trim().slice(0, 30),
        city: city.trim().slice(0, 40),
        createdAt: nowStamp(),
      };
      memory.franchises.unshift(franchise);
      appendServerAudit({ actor, action: "FRANCHISE_CREATED", entity: "Franchise", entityId: franchise.id, detail: `${franchise.name} (${franchise.city})`, risk: "Medium" });
      return jsonResponse({ data: franchise }, { status: 201 });
    }

    case "depositFranchise": {
      const { franchiseId, note = "" } = body as { franchiseId?: string; note?: string };
      const amount = Math.round(Number(body.amount) * 100) / 100;
      const index = memory.franchises.findIndex((f) => f.id === franchiseId);
      if (index === -1) return jsonResponse({ error: "franchise not found" }, { status: 404 });
      if (!Number.isFinite(amount) || amount === 0) return jsonResponse({ error: "金额无效" }, { status: 400 });
      const next = Math.round(((memory.franchises[index].depositBalance ?? 0) + amount) * 100) / 100;
      if (next < 0) return jsonResponse({ error: "预存余额不足" }, { status: 409 });
      memory.franchises[index] = { ...memory.franchises[index], depositBalance: next };
      appendServerAudit({ actor, action: amount > 0 ? "FRANCHISE_DEPOSIT" : "FRANCHISE_DEPOSIT_DEDUCT", entity: "Franchise", entityId: franchiseId ?? "", detail: `R$${amount.toFixed(2)} → balance R$${next.toFixed(2)}${note ? ` (${note})` : ""}`, risk: "Medium" });
      return jsonResponse({ data: memory.franchises[index] });
    }

    case "deleteFranchise": {
      const { franchiseId, force = false } = body as { franchiseId?: string; force?: boolean };
      const index = memory.franchises.findIndex((f) => f.id === franchiseId);
      if (index === -1) return jsonResponse({ error: "加盟商不存在（可能已被删除，请刷新页面）" }, { status: 404 });
      const franchise = memory.franchises[index];
      const bound = memory.pontos.filter((ponto) => ponto.franchise === franchise.name);
      if (bound.length > 0 && !force) {
        return jsonResponse(
          {
            error: `「${franchise.name}」绑定了 ${bound.length} 个站点：${bound.map((p) => p.name).join("、")}`,
            boundStations: bound.map((p) => p.name),
            canForce: true,
          },
          { status: 409 },
        );
      }
      // Force-delete: unbind its stations first so nothing dangles.
      for (const station of bound) {
        const stationIndex = memory.pontos.findIndex((p) => p.id === station.id);
        if (stationIndex !== -1) memory.pontos[stationIndex] = { ...memory.pontos[stationIndex], franchise: "" };
      }
      if (bound.length > 0) {
        appendServerAudit({ actor, action: "STATIONS_UNBOUND", entity: "Franchise", entityId: franchiseId ?? "", detail: `${bound.length} stations unbound from ${franchise.name}.`, risk: "Medium" });
      }
      memory.franchises.splice(index, 1);
      // Without this delete record the franchise would resurrect from the DB.
      persistDeleteRecord("franchises", franchiseId ?? "");
      appendServerAudit({ actor, action: "FRANCHISE_DELETED", entity: "Franchise", entityId: franchiseId ?? "", detail: franchise.name, risk: "High" });
      return jsonResponse({ data: { ok: true, unbound: bound.length } });
    }

    case "addStation": {
      const { name, franchise, address = "", mapUrl = "", leader = "", bairro = "" } = body as Record<string, string>;
      if (!name?.trim()) return jsonResponse({ error: "站点名称必填" }, { status: 400 });
      if (!franchise?.trim() || !memory.franchises.some((f) => f.name === franchise.trim())) {
        return jsonResponse({ error: "必须绑定一个已存在的上级加盟商" }, { status: 400 });
      }
      if (!address?.trim() && !mapUrl?.trim()) {
        return jsonResponse({ error: "请填写站点地址或 Google Maps 链接" }, { status: 400 });
      }
      if (memory.pontos.some((p) => p.name === name.trim())) return jsonResponse({ error: "该站点已存在" }, { status: 409 });
      // New stations from franchise/station portals wait for HQ approval.
      const scope = await scopeFromRequest(request);
      const needsApproval = Boolean(scope.franchise || scope.station);
      const station = {
        id: makeServerId("pt", memory.pontos.length + 1),
        name: name.trim().slice(0, 60),
        bairro: bairro.trim().slice(0, 60) || address.split(",")[0]?.trim().slice(0, 60) || "São Paulo",
        ridersCount: 0,
        nightShiftLevel: "Standard",
        leader: leader.trim().slice(0, 60),
        safetyScore: 90,
        lat: 0,
        lng: 0,
        franchise: franchise.trim(),
        address: address.trim().slice(0, 160),
        mapUrl: mapUrl.trim().slice(0, 300),
        status: needsApproval ? "pending" : "approved",
      } as (typeof memory.pontos)[number];
      memory.pontos.unshift(station);
      appendServerAudit({ actor, action: needsApproval ? "STATION_SUBMITTED" : "STATION_CREATED", entity: "Ponto", entityId: station.id, detail: `${station.name} → ${franchise} (${station.address || station.mapUrl})${needsApproval ? " [pending HQ approval]" : ""}`, risk: "Medium" });
      return jsonResponse({ data: station, pendingApproval: needsApproval }, { status: 201 });
    }

    case "approveStation":
    case "rejectStation": {
      // HQ-only review of franchise-submitted stations.
      const scope = await scopeFromRequest(request);
      if (scope.franchise || scope.station) return jsonResponse({ error: "仅总部可审核站点" }, { status: 403 });
      const { stationId } = body as { stationId?: string };
      const index = memory.pontos.findIndex((p) => p.id === stationId);
      if (index === -1) return jsonResponse({ error: "站点不存在" }, { status: 404 });
      const station = memory.pontos[index];
      if (body.action === "approveStation") {
        memory.pontos[index] = { ...station, status: "approved" };
        appendServerAudit({ actor, action: "STATION_APPROVED", entity: "Ponto", entityId: stationId ?? "", detail: station.name, risk: "Medium" });
        return jsonResponse({ data: memory.pontos[index] });
      }
      memory.pontos.splice(index, 1);
      persistDeleteRecord("pontos", stationId ?? "");
      appendServerAudit({ actor, action: "STATION_REJECTED", entity: "Ponto", entityId: stationId ?? "", detail: station.name, risk: "Medium" });
      return jsonResponse({ data: { ok: true } });
    }

    case "updateStation": {
      const { stationId } = body as { stationId?: string };
      const index = memory.pontos.findIndex((p) => p.id === stationId);
      if (index === -1) return jsonResponse({ error: "station not found" }, { status: 404 });
      const fields = body as Record<string, unknown>;
      if (fields.franchise !== undefined && !memory.franchises.some((f) => f.name === String(fields.franchise))) {
        return jsonResponse({ error: "目标加盟商不存在" }, { status: 400 });
      }
      const current = memory.pontos[index];
      memory.pontos[index] = {
        ...current,
        ...(fields.name !== undefined ? { name: String(fields.name).slice(0, 60) } : {}),
        ...(fields.franchise !== undefined ? { franchise: String(fields.franchise).slice(0, 60) } : {}),
        ...(fields.address !== undefined ? { address: String(fields.address).slice(0, 160) } : {}),
        ...(fields.mapUrl !== undefined ? { mapUrl: String(fields.mapUrl).slice(0, 300) } : {}),
        ...(fields.leader !== undefined ? { leader: String(fields.leader).slice(0, 60) } : {}),
      };
      appendServerAudit({ actor, action: "STATION_UPDATED", entity: "Ponto", entityId: stationId ?? "", detail: JSON.stringify(fields).slice(0, 160), risk: "Low" });
      return jsonResponse({ data: memory.pontos[index] });
    }

    default:
      return jsonResponse({ error: "unknown action" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const response = await handlePost(request);
  await flushPendingToDatabase();
  return response;
}
