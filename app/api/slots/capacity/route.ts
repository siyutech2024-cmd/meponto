import { sessionFromRequest } from "../../../lib/auth-session";
import { appendServerAudit, jsonResponse } from "../../../lib/server/memory";
import { getSupabaseServerClient } from "../../../lib/supabase/server";

type CapacityAction =
  | { action: "set_franchise_quota"; quotaId?: string; quota?: number }
  | { action: "set_station_quota"; quotaId?: string; quota?: number }
  | { action: "upsert_station_quota"; franchiseQuotaId?: string; stationTenantId?: string; quota?: number }
  | { action: "set_cycle_status"; cycleId?: string; status?: "allocating" | "open" | "closed" }
  | { action: "clone_next_week"; sourceWeekStart?: string };

export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Authentication required." }, { status: 401 });
  if (!hasSupabase()) return jsonResponse({ error: "Supabase is required." }, { status: 503 });

  const url = new URL(request.url);
  const weekStart = url.searchParams.get("weekStart");
  if (!weekStart) return jsonResponse({ error: "weekStart is required." }, { status: 400 });

  const client = getSupabaseServerClient();
  const { data: cycle, error: cycleError } = await client
    .from("quota_cycles")
    .select("id,business_week_start,business_week_end,status,platform_capacity")
    .eq("business_week_start", weekStart)
    .maybeSingle();
  if (cycleError) return jsonResponse({ error: cycleError.message }, { status: 500 });
  if (!cycle) return jsonResponse({ error: "Quota cycle not found." }, { status: 404 });

  let franchiseQuery = client
    .from("slot_franchise_quotas")
    .select("*")
    .eq("cycle_id", cycle.id)
    .order("slot_date")
    .order("start_time");
  if (session.portal === "franchise") franchiseQuery = franchiseQuery.eq("franchise_tenant_id", session.tenantId);
  if (session.portal === "ponto" || session.portal === "rider") {
    const parentTenant = await parentTenantForStation(session.tenantId);
    franchiseQuery = franchiseQuery.eq("franchise_tenant_id", parentTenant);
  }

  const { data: franchiseRows, error: franchiseError } = await franchiseQuery;
  if (franchiseError) return jsonResponse({ error: franchiseError.message }, { status: 500 });

  const franchiseIds = (franchiseRows ?? []).map((row) => String(row.id));
  let stationRows: Record<string, unknown>[] = [];
  if (franchiseIds.length) {
    let stationQuery = client
      .from("slot_station_quotas")
      .select("*")
      .in("franchise_slot_quota_id", franchiseIds)
      .order("ponto_name");
    if (session.portal === "ponto" || session.portal === "rider") {
      stationQuery = stationQuery.eq("station_tenant_id", session.tenantId);
    }
    const { data, error } = await stationQuery;
    if (error) return jsonResponse({ error: error.message }, { status: 500 });
    stationRows = (data ?? []) as Record<string, unknown>[];
  }

  let availableStations: Array<{ id: string; name: string; pontoId: string }> = [];
  if (session.portal === "franchise") {
    const { data, error } = await client
      .from("tenants")
      .select("id,name,metadata")
      .eq("tenant_type", "station")
      .eq("parent_tenant_id", session.tenantId)
      .order("name");
    if (error) return jsonResponse({ error: error.message }, { status: 500 });
    availableStations = (data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      pontoId: String((row.metadata as Record<string, unknown> | null)?.external_id ?? row.id),
    }));
  }

  return jsonResponse({
    data: {
      cycle: {
        id: String(cycle.id),
        weekStart: String(cycle.business_week_start),
        weekEnd: String(cycle.business_week_end),
        status: String(cycle.status),
        platformCapacity: Number(cycle.platform_capacity ?? 0),
      },
      franchiseQuotas: (franchiseRows ?? []).map((row) => ({
        id: String(row.id),
        date: String(row.slot_date),
        startTime: String(row.start_time).slice(0, 5),
        endTime: String(row.end_time).slice(0, 5),
        franchiseTenantId: String(row.franchise_tenant_id),
        franchiseId: String(row.franchise_external_id),
        franchiseName: String(row.franchise_name),
        quota: Number(row.quota ?? 0),
        stationAllocated: stationRows
          .filter((station) => station.franchise_slot_quota_id === row.id)
          .reduce((sum, station) => sum + Number(station.quota ?? 0), 0),
      })),
      stationQuotas: stationRows.map((row) => ({
        id: String(row.id),
        franchiseSlotQuotaId: String(row.franchise_slot_quota_id),
        stationTenantId: String(row.station_tenant_id),
        pontoId: String(row.ponto_external_id),
        pontoName: String(row.ponto_name),
        riderSlotId: String(row.rider_slot_id),
        quota: Number(row.quota ?? 0),
      })),
      availableStations,
    },
  });
}

