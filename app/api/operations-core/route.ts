import { fallbackOperationsCore, type OperationsCoreState } from "../../lib/operations-core";
import { jsonResponse, makeServerId } from "../../lib/server/memory";
import { getSupabaseServerClient } from "../../lib/supabase/server";

type ActionBody =
  | {
      action: "create_import_batch";
      businessDate: string;
      provider: string;
      orderRows: number;
      riderRows: number;
      financeRows: number;
      uploadedBy?: string;
    }
  | {
      action: "allocate_franchise_quota";
      cycleId: string;
      franchiseTenantId: string;
      quota: number;
      allocatedBy?: string;
    }
  | {
      action: "allocate_station_quota";
      franchiseAllocationId: string;
      stationTenantId: string;
      quota: number;
      allocatedBy?: string;
    }
  | {
      action: "generate_whitelist";
      cycleId: string;
      generatedBy?: string;
    };

export async function GET() {
  return jsonResponse({ data: await loadOperationsCore() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ActionBody | null;
  if (!body?.action) return jsonResponse({ error: "action is required" }, { status: 400 });
  if (!hasSupabase()) return jsonResponse({ error: "Supabase is required for this operation." }, { status: 503 });

  const client = getSupabaseServerClient();

  if (body.action === "create_import_batch") {
    if (!body.businessDate || !body.provider) {
      return jsonResponse({ error: "businessDate and provider are required" }, { status: 400 });
    }
    const id = `imp-${body.businessDate.replaceAll("-", "")}-${Date.now().toString(36)}`;
    const { data, error } = await client
      .from("external_import_batches")
      .insert({
        id,
        provider: body.provider,
        business_date: body.businessDate,
        status: "uploaded",
        order_rows: Math.max(0, body.orderRows ?? 0),
        rider_rows: Math.max(0, body.riderRows ?? 0),
        finance_rows: Math.max(0, body.financeRows ?? 0),
        uploaded_by: body.uploadedBy ?? "HQ Operations",
      })
      .select("*")
      .single();
    if (error) return jsonResponse({ error: error.message }, { status: 409 });
    return jsonResponse({ data }, { status: 201 });
  }

  if (body.action === "allocate_franchise_quota") {
    const state = await loadOperationsCore();
    const cycle = state.quotaCycles.find((item) => item.id === body.cycleId);
    if (!cycle) return jsonResponse({ error: "Quota cycle not found." }, { status: 404 });
    const otherAllocated = state.franchiseQuotas
      .filter((item) => item.cycleId === body.cycleId && item.franchiseId !== body.franchiseTenantId)
      .reduce((sum, item) => sum + item.quota, 0);
    if (otherAllocated + body.quota > cycle.platformCapacity) {
      return jsonResponse({ error: "Franchise quota exceeds platform capacity." }, { status: 409 });
    }
    const id = `fqa-${body.cycleId}-${body.franchiseTenantId}`;
    const { data, error } = await client
      .from("franchise_quota_allocations")
      .upsert({
        id,
        cycle_id: body.cycleId,
        franchise_tenant_id: body.franchiseTenantId,
        quota: body.quota,
        allocated_by: body.allocatedBy ?? "HQ Operations",
      }, { onConflict: "cycle_id,franchise_tenant_id" })
      .select("*")
      .single();
    if (error) return jsonResponse({ error: error.message }, { status: 409 });
    return jsonResponse({ data });
  }

  if (body.action === "allocate_station_quota") {
    const state = await loadOperationsCore();
    const franchiseQuota = state.franchiseQuotas.find((item) => item.id === body.franchiseAllocationId);
    if (!franchiseQuota) return jsonResponse({ error: "Franchise allocation not found." }, { status: 404 });
    const otherAllocated = state.stationQuotas
      .filter((item) => item.franchiseAllocationId === body.franchiseAllocationId && item.stationId !== body.stationTenantId)
      .reduce((sum, item) => sum + item.quota, 0);
    if (otherAllocated + body.quota > franchiseQuota.quota) {
      return jsonResponse({ error: "Station quota exceeds franchise allocation." }, { status: 409 });
    }
    const id = `sqa-${body.franchiseAllocationId}-${body.stationTenantId}`;
    const { data, error } = await client
      .from("station_quota_allocations")
      .upsert({
        id,
        franchise_allocation_id: body.franchiseAllocationId,
        station_tenant_id: body.stationTenantId,
        quota: body.quota,
        allocated_by: body.allocatedBy ?? "Franchise Operations",
      }, { onConflict: "franchise_allocation_id,station_tenant_id" })
      .select("*")
      .single();
    if (error) return jsonResponse({ error: error.message }, { status: 409 });
    return jsonResponse({ data });
  }

  const { data: readyRows, error: readyError } = await client
    .from("slot_enrollments")
    .select("id")
    .eq("status", "hq_reviewed")
    .in("whitelist_status", ["not_ready", "ready"]);
  if (readyError) return jsonResponse({ error: readyError.message }, { status: 500 });

  const exportId = makeServerId("wlexp", (readyRows ?? []).length + 1);
  const checksum = `${body.cycleId}-${(readyRows ?? []).map((item) => item.id).join("-")}`;
  const fileName = `meponto-whitelist-${body.cycleId}.csv`;
  const { data: exportRow, error: exportError } = await client
    .from("whitelist_exports")
    .insert({
      id: exportId,
      cycle_id: body.cycleId,
      status: "generated",
      row_count: readyRows?.length ?? 0,
      file_name: fileName,
      checksum,
      generated_by: body.generatedBy ?? "HQ Operations",
    })
    .select("*")
    .single();
  if (exportError) return jsonResponse({ error: exportError.message }, { status: 409 });

  if (readyRows?.length) {
    await client
      .from("slot_enrollments")
      .update({ whitelist_status: "exported", whitelist_export_id: exportId })
      .in("id", readyRows.map((item) => item.id));
  }

  return jsonResponse({ data: exportRow }, { status: 201 });
}

async function loadOperationsCore(): Promise<OperationsCoreState> {
  if (!hasSupabase()) return fallbackOperationsCore;

  try {
    const client = getSupabaseServerClient();
    const [batchResult, ruleResult, cycleResult, franchiseResult, stationResult, tenantResult, exportResult, enrollmentResult] =
      await Promise.all([
        client.from("external_import_batches").select("*").order("business_date", { ascending: false }).limit(10),
        client.from("kpi_rule_sets").select("*").order("version", { ascending: false }),
        client.from("quota_cycles").select("*").order("business_week_start", { ascending: false }),
        client.from("franchise_quota_allocations").select("*"),
        client.from("station_quota_allocations").select("*"),
        client.from("tenants").select("id,name"),
        client.from("whitelist_exports").select("*").order("generated_at", { ascending: false }).limit(10),
        client.from("slot_enrollments").select("status,whitelist_status"),
      ]);

    const failed = [batchResult, ruleResult, cycleResult, franchiseResult, stationResult, tenantResult, exportResult, enrollmentResult]
      .find((result) => result.error);
    if (failed?.error) return fallbackOperationsCore;

    const tenants = new Map((tenantResult.data ?? []).map((item) => [item.id, item.name]));
    const stationTotals = new Map<string, number>();
    for (const row of stationResult.data ?? []) {
      stationTotals.set(row.franchise_allocation_id, (stationTotals.get(row.franchise_allocation_id) ?? 0) + row.quota);
    }

    const importBatches = (batchResult.data ?? []).map((row) => ({
      id: row.id,
      provider: row.provider,
      businessDate: row.business_date,
      status: row.status,
      orderRows: row.order_rows,
      riderRows: row.rider_rows,
      financeRows: row.finance_rows,
      matchedRiders: row.matched_riders,
      unknownRiders: row.unknown_riders,
      warnings: row.warning_count,
      uploadedBy: row.uploaded_by,
    }));
    const quotaCycles = (cycleResult.data ?? []).map((row) => ({
      id: row.id,
      externalScheduleRef: row.external_schedule_ref,
      name: row.name,
      weekStart: row.business_week_start,
      weekEnd: row.business_week_end,
      platformCapacity: row.platform_capacity,
      status: row.status,
    }));
    const franchiseQuotas = (franchiseResult.data ?? []).map((row) => {
      const stationAllocated = stationTotals.get(row.id) ?? 0;
      return {
        id: row.id,
        cycleId: row.cycle_id,
        franchiseId: row.franchise_tenant_id,
        franchiseName: tenants.get(row.franchise_tenant_id) ?? row.franchise_tenant_id,
        quota: row.quota,
        stationAllocated,
        remaining: row.quota - stationAllocated,
      };
    });
    const stationQuotas = (stationResult.data ?? []).map((row) => ({
      id: row.id,
      franchiseAllocationId: row.franchise_allocation_id,
      stationId: row.station_tenant_id,
      stationName: tenants.get(row.station_tenant_id) ?? row.station_tenant_id,
      quota: row.quota,
    }));
    const currentCycle = quotaCycles[0];
    const currentFranchiseQuotas = franchiseQuotas.filter((item) => item.cycleId === currentCycle?.id);
    const latestBatch = importBatches[0];
    const enrollments = enrollmentResult.data ?? [];

    return {
      source: "supabase",
      importBatches,
      kpiRules: (ruleResult.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        version: row.version,
        status: row.status,
        minCompletedOrders: row.min_completed_orders,
        minAttendanceMinutes: row.min_attendance_minutes,
        minAcceptanceRate: Number(row.min_acceptance_rate),
        maxCancellationRate: Number(row.max_cancellation_rate),
        pointsReward: row.points_reward,
      })),
      quotaCycles,
      franchiseQuotas,
      stationQuotas,
      whitelistExports: (exportResult.data ?? []).map((row) => ({
        id: row.id,
        cycleId: row.cycle_id,
        status: row.status,
        rowCount: row.row_count,
        fileName: row.file_name,
        generatedBy: row.generated_by,
        generatedAt: String(row.generated_at).slice(0, 16).replace("T", " "),
      })),
      summary: {
        latestBusinessDate: latestBatch?.businessDate ?? "-",
        importedRows: latestBatch ? latestBatch.orderRows + latestBatch.riderRows + latestBatch.financeRows : 0,
        unknownRiders: latestBatch?.unknownRiders ?? 0,
        platformCapacity: currentCycle?.platformCapacity ?? 0,
        franchiseAllocated: currentFranchiseQuotas.reduce((sum, item) => sum + item.quota, 0),
        stationAllocated: currentFranchiseQuotas.reduce((sum, item) => sum + item.stationAllocated, 0),
        approvedEnrollments: enrollments.filter((item) => item.status === "hq_reviewed").length,
        readyForExport: enrollments.filter((item) => item.status === "hq_reviewed" && item.whitelist_status !== "exported").length,
      },
    };
  } catch {
    return fallbackOperationsCore;
  }
}

function hasSupabase() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