export async function POST(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Authentication required." }, { status: 401 });
  if (!hasSupabase()) return jsonResponse({ error: "Supabase is required." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as CapacityAction | null;
  if (!body?.action) return jsonResponse({ error: "action is required." }, { status: 400 });

  const client = getSupabaseServerClient();

  if (body.action === "set_franchise_quota") {
    if (session.role !== "Super Admin") {
      return jsonResponse({ error: "Only headquarters can allocate franchise slot quotas." }, { status: 403 });
    }
    if (!body.quotaId || typeof body.quota !== "number" || !Number.isInteger(body.quota) || body.quota < 0) {
      return jsonResponse({ error: "quotaId and a non-negative integer quota are required." }, { status: 400 });
    }
    const { data, error } = await client.rpc("set_franchise_slot_quota", {
      p_franchise_slot_quota_id: body.quotaId,
      p_quota: body.quota,
      p_actor: session.name,
    });
    if (error) return jsonResponse({ error: error.message }, { status: 409 });
    auditCapacityChange(session.name, "slot.franchise_quota.updated.v1", body.quotaId, `Franchise slot quota set to ${body.quota}.`);
    return jsonResponse({ data });
  }

  if (body.action === "set_station_quota") {
    if (session.role !== "Franchise Admin") {
      return jsonResponse({ error: "Only franchise accounts can allocate station slot quotas." }, { status: 403 });
    }
    if (!body.quotaId || typeof body.quota !== "number" || !Number.isInteger(body.quota) || body.quota < 0) {
      return jsonResponse({ error: "quotaId and a non-negative integer quota are required." }, { status: 400 });
    }

    const { data: stationQuota, error: stationError } = await client
      .from("slot_station_quotas")
      .select("id,franchise_slot_quota_id")
      .eq("id", body.quotaId)
      .maybeSingle();
    if (stationError) return jsonResponse({ error: stationError.message }, { status: 500 });
    if (!stationQuota) return jsonResponse({ error: "Station slot quota not found." }, { status: 404 });

    const { data: franchiseQuota, error: franchiseError } = await client
      .from("slot_franchise_quotas")
      .select("franchise_tenant_id")
      .eq("id", stationQuota.franchise_slot_quota_id)
      .single();
    if (franchiseError) return jsonResponse({ error: franchiseError.message }, { status: 500 });
    if (franchiseQuota.franchise_tenant_id !== session.tenantId) {
      return jsonResponse({ error: "This station quota belongs to another franchise." }, { status: 403 });
    }

    const { data, error } = await client.rpc("set_station_slot_quota", {
      p_station_slot_quota_id: body.quotaId,
      p_quota: body.quota,
      p_actor: session.name,
    });
    if (error) return jsonResponse({ error: error.message }, { status: 409 });
    auditCapacityChange(session.name, "slot.station_quota.updated.v1", body.quotaId, `Station slot quota set to ${body.quota}.`);
    return jsonResponse({ data });
  }

  if (body.action === "upsert_station_quota") {
    if (session.role !== "Franchise Admin") {
      return jsonResponse({ error: "Only franchise accounts can allocate station slot quotas." }, { status: 403 });
    }
    if (
      !body.franchiseQuotaId ||
      !body.stationTenantId ||
      typeof body.quota !== "number" ||
      !Number.isInteger(body.quota) ||
      body.quota < 0
    ) {
      return jsonResponse({ error: "franchiseQuotaId, stationTenantId and a non-negative integer quota are required." }, { status: 400 });
    }
    const { data: franchiseQuota, error: franchiseError } = await client
      .from("slot_franchise_quotas")
      .select("id,franchise_tenant_id")
      .eq("id", body.franchiseQuotaId)
      .maybeSingle();
    if (franchiseError) return jsonResponse({ error: franchiseError.message }, { status: 500 });
    if (!franchiseQuota) return jsonResponse({ error: "Franchise slot quota not found." }, { status: 404 });
    if (franchiseQuota.franchise_tenant_id !== session.tenantId) {
      return jsonResponse({ error: "This slot quota belongs to another franchise." }, { status: 403 });
    }
    if (body.quota === 0) {
      const { data: existingStationQuota, error: existingError } = await client
        .from("slot_station_quotas")
        .select("id")
        .eq("franchise_slot_quota_id", body.franchiseQuotaId)
        .eq("station_tenant_id", body.stationTenantId)
        .maybeSingle();
      if (existingError) return jsonResponse({ error: existingError.message }, { status: 500 });
      if (!existingStationQuota) return jsonResponse({ data: null });
    }

    const { data, error } = await client.rpc("upsert_station_slot_quota", {
      p_franchise_slot_quota_id: body.franchiseQuotaId,
      p_station_tenant_id: body.stationTenantId,
      p_quota: body.quota,
      p_actor: session.name,
    });
    if (error) return jsonResponse({ error: error.message }, { status: 409 });
    auditCapacityChange(session.name, "slot.station_quota.upserted.v1", body.franchiseQuotaId, `${body.stationTenantId} quota set to ${body.quota}.`);
    return jsonResponse({ data });
  }

  if (body.action === "set_cycle_status") {
    if (session.role !== "Super Admin") {
      return jsonResponse({ error: "Only headquarters can publish or close a schedule week." }, { status: 403 });
    }
    if (!body.cycleId || !body.status) {
      return jsonResponse({ error: "cycleId and status are required." }, { status: 400 });
    }
    const { data, error } = await client.rpc("set_slot_cycle_status", {
      p_cycle_id: body.cycleId,
      p_status: body.status,
      p_actor: session.name,
    });
    if (error) return jsonResponse({ error: error.message }, { status: 409 });
    auditCapacityChange(session.name, "slot.cycle_status.updated.v1", body.cycleId, `Schedule week status changed to ${body.status}.`);
    return jsonResponse({ data });
  }

  if (session.role !== "Super Admin") {
    return jsonResponse({ error: "Only headquarters can create the next slot week." }, { status: 403 });
  }
  if (!body.sourceWeekStart) {
    return jsonResponse({ error: "sourceWeekStart is required." }, { status: 400 });
  }
  const targetWeekStart = addDays(body.sourceWeekStart, 7);
  const { data, error } = await client.rpc("clone_slot_week", {
    p_source_week_start: body.sourceWeekStart,
    p_target_week_start: targetWeekStart,
    p_actor: session.name,
  });
  if (error) return jsonResponse({ error: error.message }, { status: 409 });
  auditCapacityChange(session.name, "slot.week.cloned.v1", String(data?.cycleId ?? targetWeekStart), `Schedule week ${targetWeekStart} created from ${body.sourceWeekStart}.`);
  return jsonResponse({ data }, { status: 201 });
}

function auditCapacityChange(actor: string, action: string, entityId: string, detail: string) {
  appendServerAudit({
    actor,
    action,
    entity: "SlotCapacity",
    entityId,
    detail,
    risk: "Medium",
  });
}

async function parentTenantForStation(stationTenantId: string) {
  const client = getSupabaseServerClient();
  const { data } = await client
    .from("tenants")
    .select("parent_tenant_id")
    .eq("id", stationTenantId)
    .maybeSingle();
  return String(data?.parent_tenant_id ?? "");
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function hasSupabase() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
